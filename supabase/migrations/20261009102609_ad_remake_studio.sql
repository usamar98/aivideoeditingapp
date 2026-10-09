-- Additive: no changes to existing plans, balances or projects.
create table public.ad_remake_projects (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id), title text not null, brief jsonb not null,
 approved_at timestamptz not null default now(),
 status text not null default 'draft' check(status in ('draft','rendering','complete','failed')),
 generation_id uuid references public.generations(id), output_path text, error_message text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index ad_remake_user_created on public.ad_remake_projects(user_id,created_at desc);
create index ad_remake_workspace on public.ad_remake_projects(workspace_id);
create index ad_remake_generation on public.ad_remake_projects(generation_id);
alter table public.ad_remake_projects enable row level security;
create policy ad_remake_read_own on public.ad_remake_projects for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.ad_remake_projects from anon,authenticated;
grant select on public.ad_remake_projects to authenticated;
grant all on public.ad_remake_projects to service_role;
create trigger ad_remake_updated before update on public.ad_remake_projects for each row execute function private.set_updated_at();
-- Legacy assets/generations allow browser inserts. These inputs and billing
-- snapshots must be created only by the authenticated server actions instead.
create policy ad_remake_assets_read on public.assets as restrictive for select to authenticated
 using(coalesce((storage.foldername(storage_path))[3],'') not in ('ad-remake','ad-remake-inputs') or owner_id=(select auth.uid()));
create policy ad_remake_assets_insert on public.assets as restrictive for insert to authenticated
 with check(coalesce((storage.foldername(storage_path))[3],'') not in ('ad-remake','ad-remake-inputs'));
create policy ad_remake_assets_update on public.assets as restrictive for update to authenticated
 using(coalesce((storage.foldername(storage_path))[3],'') not in ('ad-remake','ad-remake-inputs'))
 with check(coalesce((storage.foldername(storage_path))[3],'') not in ('ad-remake','ad-remake-inputs'));
create policy ad_remake_assets_delete on public.assets as restrictive for delete to authenticated
 using(coalesce((storage.foldername(storage_path))[3],'') not in ('ad-remake','ad-remake-inputs'));
create policy ad_remake_generations_read on public.generations as restrictive for select to authenticated
 using(operation<>'ad-remake-render' or requested_by=(select auth.uid()));
create policy ad_remake_generations_insert on public.generations as restrictive for insert to authenticated
 with check(operation<>'ad-remake-render');
create policy ad_remake_storage_read on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'private-media' or coalesce((storage.foldername(name))[3],'') not in ('ad-remake','ad-remake-inputs') or (storage.foldername(name))[2]=(select auth.uid())::text);
create policy ad_remake_storage_insert on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'private-media' or coalesce((storage.foldername(name))[3],'') not in ('ad-remake','ad-remake-inputs'));
create policy ad_remake_storage_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'private-media' or coalesce((storage.foldername(name))[3],'') not in ('ad-remake','ad-remake-inputs'))
 with check(bucket_id<>'private-media' or coalesce((storage.foldername(name))[3],'') not in ('ad-remake','ad-remake-inputs'));
create policy ad_remake_storage_delete on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'private-media' or coalesce((storage.foldername(name))[3],'') not in ('ad-remake','ad-remake-inputs'));

create function private.ad_remake_cost(brief jsonb) returns numeric language plpgsql immutable set search_path='' as $$
declare seconds integer; rate integer;
begin
 if coalesce(brief->>'seconds','') !~ '^[0-9]{1,2}$' then raise exception 'Invalid reference duration'; end if;
 seconds:=(brief->>'seconds')::integer;
 rate:=case brief->>'model' when 'standard' then 6 when 'pro' then 8 else null end;
 if seconds not between 3 and 15 or rate is null then raise exception 'Invalid remake model or duration'; end if;
 return seconds*rate;
end; $$;
revoke all on function private.ad_remake_cost(jsonb) from public,anon,authenticated;
grant execute on function private.ad_remake_cost(jsonb) to service_role;

