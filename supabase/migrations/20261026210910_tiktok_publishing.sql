-- Isolated, backend-only credentials and publishing queue. No browser grants.
create table public.tiktok_connections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  open_id text not null check(length(open_id) between 1 and 512), display_name text not null, username text not null,
  tokens text not null, status text not null default 'connected' check(status in ('connected','reconnect','disconnecting')),
  token_lease uuid, token_lease_until timestamptz,
  created_at timestamptz not null default now(), verified_at timestamptz not null default now(), unique(id,user_id)
);
create table public.tiktok_oauth_states (
  user_id uuid primary key references auth.users(id) on delete cascade, state_hash text not null unique check(length(state_hash)=43),
  consumed boolean not null default false, created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index tiktok_oauth_expiry on public.tiktok_oauth_states(expires_at);
create table public.tiktok_posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null, request_id uuid not null,
  source_kind text not null check(source_kind in ('faceless','cartoon','ugc','shorts')), source_project_id uuid not null,
  source_output_key text not null default '' check(source_output_key ~ '^[A-Za-z0-9_-]{0,80}$'), source_path text not null check(length(source_path) between 1 and 1024),
  caption text not null check(length(caption)<=2200),
  privacy text not null check(privacy in ('PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS','FOLLOWER_OF_CREATOR','SELF_ONLY')),
  allow_comments boolean not null, allow_duet boolean not null, allow_stitch boolean not null,
  commercial_content boolean not null, brand_organic boolean not null, branded_content boolean not null, synthetic_media boolean not null,
  rights_confirmed boolean not null check(rights_confirmed), music_confirmed boolean not null check(music_confirmed), branded_policy_confirmed boolean not null,
  consent_at timestamptz not null default now(), consent_version text not null default '2026-10-27', scheduled_at timestamptz,
  status text not null check(status in ('queued','scheduled','publishing','processing','published','cancelled','needs_attention')),
  init_started_at timestamptz, publish_id text check(publish_id ~ '^[A-Za-z0-9_.~-]{1,128}$'), public_post_id text check(public_post_id ~ '^[0-9]{1,40}$'),
  media_ticket_hash text check(length(media_ticket_hash)=43), media_expires_at timestamptz,
  attempts integer not null default 0 check(attempts>=0), lease_token uuid, lease_until timestamptz,
  next_check_at timestamptz not null default now(), error_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,request_id), foreign key(connection_id,user_id) references public.tiktok_connections(id,user_id) on delete cascade,
  check(commercial_content = (brand_organic or branded_content)),
  check(not branded_content or (branded_policy_confirmed and privacy<>'SELF_ONLY')),
  check(publish_id is null or init_started_at is not null)
);
create index tiktok_posts_owner on public.tiktok_posts(user_id,created_at desc);
create index tiktok_posts_connection on public.tiktok_posts(connection_id);
create index tiktok_posts_due on public.tiktok_posts(next_check_at) where status in ('queued','scheduled','publishing','processing');
create unique index tiktok_posts_no_duplicate on public.tiktok_posts(connection_id,source_path) where status<>'cancelled';
alter table public.tiktok_connections enable row level security;
alter table public.tiktok_oauth_states enable row level security;
alter table public.tiktok_posts enable row level security;
revoke all on public.tiktok_connections,public.tiktok_oauth_states,public.tiktok_posts from public,anon,authenticated;
grant select,insert,update,delete on public.tiktok_connections,public.tiktok_oauth_states,public.tiktok_posts to service_role;

create function public.begin_tiktok_oauth(owner_id uuid,state_digest text) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tiktok:'||owner_id::text,0));
  if exists(select 1 from public.tiktok_connections where user_id=owner_id and status='disconnecting') then raise exception 'Disconnect pending'; end if;
  insert into public.tiktok_oauth_states(user_id,state_hash,expires_at) values(owner_id,state_digest,now()+interval '10 minutes')
  on conflict(user_id) do update set state_hash=excluded.state_hash,consumed=false,created_at=now(),expires_at=excluded.expires_at;
end $$;
create function public.complete_tiktok_oauth(owner_id uuid,state_digest text,remote_user text,title text,handle text,encrypted_tokens text) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tiktok:'||owner_id::text,0));
  perform 1 from public.tiktok_connections where user_id=owner_id for update;
  if exists(select 1 from public.tiktok_connections where user_id=owner_id and (open_id<>remote_user or status='disconnecting' or token_lease_until>now())) then raise exception 'Reconnect the same account after active work stops, or disconnect first'; end if;
  if exists(select 1 from public.tiktok_posts where user_id=owner_id and lease_until>now()) then raise exception 'Wait for active worker'; end if;
  delete from public.tiktok_oauth_states where user_id=owner_id and state_hash=state_digest and consumed and expires_at>now();
  if not found then raise exception 'Authorization expired or removed'; end if;
  insert into public.tiktok_connections(user_id,open_id,display_name,username,tokens) values(owner_id,remote_user,title,handle,encrypted_tokens)
  on conflict(user_id) do update set display_name=excluded.display_name,username=excluded.username,tokens=excluded.tokens,status='connected',token_lease=null,token_lease_until=null,verified_at=now();
