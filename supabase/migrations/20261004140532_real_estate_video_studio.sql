-- Immutable, approved listing briefs; service-only billing, owner-only private reads.
create table public.real_estate_projects (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id), title text not null,
  brief jsonb not null, approved_at timestamptz not null default now(),
  status text not null default 'draft' check(status in ('draft','rendering','complete','failed')),
  generation_id uuid references public.generations(id), output_path text, captions_path text, error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index real_estate_user_created on public.real_estate_projects(user_id,created_at desc);
create index real_estate_workspace on public.real_estate_projects(workspace_id);
create index real_estate_generation on public.real_estate_projects(generation_id);
alter table public.real_estate_projects enable row level security;
create policy real_estate_read_own on public.real_estate_projects for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.real_estate_projects from anon,authenticated;
grant select on public.real_estate_projects to authenticated;
grant all on public.real_estate_projects to service_role;
create trigger real_estate_updated before update on public.real_estate_projects for each row execute function private.set_updated_at();
create policy real_estate_storage_read on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('real-estate','real-estate-inputs') or (storage.foldername(name))[2]=(select auth.uid())::text);
create policy real_estate_storage_insert on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('real-estate','real-estate-inputs'));
create policy real_estate_storage_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('real-estate','real-estate-inputs'))
 with check(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('real-estate','real-estate-inputs'));
create policy real_estate_storage_delete on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('real-estate','real-estate-inputs'));

create function private.real_estate_cost(brief jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare n integer; rate integer; seconds integer;
begin
 if jsonb_typeof(brief->'rooms') is distinct from 'array' then raise exception 'Invalid property photos'; end if;
 n:=jsonb_array_length(brief->'rooms');
 if n not between 2 and 12 or coalesce(brief->>'secondsPerRoom','') not in ('6','8') or coalesce(brief->>'voice','') not in ('none','Rachel','Aria')
 or coalesce(brief->>'aspectRatio','') not in ('16:9','9:16') then raise exception 'Invalid listing settings'; end if;
 seconds:=(brief->>'secondsPerRoom')::integer;
 rate:=case brief->>'model' when 'photo-motion' then 1 when 'film-kling-v3-pro' then 15 when 'film-kling-v3-standard' then 10
 when 'film-seedance-2.5' then 80 when 'film-veo-3.1' then 30 when 'film-veo-3.1-fast' then 18 when 'film-wan-3' then 15
 when 'film-ltx-2.3' then 6 when 'film-ltx-2.3-fast' then 5 else null end;
 if rate is null then raise exception 'Unsupported listing model'; end if;
 return 10+n*seconds*rate+case when brief->>'voice'='none' then 0 else n*5 end;
end; $$;
revoke all on function private.real_estate_cost(jsonb) from public,anon,authenticated;
grant execute on function private.real_estate_cost(jsonb) to service_role;

create function public.create_real_estate_project(project_id uuid,owner_id uuid,target_workspace uuid,next_brief jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare room jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':listing-projects',0));
 if not exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=owner_id) then raise exception 'Workspace not found'; end if;
 if exists(select 1 from public.real_estate_projects where id=project_id and user_id=owner_id) then return project_id; end if;
 if (select count(*) from public.real_estate_projects where user_id=owner_id and created_at>now()-interval '1 day')>=40 then raise exception 'Daily project limit reached'; end if;
 perform private.real_estate_cost(next_brief);
 if coalesce(length(next_brief->>'title'),0) not between 2 and 80 or coalesce(next_brief->>'brandColor','') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid listing details'; end if;
 if (select count(distinct r->>'assetId') from jsonb_array_elements(next_brief->'rooms') r)<>jsonb_array_length(next_brief->'rooms') then raise exception 'Duplicate property photos'; end if;
 for room in select * from jsonb_array_elements(next_brief->'rooms') loop
  if coalesce(length(room->>'label'),0) not between 2 and 40 or coalesce(room->>'motion','') not in ('push','pan','still') then raise exception 'Invalid room'; end if;
  if not exists(select 1 from public.assets a where a.id=(room->>'assetId')::uuid and a.owner_id=create_real_estate_project.owner_id and a.workspace_id=target_workspace and a.kind='reference' and a.deleted_at is null
   and a.storage_path like target_workspace::text||'/'||create_real_estate_project.owner_id::text||'/real-estate-inputs/%' and position('..' in a.storage_path)=0) then raise exception 'Property photo not found'; end if;
 end loop;
 insert into public.real_estate_projects(id,user_id,workspace_id,title,brief) values(project_id,owner_id,target_workspace,next_brief->>'title',next_brief);
 return project_id;
end; $$;

