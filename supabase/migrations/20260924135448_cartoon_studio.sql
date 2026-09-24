-- Private prompt-to-cartoon projects. Apply after jobs_cancellation.
create table public.cartoon_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id),
  title text not null, brief jsonb not null, storyboard jsonb,
  cast_paths jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','planning','ready','rendering','complete','failed')),
  generation_id uuid references public.generations(id), output_path text, error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index cartoon_projects_user_created on public.cartoon_projects(user_id,created_at desc);
create index cartoon_projects_workspace on public.cartoon_projects(workspace_id);
create index cartoon_projects_generation on public.cartoon_projects(generation_id);
alter table public.cartoon_projects enable row level security;
create policy cartoon_read_own on public.cartoon_projects for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.cartoon_projects from anon, authenticated;
grant select on public.cartoon_projects to authenticated;
grant all on public.cartoon_projects to service_role;
create trigger cartoon_updated before update on public.cartoon_projects for each row execute function private.set_updated_at();

-- Existing storage policies let members manage their own uploads. Worker
-- checkpoints must not be editable by a browser (including signed uploads).
-- Restrictive policies compose with the existing ownership policies using AND.
create policy cartoon_worker_storage_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'private-media' or (storage.foldername(name))[3] is distinct from 'cartoons');
create policy cartoon_worker_storage_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'private-media' or (storage.foldername(name))[3] is distinct from 'cartoons')
  with check (bucket_id <> 'private-media' or (storage.foldername(name))[3] is distinct from 'cartoons');
create policy cartoon_worker_storage_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'private-media' or (storage.foldername(name))[3] is distinct from 'cartoons');

