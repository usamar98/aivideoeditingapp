-- Reference-guided cartoon jobs use the existing cast workflow and settlement rules.
-- Render rates are application credits per second, mirrored in src/lib/cartoons/schema.ts.
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
  resolution := coalesce(p.brief->>'resolution',case when model_id in ('minimax-h3-turbo','minimax-h3-reference') then '768p' else '720p' end);
  if duration is null or duration not in (15,30,60) or model_id is null or model_id not in ('kling-o3','seedance-2.5','minimax-h3-turbo','seedance-2.5-t2v','kling-v3','minimax-h3-reference','wan-3-reference')
    then raise exception 'Invalid cartoon settings'; end if;
  if (p.brief ? 'audio' and jsonb_typeof(p.brief->'audio') <> 'boolean')
    or (p.brief->'audio' = 'false'::jsonb and model_id not in ('kling-v3','wan-3-reference'))
    then raise exception 'Invalid audio setting'; end if;
  if direct and coalesce(p.brief->'references','[]'::jsonb) <> '[]'::jsonb
    then raise exception 'Direct models cannot use character images'; end if;
  rate := case model_id
    when 'minimax-h3-reference' then case resolution when '480p' then 5 when '768p' then 8 when '1080p' then 16 end
    when 'wan-3-reference' then case resolution when '480p' then 6 when '720p' then 10 when '1080p' then 18 end
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

revoke all on function public.start_cartoon_job(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.start_cartoon_job(uuid,uuid,uuid,text) to service_role;

commit;
