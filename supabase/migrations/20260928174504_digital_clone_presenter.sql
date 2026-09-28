-- Photo-based presenters. Only trusted server actions may write consent or bill jobs.
create table public.presenters (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id), asset_id uuid not null references public.assets(id),
  name text not null check(length(name) between 2 and 80), portrait_path text not null,
  consent_version text not null check(consent_version='photo-presenter-v1'), consent_at timestamptz not null default now(),
  revoked_at timestamptz, created_at timestamptz not null default now(), unique(user_id,asset_id)
);
create index presenters_user_created on public.presenters(user_id,created_at desc);
create index presenters_workspace on public.presenters(workspace_id);
create index presenters_asset on public.presenters(asset_id);
create table public.presenter_projects (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id), presenter_id uuid not null references public.presenters(id),
  title text not null, brief jsonb not null, script_approved_at timestamptz not null default now(),
  status text not null default 'draft' check(status in ('draft','rendering','complete','failed')),
  generation_id uuid references public.generations(id), output_path text, captions_path text, error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index presenter_projects_user_created on public.presenter_projects(user_id,created_at desc);
create index presenter_projects_workspace on public.presenter_projects(workspace_id);
create index presenter_projects_presenter on public.presenter_projects(presenter_id);
create index presenter_projects_generation on public.presenter_projects(generation_id);
alter table public.presenters enable row level security;
alter table public.presenter_projects enable row level security;
create policy presenters_read_own on public.presenters for select to authenticated using(user_id=(select auth.uid()));
create policy presenter_projects_read_own on public.presenter_projects for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.presenters,public.presenter_projects from anon,authenticated;
grant select on public.presenters,public.presenter_projects to authenticated;
grant all on public.presenters,public.presenter_projects to service_role;
create trigger presenter_projects_updated before update on public.presenter_projects for each row execute function private.set_updated_at();
create policy presenter_storage_read on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('presenter','presenter-inputs') or (storage.foldername(name))[2]=(select auth.uid())::text);
create policy presenter_storage_insert on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('presenter','presenter-inputs'));
create policy presenter_storage_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('presenter','presenter-inputs'))
 with check(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('presenter','presenter-inputs'));
create policy presenter_storage_delete on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'private-media' or (storage.foldername(name))[3] not in ('presenter','presenter-inputs'));

create function public.create_presenter(presenter_id uuid,owner_id uuid,target_workspace uuid,portrait_asset uuid,presenter_name text,consent_version text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.assets; existing uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':presenters',0));
 if not exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=owner_id) then raise exception 'Workspace not found'; end if;
 select id into existing from public.presenters where user_id=owner_id and asset_id=portrait_asset and revoked_at is null;
 if existing is not null then return existing; end if;
 if consent_version is distinct from 'photo-presenter-v1' then raise exception 'Current consent required'; end if;
 if (select count(*) from public.presenters where user_id=owner_id and revoked_at is null)>=40 then raise exception 'Presenter limit reached'; end if;
 select s.* into a from public.assets s where s.id=portrait_asset and s.owner_id=create_presenter.owner_id and s.workspace_id=target_workspace and s.kind='reference' and s.deleted_at is null;
 if a.id is null or a.storage_path not like target_workspace::text||'/'||owner_id::text||'/presenter-inputs/%' then raise exception 'Portrait not found'; end if;
 insert into public.presenters(id,user_id,workspace_id,asset_id,name,portrait_path,consent_version)
 values(presenter_id,owner_id,target_workspace,portrait_asset,presenter_name,a.storage_path,consent_version);
 return presenter_id;
end; $$;