create function public.start_cartoon_job(project_id uuid, owner_id uuid, job_id uuid, job_kind text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare p public.cartoon_projects; cost numeric; balance numeric; duration integer;
begin
  if job_kind not in ('plan','render') then raise exception 'Invalid operation'; end if;
  select * into p from public.cartoon_projects where id=project_id and user_id=owner_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.status in ('planning','rendering') then return p.generation_id; end if;
  if (select count(*) from public.generations where requested_by=owner_id and created_at>now()-interval '1 day' and operation like 'cartoon-%') >= 50 then raise exception 'Daily generation limit reached'; end if;
  if job_kind='plan' and p.storyboard is not null then raise exception 'Cast already created. Create a new project to redesign it.'; end if;
  duration := (p.brief->>'duration')::integer;
  if duration is null or duration not in (15,30,60) or p.brief->>'model' is null or p.brief->>'model' not in ('kling-o3','seedance-2.5') then raise exception 'Invalid cartoon settings'; end if;
  if job_kind='render' and (p.storyboard is null or p.cast_paths='{}'::jsonb) then raise exception 'Create your cast and review the storyboard first'; end if;
  -- Mirrored in cartoons/schema.ts and checked by the database tests. Never client-supplied.
  cost := case when job_kind='plan' then 40 else duration * case when p.brief->>'model'='kling-o3' then 8 else 24 end end;
  select cached_balance into balance from public.credit_accounts where workspace_id=p.workspace_id for update;
  if balance is null or balance<cost then raise exception 'Not enough credits. Add a plan in your profile.'; end if;
  if (select count(*) from public.generations where workspace_id=p.workspace_id and status in ('created','reserved','submitted','processing'))>=2 then raise exception 'Two jobs are already running. Please wait.'; end if;
  insert into public.generations(id,workspace_id,requested_by,operation,provider,model,settings,status,idempotency_key,estimated_credits)
    values(job_id,p.workspace_id,owner_id,'cartoon-'||job_kind,'fal',case when job_kind='plan' then 'gemini+gpt-image-2.5-sunburst' else p.brief->>'model' end,
    jsonb_build_object('projectId',p.id,'projectTitle',p.title,'kind',job_kind,'brief',p.brief,'storyboard',p.storyboard,'castPaths',p.cast_paths),'reserved',job_id::text,cost);
  insert into public.credit_ledger(workspace_id,generation_id,kind,amount,idempotency_key) values(p.workspace_id,job_id,'reservation',-cost,job_id::text||':reserve');
  update public.credit_accounts set cached_balance=cached_balance-cost,updated_at=now() where workspace_id=p.workspace_id;
  update public.cartoon_projects set status=case when job_kind='plan' then 'planning' else 'rendering' end,generation_id=job_id,error_message=null where id=p.id;
  return job_id;
end; $$;

create or replace function public.request_generation_cancellation(job_id uuid, owner_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare g public.generations;
begin
  select * into g from public.generations where id=job_id and requested_by=owner_id
    and operation in ('faceless-script','faceless-render','episode-export','cartoon-plan','cartoon-render') for update;
  if g.id is null then raise exception 'Job not found' using errcode='P0002'; end if;
  if g.status not in ('succeeded','failed','cancelled') then
    update public.generations set cancel_requested_at=coalesce(cancel_requested_at,now()) where id=job_id;
  end if;
  return jsonb_build_object('status',g.status,'runId',g.provider_request_id);
end; $$;

create or replace function public.confirm_generation_cancellation(job_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare g public.generations;
begin
  -- Always project -> generation -> credit account, matching start/finish.
  perform 1 from public.faceless_projects where generation_id=job_id for update;
  perform 1 from public.cartoon_projects where generation_id=job_id for update;
  select * into g from public.generations where id=job_id for update;
  if g.id is null then raise exception 'Job not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return g.status::text; end if;
  if g.cancel_requested_at is null then raise exception 'Cancellation was not requested'; end if;
  perform private.settle_generation_credits(job_id,0,job_id::text||':cancel-settlement');
  update public.generations set status='cancelled',completed_at=now(),error_message='Cancelled by user',output_asset_ids='{}' where id=job_id;
  update public.faceless_projects set status=case when storyboard is null then 'draft' else 'ready' end,
    output_path=null,error_message='Job cancelled. Reserved credits were returned. You can edit and try again.' where generation_id=job_id;
  update public.cartoon_projects set status=case when storyboard is null then 'draft' else 'ready' end,
    error_message='Job cancelled. Reserved credits were returned. You can edit and try again.' where generation_id=job_id;
  update public.assets set deleted_at=now() where id=any(g.output_asset_ids) and kind='export';
  return 'cancelled';
end; $$;

create function public.finish_cartoon_job(job_id uuid, succeeded boolean, result_storyboard jsonb default null, result_cast jsonb default null, result_path text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare g public.generations;
begin
  perform 1 from public.cartoon_projects where generation_id=job_id for update;
  select * into g from public.generations where id=job_id and operation in ('cartoon-plan','cartoon-render') for update;
  if g.id is null then raise exception 'Job not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return; end if;
  if g.cancel_requested_at is not null then perform public.confirm_generation_cancellation(job_id); return; end if;
  if succeeded and g.operation='cartoon-plan' and (result_storyboard is null or result_cast is null or result_cast='{}'::jsonb) then raise exception 'Missing cast or storyboard'; end if;
  if succeeded and g.operation='cartoon-render' and (result_path is null or result_path not like g.workspace_id::text||'/'||g.requested_by::text||'/cartoons/'||job_id::text||'/%') then raise exception 'Invalid video path'; end if;
  perform private.settle_generation_credits(job_id,case when succeeded then g.estimated_credits else 0 end,job_id::text||':settle');
  update public.generations set status=case when succeeded then 'succeeded'::public.generation_status else 'failed'::public.generation_status end,completed_at=now() where id=job_id;
  update public.cartoon_projects set status=case when not succeeded then 'failed' when g.operation='cartoon-plan' then 'ready' else 'complete' end,
    storyboard=case when succeeded then coalesce(result_storyboard,storyboard) else storyboard end,
    cast_paths=case when succeeded then coalesce(result_cast,cast_paths) else cast_paths end,
    title=case when succeeded then coalesce(result_storyboard->>'title',title) else title end,
    output_path=case when succeeded then coalesce(result_path,output_path) else output_path end,
    error_message=case when succeeded then null else 'Generation failed. Reserved credits were returned. Review your storyboard or contact support with the job ID.' end
    where generation_id=job_id;
end; $$;
revoke all on function public.start_cartoon_job(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.finish_cartoon_job(uuid,boolean,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.request_generation_cancellation(uuid,uuid) from public,anon,authenticated;
revoke all on function public.confirm_generation_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.start_cartoon_job(uuid,uuid,uuid,text) to service_role;
grant execute on function public.finish_cartoon_job(uuid,boolean,jsonb,jsonb,text) to service_role;
grant execute on function public.request_generation_cancellation(uuid,uuid) to service_role;
grant execute on function public.confirm_generation_cancellation(uuid) to service_role;