create function public.create_ad_remake_project(project_id uuid,owner_id uuid,target_workspace uuid,next_brief jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare asset_id text; prefix text;
begin
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':ad-remake-projects',0));
 if not exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=owner_id) then raise exception 'Workspace not found'; end if;
 if exists(select 1 from public.ad_remake_projects where id=project_id and user_id=owner_id) then return project_id; end if;
 if (select count(*) from public.ad_remake_projects where user_id=owner_id and created_at>now()-interval '1 day')>=30 then raise exception 'Daily remake project limit reached'; end if;
 perform private.ad_remake_cost(next_brief);
 if coalesce(length(next_brief->>'title'),0) not between 2 and 80 or coalesce(length(next_brief->>'productName'),0) not between 2 and 80
 or coalesce(length(next_brief->>'instructions'),0) not between 20 and 1500 or coalesce(next_brief->>'brandColor','') !~ '^#[0-9a-fA-F]{6}$'
 or coalesce(length(next_brief->>'cta'),100) >60 or next_brief->'rightsConfirmed' is distinct from 'true'::jsonb
 or jsonb_typeof(next_brief->'keepAudio') is distinct from 'boolean' then raise exception 'Invalid details or missing authorization'; end if;
 if jsonb_typeof(next_brief->'productAssetIds') is distinct from 'array' then raise exception 'Missing product images'; end if;
 if jsonb_array_length(next_brief->'productAssetIds') not between 1 and 4 or
 (select count(distinct v) from jsonb_array_elements_text(next_brief->'productAssetIds') v)<>jsonb_array_length(next_brief->'productAssetIds') then raise exception 'Invalid product images'; end if;
 prefix:=target_workspace::text||'/'||owner_id::text||'/ad-remake-inputs/';
 if not exists(select 1 from public.assets a where a.id=(next_brief->>'sourceAssetId')::uuid and a.owner_id=create_ad_remake_project.owner_id and a.workspace_id=target_workspace and a.kind='video' and a.deleted_at is null
 and a.mime_type in ('video/mp4','video/quicktime') and a.byte_size between 1 and 104857600 and a.storage_path like prefix||'%' and position('..' in a.storage_path)=0) then raise exception 'Reference video not found'; end if;
 for asset_id in select jsonb_array_elements_text(next_brief->'productAssetIds') loop
  if not exists(select 1 from public.assets a where a.id=asset_id::uuid and a.owner_id=create_ad_remake_project.owner_id and a.workspace_id=target_workspace and a.kind='reference' and a.deleted_at is null
   and a.mime_type in ('image/png','image/jpeg','image/webp') and a.byte_size between 1 and 8388608 and a.storage_path like prefix||'%' and position('..' in a.storage_path)=0) then raise exception 'Product image not found'; end if;
 end loop;
 insert into public.ad_remake_projects(id,user_id,workspace_id,title,brief) values(project_id,owner_id,target_workspace,next_brief->>'title',next_brief);
 return project_id;
end; $$;

