-- Additive: no existing project or balance is changed.
create table public.shorts_projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id), title text not null, brief jsonb not null,
  analysis jsonb, plan jsonb, outputs jsonb not null default '{}', revision integer not null default 0,
  status text not null default 'draft' check(status in ('draft','analyzing','ready','rendering','complete','failed')),
  generation_id uuid references public.generations(id), error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index shorts_projects_user_created on public.shorts_projects(user_id,created_at desc);
create index shorts_projects_workspace on public.shorts_projects(workspace_id);
create index shorts_projects_generation on public.shorts_projects(generation_id);
alter table public.shorts_projects enable row level security;
create policy shorts_read_own on public.shorts_projects for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.shorts_projects from anon,authenticated;
grant select on public.shorts_projects to authenticated;
grant all on public.shorts_projects to service_role;
create trigger shorts_updated before update on public.shorts_projects for each row execute function private.set_updated_at();

-- Signed non-upsert uploads only. Browsers cannot replace inputs after review.
create policy shorts_storage_read on storage.objects as restrictive for select to authenticated
  using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('shorts','shorts-inputs')
    or (storage.foldername(name))[2]=(select auth.uid())::text);
create policy shorts_storage_insert on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('shorts','shorts-inputs'));
create policy shorts_storage_update on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('shorts','shorts-inputs'))
  with check(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('shorts','shorts-inputs'));
create policy shorts_storage_delete on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('shorts','shorts-inputs'));
update storage.buckets set allowed_mime_types=(select array_agg(distinct m) from unnest(allowed_mime_types||array['video/quicktime','video/webm','application/json','application/x-subrip','text/plain']) m) where id='private-media' and allowed_mime_types is not null;

