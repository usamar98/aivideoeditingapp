-- Facebook is isolated from the existing YouTube tables. Backend access only.
create table public.facebook_connections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  facebook_user_id text not null, page_id text not null check(page_id ~ '^[0-9]{1,40}$'), page_name text not null,
  user_token text not null, page_token text not null,
  status text not null default 'connected' check(status in ('connected','reconnect','disconnecting')),
  created_at timestamptz not null default now(), verified_at timestamptz not null default now(),
  unique(id,user_id)
);
create index facebook_connections_remote_user on public.facebook_connections(facebook_user_id);
create table public.facebook_oauth_states (
  user_id uuid primary key references auth.users(id) on delete cascade, state_hash text not null unique,
  consumed boolean not null default false, pending_grant text, facebook_user_id text,
  created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index facebook_oauth_expiry on public.facebook_oauth_states(expires_at);
create table public.facebook_deletions (
  identity_hash text primary key, confirmation_code uuid not null unique default gen_random_uuid(),
  requested_at timestamptz not null default now()
);
create table public.facebook_posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null, request_id uuid not null,
  source_kind text not null check(source_kind in ('faceless','cartoon','ugc','shorts')), source_project_id uuid not null,
  source_output_key text not null default '', source_path text not null,
  title text not null check(length(title) between 1 and 100), description text not null check(length(description)<=2000),
  synthetic_media boolean not null, consent_at timestamptz not null default now(), scheduled_at timestamptz,
  status text not null default 'queued' check(status in ('queued','scheduled','uploading','processing','publishing','published','cancelled','needs_attention')),
  video_id text check(video_id ~ '^[0-9]{1,40}$'), upload_started_at timestamptz, finish_started_at timestamptz,
  attempts integer not null default 0 check(attempts>=0), lease_token uuid, lease_until timestamptz,
  next_check_at timestamptz not null default now(), error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,request_id), foreign key(connection_id,user_id) references public.facebook_connections(id,user_id) on delete cascade,
  check(finish_started_at is null or video_id is not null), check(upload_started_at is null or video_id is not null)
);
create index facebook_posts_owner on public.facebook_posts(user_id,created_at desc);
create index facebook_posts_connection on public.facebook_posts(connection_id);
create index facebook_posts_due on public.facebook_posts(next_check_at) where status in ('queued','scheduled','uploading','processing','publishing');
create unique index facebook_posts_no_duplicate on public.facebook_posts(connection_id,source_path) where status<>'cancelled';

alter table public.facebook_connections enable row level security;
alter table public.facebook_oauth_states enable row level security;
alter table public.facebook_posts enable row level security;
alter table public.facebook_deletions enable row level security;
revoke all on public.facebook_connections,public.facebook_oauth_states,public.facebook_posts,public.facebook_deletions from public,anon,authenticated;
grant select,insert,update,delete on public.facebook_connections,public.facebook_oauth_states,public.facebook_posts,public.facebook_deletions to service_role;

create function public.begin_facebook_oauth(owner_id uuid, state_digest text) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('facebook:'||owner_id::text,0));
  if exists(select 1 from public.facebook_connections where user_id=owner_id and status='disconnecting') then raise exception 'Disconnect pending'; end if;
  insert into public.facebook_oauth_states(user_id,state_hash,expires_at) values(owner_id,state_digest,now()+interval '10 minutes')
  on conflict(user_id) do update set state_hash=excluded.state_hash,consumed=false,pending_grant=null,facebook_user_id=null,created_at=now(),expires_at=excluded.expires_at;
end $$;

-- Preserve the state tombstone between callback and explicit Page selection.
create function public.prepare_facebook_grant(owner_id uuid, state_digest text, remote_user text, remote_hash text, encrypted_grant text) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('facebook-remote:'||remote_user,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('facebook:'||owner_id::text,0));
  update public.facebook_oauth_states s set pending_grant=encrypted_grant,facebook_user_id=remote_user
  where s.user_id=owner_id and s.state_hash=state_digest and s.consumed and s.expires_at>now()
    and not exists(select 1 from public.facebook_deletions d where d.identity_hash=remote_hash and d.requested_at>=s.created_at);
  if not found then raise exception 'Authorization expired or removed'; end if;
end $$;

create function public.complete_facebook_oauth(owner_id uuid, state_digest text, remote_user text, page text, title text, encrypted_user_token text, encrypted_page_token text) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('facebook-remote:'||remote_user,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('facebook:'||owner_id::text,0));
  perform 1 from public.facebook_connections where user_id=owner_id for update;
  if exists(select 1 from public.facebook_connections where user_id=owner_id and (page_id<>page or facebook_user_id<>remote_user or status='disconnecting')) then raise exception 'Disconnect before changing Page or Facebook account'; end if;
  if exists(select 1 from public.facebook_posts where user_id=owner_id and lease_until>now()) then raise exception 'Wait for the active worker'; end if;
  delete from public.facebook_oauth_states where user_id=owner_id and state_hash=state_digest and consumed and pending_grant is not null and facebook_user_id=remote_user and expires_at>now();
  if not found then raise exception 'Authorization expired or removed'; end if;
  insert into public.facebook_connections(user_id,facebook_user_id,page_id,page_name,user_token,page_token) values(owner_id,remote_user,page,title,encrypted_user_token,encrypted_page_token)
  on conflict(user_id) do update set page_name=excluded.page_name,user_token=excluded.user_token,page_token=excluded.page_token,status='connected',verified_at=now();