create function public.start_real_estate_job(project_id uuid,owner_id uuid,job_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.real_estate_projects; cost numeric; balance numeric; photos jsonb;
begin
 select * into p from public.real_estate_projects where id=project_id and user_id=owner_id for update;
 if p.id is null then raise exception 'Project not found'; end if;
 if not exists(select 1 from public.workspace_members where workspace_id=p.workspace_id and user_id=owner_id) then raise exception 'Workspace not found'; end if;
 if p.status='rendering' then return p.generation_id; end if;
 if p.status='complete' then raise exception 'This listing is complete. Create a new project to render again.'; end if;
 cost:=private.real_estate_cost(p.brief);
 select jsonb_agg(a.storage_path order by r.n) into photos from jsonb_array_elements(p.brief->'rooms') with ordinality r(room,n)
 join public.assets a on a.id=(r.room->>'assetId')::uuid and a.owner_id=start_real_estate_job.owner_id and a.workspace_id=p.workspace_id and a.kind='reference' and a.deleted_at is null
 and a.storage_path like p.workspace_id::text||'/'||start_real_estate_job.owner_id::text||'/real-estate-inputs/%' and position('..' in a.storage_path)=0;
 if coalesce(jsonb_array_length(photos),0)<>jsonb_array_length(p.brief->'rooms') then raise exception 'Property photo not found'; end if;
 select cached_balance into balance from public.credit_accounts where workspace_id=p.workspace_id for update;
 if balance is null or balance<cost then raise exception 'Not enough credits. Add a plan in your profile.'; end if;
 if (select count(*) from public.generations where workspace_id=p.workspace_id and status in ('created','reserved','submitted','processing'))>=2 then raise exception 'Two jobs are already running. Please wait.'; end if;
 if (select count(*) from public.generations where requested_by=owner_id and operation='real-estate-render' and created_at>now()-interval '1 day')>=30 then raise exception 'Daily listing generation limit reached'; end if;
 insert into public.generations(id,workspace_id,requested_by,operation,provider,model,settings,status,idempotency_key,estimated_credits)
 values(job_id,p.workspace_id,owner_id,'real-estate-render','fal',p.brief->>'model',jsonb_build_object('projectId',p.id,'projectTitle',p.title,'brief',p.brief,'photoPaths',photos),'reserved',job_id::text,cost);
 insert into public.credit_ledger(workspace_id,generation_id,kind,amount,idempotency_key) values(p.workspace_id,job_id,'reservation',-cost,job_id::text||':reserve');
 update public.credit_accounts set cached_balance=cached_balance-cost,updated_at=now() where workspace_id=p.workspace_id;
 update public.real_estate_projects set status='rendering',generation_id=job_id,error_message=null where id=p.id;
 return job_id;
end; $$;

alter function public.request_generation_cancellation(uuid,uuid) rename to request_generation_cancellation_before_real_estate;
create function public.request_generation_cancellation(job_id uuid,owner_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.generations;
begin
 select * into g from public.generations where id=job_id and requested_by=owner_id and operation='real-estate-render' for update;
 if g.id is null then return public.request_generation_cancellation_before_real_estate(job_id,owner_id); end if;
 if g.status not in ('succeeded','failed','cancelled') then update public.generations set cancel_requested_at=coalesce(cancel_requested_at,now()) where id=job_id; end if;
 return jsonb_build_object('status',g.status,'runId',g.provider_request_id);
end; $$;
alter function public.confirm_generation_cancellation(uuid) rename to confirm_generation_cancellation_before_real_estate;
create function public.confirm_generation_cancellation(job_id uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare g public.generations;
begin
 if not exists(select 1 from public.generations where id=job_id and operation='real-estate-render') then return public.confirm_generation_cancellation_before_real_estate(job_id); end if;
 perform 1 from public.real_estate_projects where generation_id=job_id for update;
 select * into g from public.generations where id=job_id for update;
 if g.status in ('succeeded','failed','cancelled') then return g.status::text; end if;
 if g.cancel_requested_at is null then raise exception 'Cancellation was not requested'; end if;
 perform private.settle_generation_credits(job_id,0,job_id::text||':cancel-settlement');
 update public.generations set status='cancelled',completed_at=now(),error_message='Cancelled by user' where id=job_id;
 update public.real_estate_projects set status='draft',error_message='Job cancelled. Reserved credits were returned.' where generation_id=job_id;
 return 'cancelled';
end; $$;
create function public.finish_real_estate_job(job_id uuid,succeeded boolean,result_seconds numeric default null)
returns void language plpgsql security invoker set search_path='' as $$
declare g public.generations; prefix text; expected integer;
begin
 perform 1 from public.real_estate_projects where generation_id=job_id for update;
 select * into g from public.generations where id=job_id and operation='real-estate-render' for update;
 if g.id is null then raise exception 'Job not found'; end if;
 if g.status in ('succeeded','failed','cancelled') then return; end if;
 if g.cancel_requested_at is not null then perform public.confirm_generation_cancellation(job_id); return; end if;
 expected:=jsonb_array_length(g.settings->'brief'->'rooms')*(g.settings->'brief'->>'secondsPerRoom')::integer+4;
 if succeeded and (result_seconds is null or result_seconds<>expected) then raise exception 'Invalid output duration'; end if;
 perform private.settle_generation_credits(job_id,case when succeeded then g.estimated_credits else 0 end,job_id::text||':settle');
 prefix:=g.workspace_id::text||'/'||g.requested_by::text||'/real-estate/'||job_id::text||'/';
 update public.generations set status=case when succeeded then 'succeeded'::public.generation_status else 'failed'::public.generation_status end,completed_at=now() where id=job_id;
 update public.real_estate_projects set status=case when succeeded then 'complete' else 'failed' end,
 output_path=case when succeeded then prefix||'listing.mp4' end,captions_path=case when succeeded then prefix||'captions.srt' end,
 error_message=case when succeeded then null else 'Generation failed. Reserved credits were returned. Check the photos and narration or contact support with the job ID.' end where generation_id=job_id;
end; $$;
revoke all on function public.create_real_estate_project(uuid,uuid,uuid,jsonb),public.start_real_estate_job(uuid,uuid,uuid),public.finish_real_estate_job(uuid,boolean,numeric),public.request_generation_cancellation(uuid,uuid),public.confirm_generation_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.create_real_estate_project(uuid,uuid,uuid,jsonb),public.start_real_estate_job(uuid,uuid,uuid),public.finish_real_estate_job(uuid,boolean,numeric),public.request_generation_cancellation(uuid,uuid),public.confirm_generation_cancellation(uuid) to service_role;