end $$;
-- Refresh tokens may rotate. Serialize all token use; never overwrite newer credentials.
create function public.claim_tiktok_token(owner_id uuid,worker_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.tiktok_connections set token_lease=worker_token,token_lease_until=now()+interval '90 seconds'
  where user_id=owner_id and status='connected' and (token_lease_until is null or token_lease_until<now());
  return found;
end $$;
create function public.enqueue_tiktok_post(owner_id uuid,payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.tiktok_connections; result uuid; scheduled timestamptz;
begin
  select * into c from public.tiktok_connections where user_id=owner_id for update;
  if c.id is null or c.status<>'connected' then raise exception 'Connect TikTok first'; end if;
  select id into result from public.tiktok_posts where user_id=owner_id and request_id=(payload->>'requestId')::uuid;
  if result is not null then return result; end if;
  if (payload->>'rightsConfirmed')::boolean is distinct from true or (payload->>'musicConfirmed')::boolean is distinct from true then raise exception 'Consent required'; end if;
  if (select count(*) from public.tiktok_posts where user_id=owner_id and status in ('queued','scheduled','publishing','processing'))>=10 then raise exception 'Ten pending posts already exist'; end if;
  scheduled=(payload->>'scheduledAt')::timestamptz;
  if scheduled is not null and (scheduled<now()+interval '15 minutes' or scheduled>now()+interval '90 days') then raise exception 'Invalid schedule'; end if;
  insert into public.tiktok_posts(user_id,connection_id,request_id,source_kind,source_project_id,source_output_key,source_path,caption,privacy,allow_comments,allow_duet,allow_stitch,commercial_content,brand_organic,branded_content,synthetic_media,rights_confirmed,music_confirmed,branded_policy_confirmed,scheduled_at,status,next_check_at)
  values(owner_id,c.id,(payload->>'requestId')::uuid,payload->'source'->>'kind',(payload->'source'->>'projectId')::uuid,payload->'source'->>'outputKey',payload->>'sourcePath',payload->>'caption',payload->>'privacy',(payload->>'allowComments')::boolean,(payload->>'allowDuet')::boolean,(payload->>'allowStitch')::boolean,(payload->>'commercialContent')::boolean,(payload->>'brandOrganic')::boolean,(payload->>'brandedContent')::boolean,(payload->>'syntheticMedia')::boolean,true,true,(payload->>'brandedPolicyConfirmed')::boolean,scheduled,case when scheduled is null then 'queued' else 'scheduled' end,coalesce(scheduled,now())) returning id into result;
  return result;
end $$;
create function public.claim_tiktok_post(post_id uuid,worker_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.tiktok_connections c join public.tiktok_posts p on p.connection_id=c.id where p.id=post_id and c.status='connected' for update of c;
  if not found then return false; end if;
  update public.tiktok_posts set lease_token=worker_token,lease_until=now()+interval '15 minutes',updated_at=now()
  where id=post_id and status not in ('cancelled','published') and (lease_until is null or lease_until<now());
  return found;
end $$;
-- Persist intent BEFORE non-idempotent init. A lost response must never create a second post.
create function public.begin_tiktok_publish(post_id uuid,worker_token uuid,ticket_hash text,media_expiry timestamptz) returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.tiktok_connections c join public.tiktok_posts p on p.connection_id=c.id where p.id=post_id and c.status='connected' for update of c;
  if not found then return false; end if;
  if length(ticket_hash)<>43 or media_expiry<now()+interval '1 hour' or media_expiry>now()+interval '3 hours' then raise exception 'Invalid media ticket'; end if;
  update public.tiktok_posts set init_started_at=now(),status='publishing',media_ticket_hash=ticket_hash,media_expires_at=media_expiry,updated_at=now()
  where id=post_id and lease_token=worker_token and lease_until>now()+interval '65 seconds' and init_started_at is null
    and status not in ('cancelled','published') and (scheduled_at is null or scheduled_at<=now());
  return found;
end $$;
create function public.cancel_tiktok_post(owner_id uuid,post_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare p public.tiktok_posts;
begin
  select * into p from public.tiktok_posts where id=post_id and user_id=owner_id for update;
  if p.id is null then raise exception 'Post not found'; end if;
  if p.init_started_at is not null or p.status='published' then raise exception 'Posting started. Manage this post in TikTok'; end if;
  update public.tiktok_posts set status='cancelled',error_message=null,updated_at=now() where id=p.id;
  return true;
end $$;
create function public.begin_tiktok_disconnect(owner_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tiktok:'||owner_id::text,0));
  perform 1 from public.tiktok_connections where user_id=owner_id for update;
  if exists(select 1 from public.tiktok_connections where user_id=owner_id and token_lease_until>now()) or exists(select 1 from public.tiktok_posts where user_id=owner_id and lease_until>now()) then raise exception 'Wait for active worker'; end if;
  delete from public.tiktok_oauth_states where user_id=owner_id;
  update public.tiktok_connections set status='disconnecting' where user_id=owner_id;
end $$;
revoke all on function public.begin_tiktok_oauth(uuid,text),public.complete_tiktok_oauth(uuid,text,text,text,text,text),public.claim_tiktok_token(uuid,uuid),public.enqueue_tiktok_post(uuid,jsonb),public.claim_tiktok_post(uuid,uuid),public.begin_tiktok_publish(uuid,uuid,text,timestamptz),public.cancel_tiktok_post(uuid,uuid),public.begin_tiktok_disconnect(uuid) from public,anon,authenticated;
grant execute on function public.begin_tiktok_oauth(uuid,text),public.complete_tiktok_oauth(uuid,text,text,text,text,text),public.claim_tiktok_token(uuid,uuid),public.enqueue_tiktok_post(uuid,jsonb),public.claim_tiktok_post(uuid,uuid),public.begin_tiktok_publish(uuid,uuid,text,timestamptz),public.cancel_tiktok_post(uuid,uuid),public.begin_tiktok_disconnect(uuid) to service_role;
