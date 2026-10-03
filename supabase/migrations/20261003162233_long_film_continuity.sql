-- Additive rollout: old 24/48-second plans and active job snapshots remain valid.
-- No balances, settled reservations, existing projects or storage policies change.
begin;
create or replace function public.start_short_film_job(project_id uuid, owner_id uuid, job_id uuid, job_kind text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  p public.cartoon_projects; cost numeric; balance numeric; duration integer;
  model_id text; resolution text; rate integer; expected_resolution text;
  shot_count integer; shot jsonb; previous jsonb; continuity jsonb; position bigint;
  beat integer; previous_beat integer := 0; seen_beats integer[] := '{}';
begin
  if job_kind is null or job_kind not in ('plan','render') then raise exception 'Invalid operation'; end if;
  select * into p from public.cartoon_projects where id=project_id and user_id=owner_id for update;
  if p.id is null or p.brief->>'kind' is distinct from 'short-film' then raise exception 'Short film not found'; end if;
  if p.status in ('planning','rendering') then return p.generation_id; end if;
  if (select count(*) from public.generations where requested_by=owner_id and created_at>now()-interval '1 day' and operation like 'cartoon-%') >= 50 then raise exception 'Daily generation limit reached'; end if;
  if job_kind='plan' and p.storyboard is not null then raise exception 'Cast already created. Create a new project to redesign it.'; end if;
  duration := (p.brief->>'duration')::integer;
  model_id := p.brief->>'model';
  if duration is null or duration not in (24,48,60,120,180) or p.brief->'rightsConfirmed' is distinct from 'true'::jsonb then raise exception 'Invalid short film settings'; end if;
  if p.brief->>'style' is null or p.brief->>'style' not in ('cinematic','noir','scifi','fantasy','anime','3d') or p.brief->>'aspectRatio' is null or p.brief->>'aspectRatio' not in ('16:9','9:16') then raise exception 'Invalid film look or canvas'; end if;
  if p.brief ? 'audio' and jsonb_typeof(p.brief->'audio') <> 'boolean' then raise exception 'Invalid audio setting'; end if;
  -- Mirrors filmShotDurations: replace the four-second remainder with two sixes.
  shot_count := duration/8 + case when duration%8=4 then 1 else 0 end;
  select r, res into rate, expected_resolution from (values
    ('film-kling-o3',12,'720p'), ('film-kling-v3-pro',15,'1080p'), ('film-kling-v3-standard',10,'720p'),
    ('film-minimax-h3',8,'768p'), ('film-minimax-h3-turbo',5,'768p'),
    ('film-seedance-2.5',80,'1080p'), ('film-seedance-2-fast',25,'720p'),
    ('film-veo-3.1',30,'1080p'), ('film-veo-3.1-fast',18,'1080p'),
    ('film-grok-1.5',12,'1080p'), ('film-wan-3',15,'1080p'), ('film-happy-horse',15,'1080p'),
    ('film-ltx-2.3',6,'1080p'), ('film-ltx-2.3-fast',5,'1080p'),
    ('film-pixverse-v6',10,'1080p'), ('film-gemini-omni',20,'720p')
  ) as rates(id,r,res) where id=model_id;
  resolution := coalesce(p.brief->>'resolution',expected_resolution);
  if rate is null or resolution is distinct from expected_resolution then raise exception 'Unsupported film model or resolution'; end if;
  if job_kind='render' then
    if p.storyboard is null or p.cast_paths='{}'::jsonb then raise exception 'Create your cast and review the storyboard first'; end if;
    if jsonb_array_length(p.storyboard->'scenes') is distinct from shot_count then raise exception 'Invalid film shot count'; end if;
    if duration>=60 and (jsonb_typeof(p.storyboard->'filmBible') is distinct from 'object'
      or jsonb_typeof(p.storyboard->'filmBible'->'locations') is distinct from 'array'
      or jsonb_typeof(p.storyboard->'filmBible'->'props') is distinct from 'array'
      or length(coalesce(p.storyboard->'filmBible'->>'ending',''))<10
      or length(coalesce(p.storyboard->'filmBible'->>'worldRules',''))<10) then raise exception 'Long films require a story and world bible'; end if;
    for shot, position in select value, ordinality from jsonb_array_elements(p.storyboard->'scenes') with ordinality loop
      if (shot->>'duration')::integer is distinct from (case when duration%8=4 and position>shot_count-2 then 6 else 8 end) then raise exception 'Invalid six/eight-second shot schedule'; end if;
      if duration>=60 then
        continuity := shot->'continuity';
        beat := array_position(array['setup','escalation','payoff'],continuity->>'beat');
        if jsonb_typeof(continuity) is distinct from 'object' or beat is null or beat<previous_beat
          or length(coalesce(continuity->>'stateIn',''))<10 or length(coalesce(continuity->>'stateOut',''))<10
          or continuity->>'transition' is null or continuity->>'transition' not in ('cut','continue')
          or not exists(select 1 from jsonb_array_elements(p.storyboard->'filmBible'->'locations') l where l->>'id'=continuity->>'locationId')
          then raise exception 'Invalid film continuity'; end if;
        if previous is not null and continuity->>'stateIn' is distinct from previous->'continuity'->>'stateOut' then raise exception 'Film continuity state chain is broken'; end if;
        if continuity->>'transition'='continue' and (previous is null
          or continuity->>'locationId' is distinct from previous->'continuity'->>'locationId'
          or not ((shot->'characterIds') @> (previous->'characterIds') and (previous->'characterIds') @> (shot->'characterIds'))) then raise exception 'A changed location or cast requires a cut'; end if;
        previous_beat := beat; seen_beats := array_append(seen_beats,beat);
      end if;
      previous := shot;
    end loop;
    if duration>=60 and not (seen_beats @> array[1,2,3]) then raise exception 'Film needs setup, escalation and payoff'; end if;
  end if;
  cost := case when job_kind='plan' then 40 else duration * rate + shot_count*10 end;
  select cached_balance into balance from public.credit_accounts where workspace_id=p.workspace_id for update;
  if balance is null or balance<cost then raise exception 'Not enough credits. Add a plan in your profile.'; end if;
  if (select count(*) from public.generations where workspace_id=p.workspace_id and status in ('created','reserved','submitted','processing'))>=2 then raise exception 'Two jobs are already running. Please wait.'; end if;
  insert into public.generations(id,workspace_id,requested_by,operation,provider,model,settings,status,idempotency_key,estimated_credits)
    values(job_id,p.workspace_id,owner_id,'cartoon-'||job_kind,'fal',case when job_kind='plan' then 'gemini+gpt-image-2.5-sunburst' else model_id end,
    jsonb_build_object('projectId',p.id,'projectTitle',p.title,'kind',job_kind,'brief',p.brief,'storyboard',p.storyboard,'castPaths',p.cast_paths),'reserved',job_id::text,cost);
  insert into public.credit_ledger(workspace_id,generation_id,kind,amount,idempotency_key) values(p.workspace_id,job_id,'reservation',-cost,job_id::text||':reserve');
  update public.credit_accounts set cached_balance=cached_balance-cost,updated_at=now() where workspace_id=p.workspace_id;
  update public.cartoon_projects set status=case when job_kind='plan' then 'planning' else 'rendering' end,generation_id=job_id,error_message=null where id=p.id;
  return job_id;
end; $$;
revoke all on function public.start_short_film_job(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.start_short_film_job(uuid,uuid,uuid,text) to service_role;
commit;
