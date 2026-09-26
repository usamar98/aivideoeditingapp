-- Server-only OAuth credentials and publishing state. No browser table grants.
create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  channel_id text not null, channel_title text not null,
  refresh_token text not null,
  status text not null default 'connected' check(status in ('connected','reconnect','disconnecting')),
  revoked_at timestamptz, disconnect_requested_at timestamptz, verified_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique(id,user_id)
);
create table public.social_oauth_states (
  state_hash text primary key, user_id uuid not null unique references auth.users(id) on delete cascade,
  verifier text not null, expires_at timestamptz not null, consumed boolean not null default false
);
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  request_id uuid not null,
  source_kind text not null check(source_kind in ('faceless','cartoon','ugc','shorts')),
  source_project_id uuid not null, source_output_key text not null default '', source_path text not null,
  title text not null check(length(title) between 1 and 100), description text not null default '',
  visibility text not null check(visibility in ('private','unlisted','public')),
  scheduled_at timestamptz, made_for_kids boolean not null, synthetic_media boolean not null,
  consented_at timestamptz not null default now(),
  status text not null default 'queued' check(status in ('queued','uploading','processing','scheduled','published','private','cancelled','failed','needs_attention','cancelling')),
  cancel_requested boolean not null default false,
  youtube_video_id text, remote_privacy text, remote_publish_at timestamptz, visibility_applied boolean not null default false,
  upload_session text, total_bytes bigint, uploaded_bytes bigint not null default 0,
  attempts integer not null default 0, lease_token uuid, lease_until timestamptz,
  next_check_at timestamptz not null default now(), error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (connection_id,user_id) references public.social_connections(id,user_id) on delete cascade,
  unique(user_id,request_id), check(scheduled_at is null or visibility='public'),
  check(total_bytes is null or total_bytes between 1 and 209715200)
);
create index social_posts_owner on public.social_posts(user_id,created_at desc);
create index social_posts_due on public.social_posts(next_check_at) where status in ('queued','uploading','processing','scheduled','cancelling');
create index social_posts_connection on public.social_posts(connection_id);
create unique index social_posts_no_duplicate on public.social_posts(connection_id,source_path) where status not in ('cancelled','failed');
alter table public.social_connections enable row level security;
alter table public.social_oauth_states enable row level security;
alter table public.social_posts enable row level security;
revoke all on public.social_connections,public.social_oauth_states,public.social_posts from public,anon,authenticated;
grant select,insert,update,delete on public.social_connections,public.social_oauth_states,public.social_posts to service_role;

-- Invoker functions are callable only by the trusted backend, not end-user JWTs.
create function public.begin_social_oauth(owner_id uuid, state_digest text, encrypted_verifier text) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,0));
  if exists(select 1 from public.social_connections where user_id=owner_id and status='disconnecting') then raise exception 'Disconnect pending'; end if;
  insert into public.social_oauth_states(user_id,state_hash,verifier,expires_at) values(owner_id,state_digest,encrypted_verifier,now()+interval '10 minutes')
  on conflict(user_id) do update set state_hash=excluded.state_hash,verifier=excluded.verifier,expires_at=excluded.expires_at,consumed=false;
end $$;
create function public.complete_social_oauth(owner_id uuid, state_digest text, channel text, title text, encrypted_token text) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,0));
  if exists(select 1 from public.social_connections where user_id=owner_id and (channel_id<>channel or status='disconnecting')) then raise exception 'Disconnect before changing channel'; end if;
  delete from public.social_oauth_states where user_id=owner_id and state_hash=state_digest and consumed and expires_at>now();
  if not found then raise exception 'Authorization expired or disconnected'; end if;
  insert into public.social_connections(user_id,channel_id,channel_title,refresh_token) values(owner_id,channel,title,encrypted_token)
  on conflict(user_id) do update set channel_title=excluded.channel_title,refresh_token=excluded.refresh_token,status='connected',revoked_at=null,verified_at=now();
end $$;
create function public.claim_social_post(post_id uuid, worker_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.social_connections c join public.social_posts p on p.connection_id=c.id
    where p.id=post_id and c.status='connected' for update of c;
  if not found then return false; end if;
  update public.social_posts set lease_token=worker_token,lease_until=now()+interval '15 minutes',updated_at=now()
  where id=post_id and (lease_until is null or lease_until<now());
  return found;
end $$;

create function public.enqueue_social_post(owner_id uuid, payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.social_connections; existing uuid; result uuid;
begin
  select * into c from public.social_connections where user_id=owner_id for update;
  if c.id is null or c.status<>'connected' then raise exception 'Connect YouTube before uploading.'; end if;
  select id into existing from public.social_posts where user_id=owner_id and request_id=(payload->>'requestId')::uuid;
  if existing is not null then return existing; end if;
  if (select count(*) from public.social_posts where user_id=owner_id and status in ('queued','uploading','processing','scheduled','cancelling'))>=10 then raise exception 'You already have ten pending uploads. Finish or cancel one first.'; end if;
  insert into public.social_posts(user_id,connection_id,request_id,source_kind,source_project_id,source_output_key,source_path,title,description,visibility,scheduled_at,made_for_kids,synthetic_media)
  values(owner_id,c.id,(payload->>'requestId')::uuid,payload->'source'->>'kind',(payload->'source'->>'projectId')::uuid,payload->'source'->>'outputKey',payload->>'sourcePath',payload->>'title',payload->>'description',payload->>'visibility',(payload->>'scheduledAt')::timestamptz,(payload->>'madeForKids')::boolean,(payload->>'syntheticMedia')::boolean) returning id into result;
  return result;
end $$;

create function public.begin_social_disconnect(owner_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,0));
  perform 1 from public.social_connections where user_id=owner_id for update;
  if exists(select 1 from public.social_posts where user_id=owner_id and lease_until>now()) then
    raise exception 'An upload worker is active. Wait for it to stop before disconnecting.';
  end if;
  delete from public.social_oauth_states where user_id=owner_id;
  update public.social_connections set status='disconnecting',disconnect_requested_at=coalesce(disconnect_requested_at,now()) where user_id=owner_id;
  return found;
end $$;
revoke all on function public.claim_social_post(uuid,uuid),public.enqueue_social_post(uuid,jsonb),public.begin_social_disconnect(uuid) from public,anon,authenticated;
grant execute on function public.claim_social_post(uuid,uuid),public.enqueue_social_post(uuid,jsonb),public.begin_social_disconnect(uuid) to service_role;
revoke all on function public.begin_social_oauth(uuid,text,text),public.complete_social_oauth(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_social_oauth(uuid,text,text),public.complete_social_oauth(uuid,text,text,text,text) to service_role;
