-- Additive migration: existing projects and credit balances are not changed.
create table public.ugc_projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id), title text not null, brief jsonb not null,
  plan jsonb, presenter_path text, outputs jsonb not null default '{}', revision integer not null default 0,
  status text not null default 'draft' check(status in ('draft','planning','ready','rendering','complete','failed')),
  generation_id uuid references public.generations(id), error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index ugc_projects_user_created on public.ugc_projects(user_id,created_at desc);
create index ugc_projects_workspace on public.ugc_projects(workspace_id);
create index ugc_projects_generation on public.ugc_projects(generation_id);
alter table public.ugc_projects enable row level security;
create policy ugc_read_own on public.ugc_projects for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.ugc_projects from anon,authenticated;
grant select on public.ugc_projects to authenticated;
grant all on public.ugc_projects to service_role;
create trigger ugc_updated before update on public.ugc_projects for each row execute function private.set_updated_at();

create table public.ugc_import_attempts(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create index ugc_imports_user_created on public.ugc_import_attempts(user_id,created_at);
alter table public.ugc_import_attempts enable row level security;
revoke all on public.ugc_import_attempts from anon,authenticated;
grant all on public.ugc_import_attempts to service_role;
create function public.reserve_ugc_import(owner_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':ugc-import',0));
  if (select count(*) from public.ugc_import_attempts where user_id=owner_id and created_at>now()-interval '1 day')>=30 then raise exception 'Product import daily limit reached. Upload photos instead.'; end if;
  insert into public.ugc_import_attempts(user_id) values(owner_id);
end; $$;

-- Inputs are created by a server-issued, non-upsert signed upload. Browsers may
-- read their own inputs, but cannot replace approved photos or worker results.
create policy ugc_storage_insert on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('ugc','ugc-inputs'));
create policy ugc_storage_update on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('ugc','ugc-inputs'))
  with check(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('ugc','ugc-inputs'));
create policy ugc_storage_delete on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('ugc','ugc-inputs'));