create function public.start_ad_remake_job(project_id uuid,owner_id uuid,job_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.ad_remake_projects; cost numeric; balance numeric; images jsonb; source text; prefix text;
begin
 select * into p from public.ad_remake_projects where id=project_id and user_id=owner_id for update;
 if p.id is null then raise exception 'Project not found'; end if;
 if not exists(select 1 from public.workspace_members where workspace_id=p.workspace_id and user_id=owner_id) then raise exception 'Workspace not found'; end if;
 if p.status='rendering' then return p.generation_id; end if;
 if p.status='complete' then raise exception 'This remake is complete. Create a new project to render again.'; end if;
 cost:=private.ad_remake_cost(p.brief); prefix:=p.workspace_id::text||'/'||owner_id::text||'/ad-remake-inputs/';
 select a.storage_path into source from public.assets a where a.id=(p.brief->>'sourceAssetId')::uuid and a.owner_id=start_ad_remake_job.owner_id and a.workspace_id=p.workspace_id and a.kind='video' and a.deleted_at is null
 and a.mime_type in ('video/mp4','video/quicktime') and a.byte_size between 1 and 104857600 and a.storage_path like prefix||'%' and position('..' in a.storage_path)=0;
 select jsonb_agg(a.storage_path order by r.n) into images from jsonb_array_elements_text(p.brief->'productAssetIds') with ordinality r(id,n)
 join public.assets a on a.id=r.id::uuid and a.owner_id=start_ad_remake_job.owner_id and a.workspace_id=p.workspace_id and a.kind='reference' and a.deleted_at is null
 and a.mime_type in ('image/png','image/jpeg','image/webp') and a.byte_size between 1 and 8388608 and a.storage_path like prefix||'%' and position('..' in a.storage_path)=0;
 if source is null or coalesce(jsonb_array_length(images),0)<>jsonb_array_length(p.brief->'productAssetIds') then raise exception 'Remake input missing'; end if;
 select cached_balance into balance from public.credit_accounts where workspace_id=p.workspace_id for update;
 if balance is null or balance<cost then raise exception 'Not enough credits. Add a plan in your profile.'; end if;
 if (select count(*) from public.generations where workspace_id=p.workspace_id and status in ('created','reserved','submitted','processing'))>=2 then raise exception 'Two jobs are already running. Please wait.'; end if;
 if (select count(*) from public.generations where requested_by=owner_id and operation='ad-remake-render' and created_at>now()-interval '1 day')>=30 then raise exception 'Daily remake generation limit reached'; end if;
 insert into public.generations(id,workspace_id,requested_by,operation,provider,model,settings,status,idempotency_key,estimated_credits)
 values(job_id,p.workspace_id,owner_id,'ad-remake-render','fal',p.brief->>'model',jsonb_build_object('projectId',p.id,'projectTitle',p.title,'brief',p.brief,'sourcePath',source,'imagePaths',images),'reserved',job_id::text,cost);
 insert into public.credit_ledger(workspace_id,generation_id,kind,amount,idempotency_key) values(p.workspace_id,job_id,'reservation',-cost,job_id::text||':reserve');
 update public.credit_accounts set cached_balance=cached_balance-cost,updated_at=now() where workspace_id=p.workspace_id;
 update public.ad_remake_projects set status='rendering',generation_id=job_id,error_message=null where id=p.id;
 return job_id;
end; $$;

alter function public.request_generation_cancellation(uuid,uuid) rename to request_generation_cancellation_before_ad_remake;
create function public.request_generation_cancellation(job_id uuid,owner_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.generations;
begin
 select * into g from public.generations where id=job_id and requested_by=owner_id and operation='ad-remake-render' for update;
 if g.id is null then return public.request_generation_cancellation_before_ad_remake(job_id,owner_id); end if;
 if g.status not in ('succeeded','failed','cancelled') then update public.generations set cancel_requested_at=coalesce(cancel_requested_at,now()) where id=job_id; end if;
 return jsonb_build_object('status',g.status,'runId',g.provider_request_id);
end; $$;
alter function public.confirm_generation_cancellation(uuid) rename to confirm_generation_cancellation_before_ad_remake;
create function public.confirm_generation_cancellation(job_id uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare g public.generations;
begin
 if not exists(select 1 from public.generations where id=job_id and operation='ad-remake-render') then return public.confirm_generation_cancellation_before_ad_remake(job_id); end if;
 perform 1 from public.ad_remake_projects where generation_id=job_id for update;
 select * into g from public.generations where id=job_id for update;
 if g.status in ('succeeded','failed','cancelled') then return g.status::text; end if;
 if g.cancel_requested_at is null then raise exception 'Cancellation was not requested'; end if;
 perform private.settle_generation_credits(job_id,0,job_id::text||':cancel-settlement');
 update public.generations set status='cancelled',completed_at=now(),error_message='Cancelled by user' where id=job_id;
 update public.ad_remake_projects set status='draft',error_message='Job cancelled. Reserved credits were returned.' where generation_id=job_id;
 return 'cancelled';
end; $$;
create function public.finish_ad_remake_job(job_id uuid,succeeded boolean,result_seconds numeric default null)
returns void language plpgsql security invoker set search_path='' as $$
declare g public.generations; prefix text;
begin
 perform 1 from public.ad_remake_projects where generation_id=job_id for update;
 select * into g from public.generations where id=job_id and operation='ad-remake-render' for update;
 if g.id is null then raise exception 'Job not found'; end if;
 if g.status in ('succeeded','failed','cancelled') then return; end if;
 if g.cancel_requested_at is not null then perform public.confirm_generation_cancellation(job_id); return; end if;
 if succeeded and (result_seconds is null or result_seconds<3 or result_seconds>15 or result_seconds>(g.settings->'brief'->>'seconds')::integer+.01
 or (g.settings->'brief'->>'seconds')::integer-result_seconds>=1.01) then raise exception 'Invalid output duration'; end if;
 perform private.settle_generation_credits(job_id,case when succeeded then g.estimated_credits else 0 end,job_id::text||':settle');
 prefix:=g.workspace_id::text||'/'||g.requested_by::text||'/ad-remake/'||job_id::text||'/';
 update public.generations set status=case when succeeded then 'succeeded'::public.generation_status else 'failed'::public.generation_status end,completed_at=now() where id=job_id;
 update public.ad_remake_projects set status=case when succeeded then 'complete' else 'failed' end,output_path=case when succeeded then prefix||'remake.mp4' end,
 error_message=case when succeeded then null else 'Remake failed. Reserved credits were returned. Check the source clip and instructions, or contact support with the job ID.' end where generation_id=job_id;
end; $$;
revoke all on function public.create_ad_remake_project(uuid,uuid,uuid,jsonb),public.start_ad_remake_job(uuid,uuid,uuid),public.finish_ad_remake_job(uuid,boolean,numeric),public.request_generation_cancellation(uuid,uuid),public.confirm_generation_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.create_ad_remake_project(uuid,uuid,uuid,jsonb),public.start_ad_remake_job(uuid,uuid,uuid),public.finish_ad_remake_job(uuid,boolean,numeric),public.request_generation_cancellation(uuid,uuid),public.confirm_generation_cancellation(uuid) to service_role;