create function public.save_shorts_plan(project_id uuid, owner_id uuid, expected_revision integer, next_plan jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.shorts_projects;
begin
  select * into p from public.shorts_projects where id=project_id and user_id=owner_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.status in ('analyzing','rendering') then raise exception 'Wait for the current job before editing.'; end if;
  if p.analysis is null or next_plan is null then raise exception 'Analyze the video first.'; end if;
  if p.revision<>expected_revision then raise exception 'Clips changed in another tab. Refresh before saving.'; end if;
  update public.shorts_projects set plan=next_plan,revision=revision+1,status='ready',error_message=null where id=p.id;
end; $$;
create function public.start_shorts_job(project_id uuid, owner_id uuid, job_id uuid, job_kind text, clip_ids text[] default '{}', expected_revision integer default 0)
returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.shorts_projects; cost numeric; balance numeric; n integer;
begin
  if job_kind is null or job_kind not in ('analyze','render') then raise exception 'Invalid operation'; end if;
  select * into p from public.shorts_projects where id=project_id and user_id=owner_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.status in ('analyzing','rendering') then
    if (p.status='analyzing')<>(job_kind='analyze') then raise exception 'Another stage is already running.'; end if;
    return p.generation_id;
  end if;
  if p.revision<>expected_revision then raise exception 'Clips changed. Refresh before generating.'; end if;
  if job_kind='analyze' and p.analysis is not null then raise exception 'Video already analyzed. Edit your clips or start a new project.'; end if;
  n:=coalesce(array_length(clip_ids,1),0);
  if job_kind='render' then
    if p.analysis is null or p.plan is null then raise exception 'Analyze and review the clips first.'; end if;
    if n<1 or n>5 or n<>(select count(distinct c) from unnest(clip_ids) c)
      or exists(select 1 from unnest(clip_ids) c where c is null or not exists(select 1 from jsonb_array_elements(p.plan->'clips') j where j->>'id'=c)) then raise exception 'Select one to five distinct saved clips.'; end if;
  end if;
  cost:=case when job_kind='analyze' then 40 else 10*n end;
  select cached_balance into balance from public.credit_accounts where workspace_id=p.workspace_id for update;
  if balance is null or balance<cost then raise exception 'Not enough credits. Add a plan in your profile.'; end if;
  if (select count(*) from public.generations where workspace_id=p.workspace_id and status in ('created','reserved','submitted','processing'))>=2 then raise exception 'Two jobs are already running. Please wait.'; end if;
  if (select count(*) from public.generations where requested_by=owner_id and operation like 'shorts-%' and created_at>now()-interval '1 day')>=20 then raise exception 'Daily Shorts-generation limit reached.'; end if;
  insert into public.generations(id,workspace_id,requested_by,operation,provider,model,settings,status,idempotency_key,estimated_credits)
    values(job_id,p.workspace_id,owner_id,'shorts-'||job_kind,case when job_kind='analyze' then 'fal' else 'ffmpeg' end,
    case when job_kind='analyze' then 'whisper+gemini-3.8-flash' else 'opencv+ffmpeg' end,
    jsonb_build_object('projectId',p.id,'projectTitle',p.title,'kind',job_kind,'brief',p.brief,'plan',p.plan,'clipIds',to_jsonb(clip_ids),'revision',p.revision), 'reserved',job_id::text,cost);
  insert into public.credit_ledger(workspace_id,generation_id,kind,amount,idempotency_key) values(p.workspace_id,job_id,'reservation',-cost,job_id::text||':reserve');
  update public.credit_accounts set cached_balance=cached_balance-cost,updated_at=now() where workspace_id=p.workspace_id;
  update public.shorts_projects set status=case when job_kind='analyze' then 'analyzing' else 'rendering' end,generation_id=job_id,error_message=null where id=p.id;
  return job_id;
end; $$;

create or replace function public.request_generation_cancellation(job_id uuid, owner_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.generations;
begin
  select * into g from public.generations where id=job_id and requested_by=owner_id
    and operation in ('faceless-script','faceless-render','episode-export','cartoon-plan','cartoon-render','ugc-plan','ugc-render','shorts-analyze','shorts-render') for update;
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
  perform 1 from public.shorts_projects where generation_id=job_id for update;
  select * into g from public.generations where id=job_id for update;
  if g.id is null then raise exception 'Job not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return g.status::text; end if;
  if g.cancel_requested_at is null then raise exception 'Cancellation was not requested'; end if;
  perform private.settle_generation_credits(job_id,0,job_id::text||':cancel-settlement');
  update public.generations set status='cancelled',completed_at=now(),error_message='Cancelled by user',output_asset_ids='{}' where id=job_id;
  update public.faceless_projects set status=case when storyboard is null then 'draft' else 'ready' end,output_path=null,error_message='Job cancelled. Reserved credits were returned. You can edit and try again.' where generation_id=job_id;
  update public.cartoon_projects set status=case when storyboard is null then 'draft' else 'ready' end,error_message='Job cancelled. Reserved credits were returned. You can edit and try again.' where generation_id=job_id;
  update public.ugc_projects set status=case when plan is null then 'draft' else 'ready' end,error_message='Job cancelled. Reserved credits were returned. Previous completed ads are preserved.' where generation_id=job_id;
  update public.shorts_projects set status=case when analysis is null then 'draft' else 'ready' end,error_message='Job cancelled. Reserved credits were returned. Previous completed clips are preserved.' where generation_id=job_id;
  update public.assets set deleted_at=now() where id=any(g.output_asset_ids) and kind='export';
  return 'cancelled';
end; $$;
create function public.finish_shorts_job(job_id uuid, succeeded boolean, result_analysis jsonb default null, result_plan jsonb default null, result_outputs jsonb default null)
returns void language plpgsql security invoker set search_path='' as $$
declare g public.generations; prefix text; item record;
begin
  perform 1 from public.shorts_projects where generation_id=job_id for update;
  select * into g from public.generations where id=job_id and operation in ('shorts-analyze','shorts-render') for update;
  if g.id is null then raise exception 'Job not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return; end if;
  if g.cancel_requested_at is not null then perform public.confirm_generation_cancellation(job_id); return; end if;
  if succeeded and g.operation='shorts-analyze' and (result_analysis is null or result_plan is null) then raise exception 'Missing clip analysis'; end if;
  prefix:=g.workspace_id::text||'/'||g.requested_by::text||'/shorts/'||job_id::text||'/';
  if succeeded and g.operation='shorts-render' then
    if result_outputs is null or jsonb_typeof(result_outputs)<>'object' then raise exception 'Missing clips'; end if;
    if (select count(*) from jsonb_object_keys(result_outputs))<>jsonb_array_length(g.settings->'clipIds') then raise exception 'Missing selected clips'; end if;
    for item in select key,value from jsonb_each(result_outputs) loop
      if not (g.settings->'clipIds' ? item.key) or (item.value->>'videoPath') is distinct from prefix||item.key||'.mp4'
        or (item.value->>'captionsPath') is distinct from prefix||item.key||'.srt' then raise exception 'Invalid clip output path'; end if;
    end loop;
  end if;
  perform private.settle_generation_credits(job_id,case when succeeded then g.estimated_credits else 0 end,job_id::text||':settle');
  update public.generations set status=case when succeeded then 'succeeded'::public.generation_status else 'failed'::public.generation_status end,completed_at=now() where id=job_id;
  update public.shorts_projects set status=case when not succeeded then 'failed' when g.operation='shorts-analyze' then 'ready' else 'complete' end,
    analysis=case when succeeded then coalesce(result_analysis,analysis) else analysis end,
    plan=case when succeeded then coalesce(result_plan,plan) else plan end,
    outputs=case when succeeded then outputs||coalesce(result_outputs,'{}'::jsonb) else outputs end,
    error_message=case when succeeded then null else 'Processing failed. This job’s reserved credits were returned. Check the source video, or contact support with the job ID.' end where generation_id=job_id;
end; $$;
revoke all on function public.save_shorts_plan(uuid,uuid,integer,jsonb),public.start_shorts_job(uuid,uuid,uuid,text,text[],integer),public.finish_shorts_job(uuid,boolean,jsonb,jsonb,jsonb),public.request_generation_cancellation(uuid,uuid),public.confirm_generation_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.save_shorts_plan(uuid,uuid,integer,jsonb),public.start_shorts_job(uuid,uuid,uuid,text,text[],integer),public.finish_shorts_job(uuid,boolean,jsonb,jsonb,jsonb),public.request_generation_cancellation(uuid,uuid),public.confirm_generation_cancellation(uuid) to service_role;