create function public.save_ugc_plan(project_id uuid, owner_id uuid, expected_revision integer, next_plan jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.ugc_projects;
begin
  select * into p from public.ugc_projects where id=project_id and user_id=owner_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.status in ('planning','rendering') then raise exception 'Wait for the current job to finish before editing.'; end if;
  if p.plan is null or next_plan is null then raise exception 'Create the ad plan first.'; end if;
  if p.revision<>expected_revision then raise exception 'This plan changed in another tab. Refresh before saving.'; end if;
  update public.ugc_projects set plan=next_plan,title=left(next_plan->>'title',100),revision=revision+1,status='ready',error_message=null where id=p.id;
end; $$;

create function public.start_ugc_job(project_id uuid, owner_id uuid, job_id uuid, job_kind text, hook_ids text[] default '{}', expected_revision integer default 0)
returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.ugc_projects; cost numeric; balance numeric; seconds integer; n integer;
begin
  if job_kind is null or job_kind not in ('plan','render') then raise exception 'Invalid operation'; end if;
  select * into p from public.ugc_projects where id=project_id and user_id=owner_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.status in ('planning','rendering') then
    if (p.status='planning')<>(job_kind='plan') then raise exception 'Another stage is already running.'; end if;
    return p.generation_id;
  end if;
  if p.revision<>expected_revision then raise exception 'Plan changed. Refresh before generating.'; end if;
  if job_kind='plan' and p.plan is not null then raise exception 'Your plan is already created. Edit it or start a new project.'; end if;
  seconds:=(p.brief->>'duration')::integer;
  if seconds is null or seconds not in (15,30) then raise exception 'Invalid ad duration'; end if;
  n:=coalesce(array_length(hook_ids,1),0);
  if job_kind='render' then
    if p.plan is null or p.presenter_path is null then raise exception 'Create and review the presenter and hooks first.'; end if;
    if n<1 or n>3 or exists(select 1 from unnest(hook_ids) h where h is null or h not in ('hook-1','hook-2','hook-3'))
      or n<>(select count(distinct h) from unnest(hook_ids) h) then raise exception 'Select one to three different hooks.'; end if;
  end if;
  cost:=case when job_kind='plan' then 20 else seconds*8*n end;
  select cached_balance into balance from public.credit_accounts where workspace_id=p.workspace_id for update;
  if balance is null or balance<cost then raise exception 'Not enough credits. Add a plan in your profile.'; end if;
  if (select count(*) from public.generations where workspace_id=p.workspace_id and status in ('created','reserved','submitted','processing'))>=2 then raise exception 'Two jobs are already running. Please wait.'; end if;
  if (select count(*) from public.generations where requested_by=owner_id and operation like 'ugc-%' and created_at>now()-interval '1 day')>=30 then raise exception 'Daily ad-generation limit reached.'; end if;
  insert into public.generations(id,workspace_id,requested_by,operation,provider,model,settings,status,idempotency_key,estimated_credits)
    values(job_id,p.workspace_id,owner_id,'ugc-'||job_kind,'fal',case when job_kind='plan' then 'gemini+gpt-image-2.5-sunburst' else 'kling-ai-avatar-v2-pro' end,
    jsonb_build_object('projectId',p.id,'projectTitle',p.title,'kind',job_kind,'brief',p.brief,'plan',p.plan,'presenterPath',p.presenter_path,'hookIds',to_jsonb(hook_ids),'revision',p.revision),
    'reserved',job_id::text,cost);
  insert into public.credit_ledger(workspace_id,generation_id,kind,amount,idempotency_key) values(p.workspace_id,job_id,'reservation',-cost,job_id::text||':reserve');
  update public.credit_accounts set cached_balance=cached_balance-cost,updated_at=now() where workspace_id=p.workspace_id;
  update public.ugc_projects set status=case when job_kind='plan' then 'planning' else 'rendering' end,generation_id=job_id,error_message=null where id=p.id;
  return job_id;
end; $$;

create or replace function public.request_generation_cancellation(job_id uuid, owner_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.generations;
begin
  select * into g from public.generations where id=job_id and requested_by=owner_id
    and operation in ('faceless-script','faceless-render','episode-export','cartoon-plan','cartoon-render','ugc-plan','ugc-render') for update;
  if g.id is null then raise exception 'Job not found' using errcode='P0002'; end if;
  if g.status not in ('succeeded','failed','cancelled') then update public.generations set cancel_requested_at=coalesce(cancel_requested_at,now()) where id=job_id; end if;
  return jsonb_build_object('status',g.status,'runId',g.provider_request_id);
end; $$;
create or replace function public.confirm_generation_cancellation(job_id uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare g public.generations;
begin
  perform 1 from public.faceless_projects where generation_id=job_id for update;
  perform 1 from public.cartoon_projects where generation_id=job_id for update;
  perform 1 from public.ugc_projects where generation_id=job_id for update;
  select * into g from public.generations where id=job_id for update;
  if g.id is null then raise exception 'Job not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return g.status::text; end if;
  if g.cancel_requested_at is null then raise exception 'Cancellation was not requested'; end if;
  perform private.settle_generation_credits(job_id,0,job_id::text||':cancel-settlement');
  update public.generations set status='cancelled',completed_at=now(),error_message='Cancelled by user',output_asset_ids='{}' where id=job_id;
  update public.faceless_projects set status=case when storyboard is null then 'draft' else 'ready' end,output_path=null,error_message='Job cancelled. Reserved credits were returned. You can edit and try again.' where generation_id=job_id;
  update public.cartoon_projects set status=case when storyboard is null then 'draft' else 'ready' end,error_message='Job cancelled. Reserved credits were returned. You can edit and try again.' where generation_id=job_id;
  update public.ugc_projects set status=case when plan is null then 'draft' else 'ready' end,error_message='Job cancelled. Reserved credits were returned. Previous completed ads are preserved.' where generation_id=job_id;
  update public.assets set deleted_at=now() where id=any(g.output_asset_ids) and kind='export';
  return 'cancelled';
end; $$;
create function public.finish_ugc_job(job_id uuid, succeeded boolean, result_plan jsonb default null, result_presenter text default null, result_outputs jsonb default null)
returns void language plpgsql security invoker set search_path='' as $$
declare g public.generations; prefix text; item record; count_outputs integer;
begin
  perform 1 from public.ugc_projects where generation_id=job_id for update;
  select * into g from public.generations where id=job_id and operation in ('ugc-plan','ugc-render') for update;
  if g.id is null then raise exception 'Job not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return; end if;
  if g.cancel_requested_at is not null then perform public.confirm_generation_cancellation(job_id); return; end if;
  prefix:=g.workspace_id::text||'/'||g.requested_by::text||'/ugc/'||job_id::text||'/';
  if succeeded and g.operation='ugc-plan' and (result_plan is null or result_presenter is null or result_presenter<>prefix||'presenter.png') then raise exception 'Invalid ad plan or presenter'; end if;
  if succeeded and g.operation='ugc-render' then
    if result_outputs is null or jsonb_typeof(result_outputs)<>'object' then raise exception 'Missing ad outputs'; end if;
    select count(*) into count_outputs from jsonb_object_keys(result_outputs);
    if count_outputs<>jsonb_array_length(g.settings->'hookIds') then raise exception 'Missing selected ad outputs'; end if;
    for item in select key,value from jsonb_each(result_outputs) loop
      if not (g.settings->'hookIds' ? item.key) or (item.value->>'videoPath') is distinct from prefix||item.key||'.mp4'
        or (item.value->>'captionsPath') is distinct from prefix||item.key||'.srt' then raise exception 'Invalid ad output path'; end if;
    end loop;
  end if;
  perform private.settle_generation_credits(job_id,case when succeeded then g.estimated_credits else 0 end,job_id::text||':settle');
  update public.generations set status=case when succeeded then 'succeeded'::public.generation_status else 'failed'::public.generation_status end,completed_at=now() where id=job_id;
  update public.ugc_projects set status=case when not succeeded then 'failed' when g.operation='ugc-plan' then 'ready' else 'complete' end,
    plan=case when succeeded then coalesce(result_plan,plan) else plan end,
    presenter_path=case when succeeded then coalesce(result_presenter,presenter_path) else presenter_path end,
    outputs=case when succeeded then outputs||coalesce(result_outputs,'{}'::jsonb) else outputs end,
    title=case when succeeded then coalesce(result_plan->>'title',title) else title end,
    error_message=case when succeeded then null else 'Generation failed. This job’s reserved credits were returned. Review the script or contact support with the job ID.' end where generation_id=job_id;
end; $$;
revoke all on function public.reserve_ugc_import(uuid), public.save_ugc_plan(uuid,uuid,integer,jsonb), public.start_ugc_job(uuid,uuid,uuid,text,text[],integer), public.finish_ugc_job(uuid,boolean,jsonb,text,jsonb), public.request_generation_cancellation(uuid,uuid), public.confirm_generation_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.reserve_ugc_import(uuid), public.save_ugc_plan(uuid,uuid,integer,jsonb), public.start_ugc_job(uuid,uuid,uuid,text,text[],integer), public.finish_ugc_job(uuid,boolean,jsonb,text,jsonb), public.request_generation_cancellation(uuid,uuid), public.confirm_generation_cancellation(uuid) to service_role;