create function public.create_presenter_project(project_id uuid,owner_id uuid,target_workspace uuid,avatar_id uuid,next_brief jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':presenter-projects',0));
 if exists(select 1 from public.presenter_projects where id=project_id and user_id=owner_id) then return project_id; end if;
 perform 1 from public.presenters where id=avatar_id and user_id=owner_id and workspace_id=target_workspace and revoked_at is null for update;
 if not found then raise exception 'Presenter consent is missing or revoked'; end if;
 if (select count(*) from public.presenter_projects where user_id=owner_id and created_at>now()-interval '1 day')>=40 then raise exception 'Daily project limit reached'; end if;
 if (next_brief->>'model') is distinct from 'fabric-1.0' or coalesce(next_brief->>'resolution','') not in ('480p','720p')
 or coalesce(next_brief->>'aspectRatio','') not in ('9:16','16:9') or coalesce(next_brief->>'duration','') not in ('15','30')
 or coalesce(length(next_brief->>'script'),0) not between 10 and 650 or coalesce(length(next_brief->>'title'),0) not between 2 and 100
 then raise exception 'Invalid presenter brief'; end if;
 insert into public.presenter_projects(id,user_id,workspace_id,presenter_id,title,brief) values(project_id,owner_id,target_workspace,avatar_id,next_brief->>'title',next_brief);
 return project_id;
end; $$;

