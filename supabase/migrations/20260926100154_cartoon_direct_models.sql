-- Add direct-prompt cartoon models. No changes to existing reservations or subscriptions.
-- Rates are application credits, mirrored in src/lib/cartoons/schema.ts.
begin;

create or replace function public.start_cartoon_job(project_id uuid, owner_id uuid, job_id uuid, job_kind text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare p public.cartoon_projects; cost numeric; balance numeric; duration integer; model_id text; resolution text; direct boolean; rate integer;
begin
  if job_kind not in ('plan','render') then raise exception 'Invalid operation'; end if;
  select * into p from public.cartoon_projects where id=project_id and user_id=owner_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.status in ('planning','rendering') then return p.generation_id; end if;
  if (select count(*) from public.generations where requested_by=owner_id and created_at>now()-interval '1 day' and operation like 'cartoon-%') >= 50 then raise exception 'Daily generation limit reached'; end if;
  if job_kind='plan' and p.storyboard is not null then raise exception 'Cast already created. Create a new project to redesign it.'; end if;
  duration := (p.brief->>'duration')::integer;
  model_id := p.brief->>'model';
  direct := model_id in ('minimax-h3-turbo','seedance-2.5-t2v','kling-v3');
  resolution := coalesce(p.brief->>'resolution',case when model_id='minimax-h3-turbo' then '768p' else '720p' end);
  if duration is null or duration not in (15,30,60) or model_id is null or model_id not in ('kling-o3','seedance-2.5','minimax-h3-turbo','seedance-2.5-t2v','kling-v3')
    then raise exception 'Invalid cartoon settings'; end if;
  if (p.brief ? 'audio' and jsonb_typeof(p.brief->'audio') <> 'boolean')
    or (p.brief->'audio' = 'false'::jsonb and model_id <> 'kling-v3')
    then raise exception 'Invalid audio setting'; end if;
  if direct and coalesce(p.brief->'references','[]'::jsonb) <> '[]'::jsonb
    then raise exception 'Direct models cannot use character images'; end if;
  rate := case model_id
    when 'kling-o3' then case when resolution='720p' then 8 end
    when 'seedance-2.5' then case when resolution='720p' then 24 end
    when 'minimax-h3-turbo' then case resolution when '480p' then 2 when '768p' then 3 when '1080p' then 6 end
    when 'seedance-2.5-t2v' then case resolution when '480p' then 15 when '720p' then 31 when '1080p' then 76 end
    when 'kling-v3' then case when resolution='720p' then case when p.brief->'audio'='false'::jsonb then 8 else 11 end end
  end;
  if rate is null then raise exception 'Unsupported resolution for this model'; end if;
  if job_kind='render' and (p.storyboard is null or (not direct and p.cast_paths='{}'::jsonb)) then raise exception 'Create your cast and review the storyboard first'; end if;
  -- Mirrored in cartoons/schema.ts and checked by the database tests. Never client-supplied.
  cost := case when job_kind='plan' then case when direct then 2 else 40 end else duration * rate end;
  select cached_balance into balance from public.credit_accounts where workspace_id=p.workspace_id for update;
  if balance is null or balance<cost then raise exception 'Not enough credits. Add a plan in your profile.'; end if;
  if (select count(*) from public.generations where workspace_id=p.workspace_id and status in ('created','reserved','submitted','processing'))>=2 then raise exception 'Two jobs are already running. Please wait.'; end if;
  insert into public.generations(id,workspace_id,requested_by,operation,provider,model,settings,status,idempotency_key,estimated_credits)
    values(job_id,p.workspace_id,owner_id,'cartoon-'||job_kind,'fal',case when job_kind='plan' then case when direct then 'gemini-story' else 'gemini+gpt-image-2.5-sunburst' end else model_id end,
    jsonb_build_object('projectId',p.id,'projectTitle',p.title,'kind',job_kind,'brief',p.brief,'storyboard',p.storyboard,'castPaths',p.cast_paths),'reserved',job_id::text,cost);
  insert into public.credit_ledger(workspace_id,generation_id,kind,amount,idempotency_key) values(p.workspace_id,job_id,'reservation',-cost,job_id::text||':reserve');
  update public.credit_accounts set cached_balance=cached_balance-cost,updated_at=now() where workspace_id=p.workspace_id;
  update public.cartoon_projects set status=case when job_kind='plan' then 'planning' else 'rendering' end,generation_id=job_id,error_message=null where id=p.id;
  return job_id;
end; $$;

create or replace function public.finish_cartoon_job(job_id uuid, succeeded boolean, result_storyboard jsonb default null, result_cast jsonb default null, result_path text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare g public.generations;
begin
  perform 1 from public.cartoon_projects where generation_id=job_id for update;
  select * into g from public.generations where id=job_id and operation in ('cartoon-plan','cartoon-render') for update;
  if g.id is null then raise exception 'Job not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return; end if;
  if g.cancel_requested_at is not null then perform public.confirm_generation_cancellation(job_id); return; end if;
  if succeeded and g.operation='cartoon-plan' and (result_storyboard is null or result_cast is null or jsonb_typeof(result_cast) <> 'object' or (result_cast='{}'::jsonb and coalesce(g.settings->'brief'->>'model','') not in ('minimax-h3-turbo','seedance-2.5-t2v','kling-v3'))) then raise exception 'Missing cast or storyboard'; end if;
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
grant execute on function public.start_cartoon_job(uuid,uuid,uuid,text) to service_role;
grant execute on function public.finish_cartoon_job(uuid,boolean,jsonb,jsonb,text) to service_role;

commit;
