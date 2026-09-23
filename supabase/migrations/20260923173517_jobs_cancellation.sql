-- Apply after the faceless/Stripe migration. Deploy both updated workers before
-- enabling the new Jobs UI. No existing jobs or balances are changed here.
alter table public.generations add column cancel_requested_at timestamptz;
create index generations_requester_history on public.generations (requested_by, created_at desc, id desc);

-- Enforce monotonic terminal state even if a late/older worker attempts a plain
-- UPDATE instead of the guarded RPC. Metadata-only accounting updates are fine.
create function private.guard_generation_terminal_state()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status in ('succeeded','failed','cancelled') and
      (new.status is distinct from old.status or new.output_asset_ids is distinct from old.output_asset_ids) then
    raise exception 'A terminal job cannot be restarted or publish new output';
  end if;
  if old.cancel_requested_at is not null and new.cancel_requested_at is distinct from old.cancel_requested_at then
    raise exception 'A cancellation request cannot be cleared';
  end if;
  return new;
end; $$;
revoke all on function private.guard_generation_terminal_state() from public, anon, authenticated;
create trigger generations_terminal_guard before update on public.generations
  for each row execute function private.guard_generation_terminal_state();

-- Reserve only while the same locked job is still runnable. A cancellation
-- racing the first reservation must not be followed by a new credit deduction.
create or replace function private.reserve_generation_credits(target_workspace_id uuid, target_generation_id uuid, credits numeric, ledger_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare g public.generations; account_balance numeric;
begin
  if not (select private.is_workspace_member(target_workspace_id)) then raise exception 'workspace access denied' using errcode = '42501'; end if;
  select * into g from public.generations where id = target_generation_id and workspace_id = target_workspace_id and requested_by = (select auth.uid()) for update;
  if g.id is null then raise exception 'generation access denied' using errcode = '42501'; end if;
  if g.status in ('succeeded','failed','cancelled') or g.cancel_requested_at is not null or g.reported_credits is not null then raise exception 'Job is no longer runnable'; end if;
  if credits <= 0 then raise exception 'credits must be positive'; end if;
  if exists (select 1 from public.credit_ledger where idempotency_key = ledger_idempotency_key and generation_id = target_generation_id and kind = 'reservation') then return target_generation_id; end if;
  select cached_balance into account_balance from public.credit_accounts where workspace_id = target_workspace_id for update;
  if account_balance is null or account_balance < credits then raise exception 'insufficient credits' using errcode = 'P0001'; end if;
  insert into public.credit_ledger (workspace_id,generation_id,kind,amount,idempotency_key)
    values (target_workspace_id,target_generation_id,'reservation',-credits,ledger_idempotency_key)
    on conflict (idempotency_key) do nothing;
  if found then
    update public.credit_accounts set cached_balance = cached_balance - credits, updated_at = now() where workspace_id = target_workspace_id;
    update public.generations set status = 'reserved' where id = target_generation_id and status = 'created';
  end if;
  return target_generation_id;
end; $$;

-- All mutation functions are service-role-only; the HTTP boundary authenticates
-- the user, and this function checks the owner again inside the transaction.
create function public.request_generation_cancellation(job_id uuid, owner_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare g public.generations;
begin
  select * into g from public.generations where id = job_id and requested_by = owner_id
    and operation in ('faceless-script','faceless-render','episode-export') for update;
  if g.id is null then raise exception 'Job not found' using errcode = 'P0002'; end if;
  if g.status not in ('succeeded','failed','cancelled') then
    update public.generations set cancel_requested_at = coalesce(cancel_requested_at, now()) where id = job_id;
  end if;
  return jsonb_build_object('status',g.status,'runId',g.provider_request_id);
end; $$;

-- Call only once worker cancellation/termination is confirmed. Cancellation,
-- project unlock and reservation release commit together, and are repeat-safe.
create function public.confirm_generation_cancellation(job_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare g public.generations;
begin
  -- Same project -> generation -> credit account lock order as job start/finish.
  perform 1 from public.faceless_projects where generation_id = job_id for update;
  select * into g from public.generations where id = job_id for update;
  if g.id is null then raise exception 'Job not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return g.status::text; end if;
  if g.cancel_requested_at is null then raise exception 'Cancellation was not requested'; end if;
  perform private.settle_generation_credits(job_id, 0, job_id::text || ':cancel-settlement');
  update public.generations set status = 'cancelled', completed_at = now(), error_message = 'Cancelled by user', output_asset_ids = '{}' where id = job_id;
  update public.faceless_projects set status = case when storyboard is null then 'draft' else 'ready' end,
    output_path = null, error_message = 'Job cancelled. Reserved credits were returned. You can edit and try again.'
    where generation_id = job_id;
  update public.assets set deleted_at = now() where id = any(g.output_asset_ids) and kind = 'export';
  return 'cancelled';
end; $$;

-- Workers register their run before doing any paid work. A queued/retried worker
-- can never overwrite a cancellation or resurrect a terminal job.
create function public.claim_generation_job(job_id uuid, run_id text, attempt integer default 1)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.generations set status = 'processing', provider_request_id = run_id,
    submitted_at = coalesce(submitted_at, now()), attempt_count = attempt
    where id = job_id and status in ('created','reserved','submitted','processing') and cancel_requested_at is null
      and (provider_request_id is null or provider_request_id = run_id);
  return found;
end; $$;

create or replace function public.finish_faceless_job(job_id uuid, succeeded boolean, result_storyboard jsonb default null, result_path text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare g public.generations; next_status text;
begin
  perform 1 from public.faceless_projects where generation_id = job_id for update;
  select * into g from public.generations where id = job_id and operation in ('faceless-script','faceless-render') for update;
  if g.id is null then raise exception 'Generation not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return; end if;
  if g.cancel_requested_at is not null then
    perform public.confirm_generation_cancellation(job_id);
    return;
  end if;
  if succeeded and g.operation = 'faceless-script' and result_storyboard is null then raise exception 'Missing storyboard'; end if;
  if succeeded and g.operation = 'faceless-render' and result_path is null then raise exception 'Missing output'; end if;
  perform private.settle_generation_credits(job_id, case when succeeded then g.estimated_credits else 0 end, job_id::text || ':settle');
  update public.generations set status = case when succeeded then 'succeeded'::public.generation_status else 'failed'::public.generation_status end, completed_at = now() where id = job_id;
  next_status := case when not succeeded then 'failed' when g.operation = 'faceless-script' then 'ready' else 'complete' end;
  update public.faceless_projects set status = next_status,
    storyboard = coalesce(result_storyboard, storyboard), output_path = case when succeeded and result_path is not null then result_path else output_path end,
    title = coalesce(result_storyboard->>'title', title),
    error_message = case when succeeded then null else 'Generation failed. Reserved credits were returned. You can edit and try again.' end
    where generation_id = job_id;
end; $$;

create function public.finish_episode_job(job_id uuid, succeeded boolean, output_asset_id uuid default null, failure_message text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare g public.generations;
begin
  select * into g from public.generations where id = job_id and operation = 'episode-export' for update;
  if g.id is null then raise exception 'Job not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return; end if;
  if g.cancel_requested_at is not null then
    perform public.confirm_generation_cancellation(job_id);
    return;
  end if;
  if succeeded and (output_asset_id is null or not output_asset_id = any(g.output_asset_ids)) then raise exception 'Invalid output asset'; end if;
  perform private.settle_generation_credits(job_id, case when succeeded then g.estimated_credits else 0 end, job_id::text || ':final-settlement');
  update public.generations set status = case when succeeded then 'succeeded'::public.generation_status else 'failed'::public.generation_status end,
    completed_at = now(), error_message = case when succeeded then null else left(failure_message, 1000) end,
    output_asset_ids = case when succeeded then array[output_asset_id] else '{}'::uuid[] end where id = job_id;
  if not succeeded then update public.assets set deleted_at = now() where id = any(g.output_asset_ids) and kind = 'export'; end if;
end; $$;

revoke all on function public.request_generation_cancellation(uuid,uuid) from public, anon, authenticated;
revoke all on function public.confirm_generation_cancellation(uuid) from public, anon, authenticated;
revoke all on function public.claim_generation_job(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.finish_faceless_job(uuid,boolean,jsonb,text) from public, anon, authenticated;
revoke all on function public.finish_episode_job(uuid,boolean,uuid,text) from public, anon, authenticated;
grant execute on function public.request_generation_cancellation(uuid,uuid) to service_role;
grant execute on function public.confirm_generation_cancellation(uuid) to service_role;
grant execute on function public.claim_generation_job(uuid,text,integer) to service_role;
grant execute on function public.finish_faceless_job(uuid,boolean,jsonb,text) to service_role;
grant execute on function public.finish_episode_job(uuid,boolean,uuid,text) to service_role;