create function public.start_presenter_job(project_id uuid,owner_id uuid,job_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.presenter_projects; a public.presenters; cost numeric; balance numeric;
begin
 -- Serialize start/revoke using the presenter row before the project/job rows.
 select a1.* into a from public.presenters a1 join public.presenter_projects p1 on p1.presenter_id=a1.id where p1.id=project_id and p1.user_id=owner_id for update of a1;
 if a.id is null or a.revoked_at is not null then raise exception 'Presenter consent is missing or revoked'; end if;
 select * into p from public.presenter_projects where id=project_id and user_id=owner_id for update;
 if p.status='rendering' then return p.generation_id; end if;
 if p.status='complete' then raise exception 'This video is complete. Create a new script to render again.'; end if;
 if p.brief->>'model' is distinct from 'fabric-1.0' or coalesce(p.brief->>'resolution','') not in ('480p','720p') or coalesce(p.brief->>'duration','') not in ('15','30') then raise exception 'Invalid presenter settings'; end if;
 cost:=15+(p.brief->>'duration')::integer*case when p.brief->>'resolution'='480p' then 6 else 10 end;
 select cached_balance into balance from public.credit_accounts where workspace_id=p.workspace_id for update;
 if balance is null or balance<cost then raise exception 'Not enough credits. Add a plan in your profile.'; end if;
 if (select count(*) from public.generations where workspace_id=p.workspace_id and status in ('created','reserved','submitted','processing'))>=2 then raise exception 'Two jobs are already running. Please wait.'; end if;
 if (select count(*) from public.generations where requested_by=owner_id and operation='presenter-render' and created_at>now()-interval '1 day')>=30 then raise exception 'Daily presenter generation limit reached'; end if;
 insert into public.generations(id,workspace_id,requested_by,operation,provider,model,settings,status,idempotency_key,estimated_credits)
 values(job_id,p.workspace_id,owner_id,'presenter-render','fal','veed/fabric-1.0',jsonb_build_object('projectId',p.id,'projectTitle',p.title,'presenterId',a.id,'portraitPath',a.portrait_path,'brief',p.brief,'consentVersion',a.consent_version),'reserved',job_id::text,cost);
 insert into public.credit_ledger(workspace_id,generation_id,kind,amount,idempotency_key) values(p.workspace_id,job_id,'reservation',-cost,job_id::text||':reserve');
 update public.credit_accounts set cached_balance=cached_balance-cost,updated_at=now() where workspace_id=p.workspace_id;
 update public.presenter_projects set status='rendering',generation_id=job_id,error_message=null where id=p.id;
 return job_id;
end; $$;

create function public.revoke_presenter(avatar_id uuid,owner_id uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare a public.presenters;
begin
 select * into a from public.presenters where id=avatar_id and user_id=owner_id for update;
 if a.id is null then raise exception 'Presenter not found'; end if;
 if exists(select 1 from public.presenter_projects where presenter_id=avatar_id and status='rendering') then raise exception 'Cancel running videos before revoking consent'; end if;
 update public.presenters set revoked_at=coalesce(revoked_at,now()) where id=avatar_id;
 update public.assets set deleted_at=coalesce(deleted_at,now()) where id=a.asset_id;
 return a.portrait_path;
end; $$;

-- Keep the existing cancellation implementation for other tools unchanged.
alter function public.request_generation_cancellation(uuid,uuid) rename to request_generation_cancellation_before_presenter;
create function public.request_generation_cancellation(job_id uuid,owner_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.generations;
begin
 select * into g from public.generations where id=job_id and requested_by=owner_id and operation='presenter-render' for update;
 if g.id is null then return public.request_generation_cancellation_before_presenter(job_id,owner_id); end if;
 if g.status not in ('succeeded','failed','cancelled') then update public.generations set cancel_requested_at=coalesce(cancel_requested_at,now()) where id=job_id; end if;
 return jsonb_build_object('status',g.status,'runId',g.provider_request_id);
end; $$;
alter function public.confirm_generation_cancellation(uuid) rename to confirm_generation_cancellation_before_presenter;
create function public.confirm_generation_cancellation(job_id uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare g public.generations;
begin
 if not exists(select 1 from public.generations where id=job_id and operation='presenter-render') then return public.confirm_generation_cancellation_before_presenter(job_id); end if;
 perform 1 from public.presenter_projects where generation_id=job_id for update;
 select * into g from public.generations where id=job_id for update;
 if g.status in ('succeeded','failed','cancelled') then return g.status::text; end if;
 if g.cancel_requested_at is null then raise exception 'Cancellation was not requested'; end if;
 perform private.settle_generation_credits(job_id,0,job_id::text||':cancel-settlement');
 update public.generations set status='cancelled',completed_at=now(),error_message='Cancelled by user' where id=job_id;
 update public.presenter_projects set status='draft',error_message='Job cancelled. Reserved credits were returned.' where generation_id=job_id;
 return 'cancelled';
end; $$;

create function public.finish_presenter_job(job_id uuid,succeeded boolean,result_seconds numeric default null)
returns void language plpgsql security invoker set search_path='' as $$
declare g public.generations; prefix text; cost numeric;
begin
 perform 1 from public.presenter_projects where generation_id=job_id for update;
 select * into g from public.generations where id=job_id and operation='presenter-render' for update;
 if g.id is null then raise exception 'Job not found'; end if;
 if g.status in ('succeeded','failed','cancelled') then return; end if;
 if g.cancel_requested_at is not null then perform public.confirm_generation_cancellation(job_id); return; end if;
 if succeeded and (result_seconds is null or result_seconds<2 or result_seconds>(g.settings->'brief'->>'duration')::integer) then raise exception 'Invalid output duration'; end if;
 cost:=case when succeeded then 15+ceil(result_seconds)*case when g.settings->'brief'->>'resolution'='480p' then 6 else 10 end else 0 end;
 perform private.settle_generation_credits(job_id,cost,job_id::text||':settle');
 prefix:=g.workspace_id::text||'/'||g.requested_by::text||'/presenter/'||job_id::text||'/';
 update public.generations set status=case when succeeded then 'succeeded'::public.generation_status else 'failed'::public.generation_status end,completed_at=now() where id=job_id;
 update public.presenter_projects set status=case when succeeded then 'complete' else 'failed' end,
 output_path=case when succeeded then prefix||'presenter.mp4' end,captions_path=case when succeeded then prefix||'captions.srt' end,
 error_message=case when succeeded then null else 'Generation failed. Reserved credits were returned. Check the script, portrait or contact support with the job ID.' end where generation_id=job_id;
end; $$;

revoke all on function public.create_presenter(uuid,uuid,uuid,uuid,text,text), public.create_presenter_project(uuid,uuid,uuid,uuid,jsonb),public.start_presenter_job(uuid,uuid,uuid),public.revoke_presenter(uuid,uuid),public.finish_presenter_job(uuid,boolean,numeric),public.request_generation_cancellation(uuid,uuid),public.confirm_generation_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.create_presenter(uuid,uuid,uuid,uuid,text,text), public.create_presenter_project(uuid,uuid,uuid,uuid,jsonb),public.start_presenter_job(uuid,uuid,uuid),public.revoke_presenter(uuid,uuid),public.finish_presenter_job(uuid,boolean,numeric),public.request_generation_cancellation(uuid,uuid),public.confirm_generation_cancellation(uuid) to service_role;