end $$;

create function public.enqueue_facebook_post(owner_id uuid, payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.facebook_connections; result uuid; scheduled timestamptz;
begin
  select * into c from public.facebook_connections where user_id=owner_id for update;
  if c.id is null or c.status<>'connected' then raise exception 'Connect a Facebook Page first'; end if;
  select id into result from public.facebook_posts where user_id=owner_id and request_id=(payload->>'requestId')::uuid;
  if result is not null then return result; end if;
  if (payload->>'rightsConfirmed')::boolean is distinct from true then raise exception 'Consent required'; end if;
  if (select count(*) from public.facebook_posts where user_id=owner_id and status in ('queued','scheduled','uploading','processing','publishing'))>=10 then raise exception 'Ten pending posts already exist'; end if;
  scheduled=(payload->>'scheduledAt')::timestamptz;
  if scheduled is not null and (scheduled<now()+interval '15 minutes' or scheduled>now()+interval '90 days') then raise exception 'Invalid schedule'; end if;
  insert into public.facebook_posts(user_id,connection_id,request_id,source_kind,source_project_id,source_output_key,source_path,title,description,synthetic_media,scheduled_at,status,next_check_at)
  values(owner_id,c.id,(payload->>'requestId')::uuid,payload->'source'->>'kind',(payload->'source'->>'projectId')::uuid,payload->'source'->>'outputKey',payload->>'sourcePath',payload->>'title',payload->>'description',(payload->>'syntheticMedia')::boolean,scheduled,case when scheduled is null then 'queued' else 'scheduled' end,coalesce(scheduled,now())) returning id into result;
  return result;
end $$;

create function public.claim_facebook_post(post_id uuid, worker_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.facebook_connections c join public.facebook_posts p on p.connection_id=c.id where p.id=post_id and c.status='connected' for update of c;
  if not found then return false; end if;
  update public.facebook_posts set lease_token=worker_token,lease_until=now()+interval '15 minutes',updated_at=now()
  where id=post_id and status not in ('cancelled','published') and (lease_until is null or lease_until<now());
  return found;
end $$;

-- Atomic point of no cancellation. Persist BEFORE sending a non-idempotent finish call.
create function public.begin_facebook_finish(post_id uuid, worker_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.facebook_connections c join public.facebook_posts p on p.connection_id=c.id where p.id=post_id and c.status='connected' for update of c;
  if not found then return false; end if;
  update public.facebook_posts set finish_started_at=now(),status='publishing',updated_at=now()
  where id=post_id and lease_token=worker_token and lease_until>now()+interval '65 seconds' and video_id is not null and upload_started_at is not null
    and finish_started_at is null and status not in ('cancelled','published') and (scheduled_at is null or scheduled_at<=now());
  return found;
end $$;

create function public.cancel_facebook_post(owner_id uuid, post_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare p public.facebook_posts;
begin
  select * into p from public.facebook_posts where id=post_id and user_id=owner_id for update;
  if p.id is null then raise exception 'Post not found'; end if;
  if p.finish_started_at is not null or p.status='published' then raise exception 'Publication has started. Manage this Reel in Meta Business Suite'; end if;
  update public.facebook_posts set status='cancelled',error_message=null,updated_at=now() where id=p.id;
  return true;
end $$;

create function public.begin_facebook_disconnect(owner_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('facebook:'||owner_id::text,0));
  perform 1 from public.facebook_connections where user_id=owner_id for update;
  if exists(select 1 from public.facebook_posts where user_id=owner_id and lease_until>now()) then raise exception 'Wait for the active worker to stop'; end if;
  delete from public.facebook_oauth_states where user_id=owner_id;
  update public.facebook_connections set status='disconnecting' where user_id=owner_id;
end $$;

-- Called only after the server verifies Meta's signed_request HMAC. Also handles deauthorization.
create function public.delete_facebook_data(remote_user text, remote_hash text) returns uuid language plpgsql security invoker set search_path='' as $$
declare receipt uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('facebook-remote:'||remote_user,0));
  insert into public.facebook_deletions(identity_hash) values(remote_hash) on conflict(identity_hash) do update set requested_at=now() returning confirmation_code into receipt;
  delete from public.facebook_oauth_states where facebook_user_id=remote_user;
  delete from public.facebook_connections where facebook_user_id=remote_user;
  return receipt;
end $$;

revoke all on function public.begin_facebook_oauth(uuid,text),public.prepare_facebook_grant(uuid,text,text,text,text),public.complete_facebook_oauth(uuid,text,text,text,text,text,text),public.enqueue_facebook_post(uuid,jsonb),public.claim_facebook_post(uuid,uuid),public.begin_facebook_finish(uuid,uuid),public.cancel_facebook_post(uuid,uuid),public.begin_facebook_disconnect(uuid),public.delete_facebook_data(text,text) from public,anon,authenticated;
grant execute on function public.begin_facebook_oauth(uuid,text),public.prepare_facebook_grant(uuid,text,text,text,text),public.complete_facebook_oauth(uuid,text,text,text,text,text,text),public.enqueue_facebook_post(uuid,jsonb),public.claim_facebook_post(uuid,uuid),public.begin_facebook_finish(uuid,uuid),public.cancel_facebook_post(uuid,uuid),public.begin_facebook_disconnect(uuid),public.delete_facebook_data(text,text) to service_role;
