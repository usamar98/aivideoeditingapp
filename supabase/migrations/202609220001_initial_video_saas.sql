-- FrameFoundry foundation: multi-tenant projects, private assets, idempotent generations,
-- credit accounting, and a shared feature publishing catalog.

create extension if not exists pgcrypto;
create schema if not exists private;
create schema if not exists api;

create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.feature_status as enum ('draft', 'published', 'unavailable', 'retired');
create type public.generation_status as enum ('created', 'reserved', 'submitted', 'processing', 'succeeded', 'failed', 'cancelled');
create type public.asset_kind as enum ('reference', 'storyboard', 'audio', 'video', 'caption', 'thumbnail', 'export');
create type public.ledger_kind as enum ('grant', 'purchase', 'reservation', 'usage', 'release', 'refund', 'adjustment');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  guide jsonb not null default '{}'::jsonb,
  recap text not null default '',
  visual_style text not null default '',
  aspect_ratio text not null default '16:9' check (aspect_ratio in ('16:9', '9:16')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, slug)
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  name text not null,
  appearance text not null default '',
  wardrobe text not null default '',
  proportions text not null default '',
  personality text not null default '',
  voice_provider text,
  voice_id text,
  approved_version integer not null default 0 check (approved_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  title text not null,
  logline text not null default '',
  recap text not null default '',
  status text not null default 'draft' check (status in ('draft', 'storyboard', 'animating', 'assembling', 'complete', 'failed')),
  aspect_ratio text not null check (aspect_ratio in ('16:9', '9:16')),
  target_duration_seconds numeric(6,2) not null check (target_duration_seconds between 30 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, episode_number)
);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null,
  characters jsonb not null default '[]'::jsonb,
  setting text not null default '',
  action text not null default '',
  dialogue text not null default '',
  camera text not null default '',
  target_duration_seconds numeric(5,2) not null check (target_duration_seconds between 3 and 15),
  audio_duration_seconds numeric(5,2) check (audio_duration_seconds between 0 and 15),
  caption_cues jsonb not null default '[]'::jsonb,
  approved boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, position)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete restrict,
  kind public.asset_kind not null,
  storage_bucket text not null default 'private-media',
  storage_path text not null,
  mime_type text not null,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric(10,3) check (duration_seconds is null or duration_seconds >= 0),
  checksum_sha256 text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (storage_bucket, storage_path)
);

create table public.character_asset_versions (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  version integer not null check (version > 0),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (character_id, version, asset_id)
);

create table public.credit_accounts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  cached_balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  operation text not null,
  provider text not null,
  model text not null,
  settings jsonb not null default '{}'::jsonb,
  input_asset_versions jsonb not null default '[]'::jsonb,
  provider_request_id text,
  status public.generation_status not null default 'created',
  idempotency_key text not null,
  estimated_credits numeric(12,2) not null check (estimated_credits >= 0),
  reported_credits numeric(12,2) check (reported_credits is null or reported_credits >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  output_asset_ids uuid[] not null default '{}',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  unique (workspace_id, idempotency_key),
  unique (provider, provider_request_id)
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  kind public.ledger_kind not null,
  amount numeric(12,2) not null check (amount <> 0),
  idempotency_key text not null unique,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.feature_content (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  status public.feature_status not null default 'draft',
  content jsonb not null,
  seo jsonb not null,
  development_only boolean not null default false,
  published_at timestamptz,
  modified_at timestamptz not null default now(),
  modified_by uuid references auth.users(id) on delete set null
);

create table public.public_examples (
  id uuid primary key default gen_random_uuid(),
  feature_slug text not null references public.feature_content(slug) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  title text not null,
  description text not null,
  transcript text,
  thumbnail_asset_id uuid references public.assets(id) on delete restrict,
  published boolean not null default false,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.webhook_events (
  id text primary key,
  provider text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.increment_credit_balance(
  target_workspace_id uuid,
  credit_amount numeric,
  event_key text
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_balance numeric;
begin
  if credit_amount <= 0 then raise exception 'credit amount must be positive'; end if;
  insert into public.credit_accounts (workspace_id, cached_balance)
  values (target_workspace_id, credit_amount)
  on conflict (workspace_id) do update
  set cached_balance = public.credit_accounts.cached_balance + excluded.cached_balance,
      updated_at = now()
  returning cached_balance into new_balance;
  return new_balance;
end;
$$;

revoke all on function public.increment_credit_balance(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.increment_credit_balance(uuid, numeric, text) to service_role;

-- A purchase ledger entry and its cached balance update commit together and can be retried safely.
create or replace function public.apply_credit_purchase(
  target_workspace_id uuid,
  credit_amount numeric,
  event_key text,
  external_id text
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_balance numeric;
begin
  if credit_amount <= 0 then raise exception 'credit amount must be positive'; end if;
  insert into public.credit_ledger (workspace_id, kind, amount, idempotency_key, external_reference)
  values (target_workspace_id, 'purchase', credit_amount, event_key, external_id)
  on conflict (idempotency_key) do nothing;

  if found then
    insert into public.credit_accounts (workspace_id, cached_balance)
    values (target_workspace_id, credit_amount)
    on conflict (workspace_id) do update
    set cached_balance = public.credit_accounts.cached_balance + excluded.cached_balance,
        updated_at = now();
  end if;

  select cached_balance into new_balance from public.credit_accounts where workspace_id = target_workspace_id;
  return new_balance;
end;
$$;

revoke all on function public.apply_credit_purchase(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.apply_credit_purchase(uuid, numeric, text, text) to service_role;

-- Every foreign key used by joins, cascades, or RLS membership checks is indexed.
create index workspace_members_user_idx on public.workspace_members (user_id, workspace_id);
create index series_workspace_active_idx on public.series (workspace_id, updated_at desc) where deleted_at is null;
create index characters_workspace_idx on public.characters (workspace_id, series_id);
create index episodes_workspace_series_idx on public.episodes (workspace_id, series_id, episode_number desc);
create index scenes_workspace_episode_idx on public.scenes (workspace_id, episode_id, position);
create index assets_workspace_active_idx on public.assets (workspace_id, created_at desc) where deleted_at is null;
create index assets_owner_idx on public.assets (owner_id);
create index character_asset_versions_workspace_idx on public.character_asset_versions (workspace_id, character_id);
create index character_asset_versions_asset_idx on public.character_asset_versions (asset_id);
create index generations_workspace_status_idx on public.generations (workspace_id, status, created_at desc);
create index generations_scene_idx on public.generations (scene_id);
create index credit_ledger_workspace_idx on public.credit_ledger (workspace_id, created_at desc);
create index credit_ledger_generation_idx on public.credit_ledger (generation_id);
create index public_examples_asset_idx on public.public_examples (asset_id);
create index public_examples_thumbnail_idx on public.public_examples (thumbnail_asset_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces for each row execute function private.set_updated_at();
create trigger series_set_updated_at before update on public.series for each row execute function private.set_updated_at();
create trigger characters_set_updated_at before update on public.characters for each row execute function private.set_updated_at();
create trigger episodes_set_updated_at before update on public.episodes for each row execute function private.set_updated_at();
create trigger scenes_set_updated_at before update on public.scenes for each row execute function private.set_updated_at();

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;

-- Atomic onboarding prevents partially-created workspaces and avoids opening broad insert policies.
create or replace function private.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  created_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(trim(workspace_name)) < 2 or char_length(trim(workspace_name)) > 120 then
    raise exception 'workspace name must be between 2 and 120 characters';
  end if;

  insert into public.profiles (id) values (current_user_id)
  on conflict (id) do nothing;
  insert into public.workspaces (name, owner_id)
  values (trim(workspace_name), current_user_id)
  returning id into created_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (created_workspace_id, current_user_id, 'owner');
  insert into public.credit_accounts (workspace_id, cached_balance)
  values (created_workspace_id, 0);
  return created_workspace_id;
end;
$$;

revoke all on function private.create_workspace(text) from public, anon;
grant execute on function private.create_workspace(text) to authenticated;

create or replace function api.create_workspace(workspace_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_workspace(workspace_name);
$$;

grant execute on function api.create_workspace(text) to authenticated;

create or replace function private.ensure_personal_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  select id into existing_workspace_id
  from public.workspaces
  where owner_id = current_user_id
  order by created_at
  limit 1;
  if existing_workspace_id is not null then return existing_workspace_id; end if;
  return private.create_workspace(coalesce(nullif(trim(workspace_name), ''), 'My studio'));
end;
$$;

revoke all on function private.ensure_personal_workspace(text) from public, anon;
grant execute on function private.ensure_personal_workspace(text) to authenticated;

create or replace function api.ensure_personal_workspace(workspace_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.ensure_personal_workspace(workspace_name);
$$;

grant execute on function api.ensure_personal_workspace(text) to authenticated;

-- Lock the account row so concurrent reservations cannot overspend.
create or replace function private.reserve_generation_credits(
  target_workspace_id uuid,
  target_generation_id uuid,
  credits numeric,
  ledger_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_balance numeric;
begin
  if not (select private.is_workspace_member(target_workspace_id)) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;
  if credits <= 0 then raise exception 'credits must be positive'; end if;
  if exists (select 1 from public.credit_ledger where idempotency_key = ledger_idempotency_key and generation_id = target_generation_id and kind = 'reservation') then
    return target_generation_id;
  end if;

  select cached_balance into account_balance
  from public.credit_accounts
  where workspace_id = target_workspace_id
  for update;

  if account_balance is null or account_balance < credits then
    raise exception 'insufficient credits' using errcode = 'P0001';
  end if;

  insert into public.credit_ledger (workspace_id, generation_id, kind, amount, idempotency_key)
  values (target_workspace_id, target_generation_id, 'reservation', -credits, ledger_idempotency_key)
  on conflict (idempotency_key) do nothing;

  if found then
    update public.credit_accounts
    set cached_balance = cached_balance - credits, updated_at = now()
    where workspace_id = target_workspace_id;
    update public.generations set status = 'reserved' where id = target_generation_id and status = 'created';
  end if;
  return target_generation_id;
end;
$$;

revoke all on function private.reserve_generation_credits(uuid, uuid, numeric, text) from public, anon;
grant execute on function private.reserve_generation_credits(uuid, uuid, numeric, text) to authenticated;

create or replace function api.reserve_generation_credits(
  workspace_id uuid,
  generation_id uuid,
  credits numeric,
  idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.reserve_generation_credits(workspace_id, generation_id, credits, idempotency_key);
$$;

revoke all on schema api from public, anon;
grant usage on schema api to authenticated;
grant execute on function api.create_workspace(text) to authenticated;
grant execute on function api.ensure_personal_workspace(text) to authenticated;
grant execute on function api.reserve_generation_credits(uuid, uuid, numeric, text) to authenticated;

create or replace function private.settle_generation_credits(
  target_generation_id uuid,
  used_credits numeric,
  ledger_idempotency_key text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  reserved_credits numeric;
  existing_reported_credits numeric;
  unused_credits numeric;
begin
  select workspace_id, reported_credits into target_workspace_id, existing_reported_credits
  from public.generations where id = target_generation_id for update;
  if target_workspace_id is null then raise exception 'generation not found'; end if;
  if (select auth.role()) <> 'service_role' and not (select private.is_workspace_member(target_workspace_id)) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;
  if used_credits < 0 then raise exception 'invalid settled credit amount'; end if;
  if existing_reported_credits is not null then
    return 0;
  end if;

  select coalesce(-sum(amount), 0) into reserved_credits
  from public.credit_ledger
  where generation_id = target_generation_id and kind = 'reservation';
  if used_credits > reserved_credits then
    raise exception 'used credits exceed the reserved amount';
  end if;

  unused_credits := reserved_credits - used_credits;
  if unused_credits > 0 then
    insert into public.credit_ledger (workspace_id, generation_id, kind, amount, idempotency_key)
    values (target_workspace_id, target_generation_id, 'release', unused_credits, ledger_idempotency_key)
    on conflict (idempotency_key) do nothing;
    if found then
      update public.credit_accounts
      set cached_balance = cached_balance + unused_credits, updated_at = now()
      where workspace_id = target_workspace_id;
    end if;
  end if;

  update public.generations
  set reported_credits = used_credits
  where id = target_generation_id and reported_credits is null;
  return unused_credits;
end;
$$;

revoke all on function private.settle_generation_credits(uuid, numeric, text) from public, anon;
grant execute on function private.settle_generation_credits(uuid, numeric, text) to authenticated, service_role;

create or replace function api.settle_generation_credits(
  generation_id uuid,
  used_credits numeric,
  idempotency_key text
)
returns numeric
language sql
security invoker
set search_path = ''
as $$
  select private.settle_generation_credits(generation_id, used_credits, idempotency_key);
$$;

grant usage on schema api to service_role;
grant execute on function api.settle_generation_credits(uuid, numeric, text) to authenticated, service_role;

-- RLS is enabled on every public table. Service credentials stay server-side.
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.series enable row level security;
alter table public.characters enable row level security;
alter table public.episodes enable row level security;
alter table public.scenes enable row level security;
alter table public.assets enable row level security;
alter table public.character_asset_versions enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.generations enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.feature_content enable row level security;
alter table public.public_examples enable row level security;
alter table public.webhook_events enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id and is_admin = false);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy workspaces_member_select on public.workspaces for select to authenticated using ((select private.is_workspace_member(id)));
create policy workspaces_owner_update on public.workspaces for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy members_member_select on public.workspace_members for select to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy series_member_all on public.series for all to authenticated using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
create policy characters_member_all on public.characters for all to authenticated using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
create policy episodes_member_all on public.episodes for all to authenticated using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
create policy scenes_member_all on public.scenes for all to authenticated using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
create policy assets_member_select on public.assets for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy assets_member_insert on public.assets for insert to authenticated with check (
  (select private.is_workspace_member(workspace_id))
  and owner_id = (select auth.uid())
  and storage_path like workspace_id::text || '/' || (select auth.uid())::text || '/%'
);
create policy assets_owner_update on public.assets for update to authenticated using ((select private.is_workspace_member(workspace_id)) and owner_id = (select auth.uid())) with check ((select private.is_workspace_member(workspace_id)) and owner_id = (select auth.uid()));
create policy assets_owner_delete on public.assets for delete to authenticated using ((select private.is_workspace_member(workspace_id)) and owner_id = (select auth.uid()));
create policy character_assets_member_all on public.character_asset_versions for all to authenticated using ((select private.is_workspace_member(workspace_id))) with check ((select private.is_workspace_member(workspace_id)));
create policy credit_accounts_member_select on public.credit_accounts for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy generations_member_select on public.generations for select to authenticated using ((select private.is_workspace_member(workspace_id)));
create policy generations_member_insert on public.generations for insert to authenticated with check ((select private.is_workspace_member(workspace_id)) and requested_by = (select auth.uid()));
create policy ledger_member_select on public.credit_ledger for select to authenticated using ((select private.is_workspace_member(workspace_id)));

create policy features_public_read on public.feature_content for select to anon, authenticated using (status = 'published' and development_only = false);
create policy features_admin_all on public.feature_content for all to authenticated using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin)) with check (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));
create policy examples_public_read on public.public_examples for select to anon, authenticated using (published = true);
create policy examples_admin_all on public.public_examples for all to authenticated using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin)) with check (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin));

-- Explicit Data API grants: new Supabase projects do not auto-expose tables.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.feature_content, public.public_examples to anon;
grant select, insert, update, delete on public.profiles, public.workspaces, public.workspace_members, public.series, public.characters, public.episodes, public.scenes, public.assets, public.character_asset_versions, public.feature_content, public.public_examples to authenticated;
grant select, insert on public.generations to authenticated;
grant select on public.credit_accounts, public.credit_ledger to authenticated;
revoke update (is_admin) on public.profiles from authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Private-by-default bucket. Paths begin with a workspace UUID; publishing copies approved examples separately.
create or replace function private.is_workspace_storage_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  workspace_segment text := (storage.foldername(object_name))[1];
begin
  if workspace_segment is null or workspace_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_workspace_member(workspace_segment::uuid);
end;
$$;

revoke all on function private.is_workspace_storage_path(text) from public, anon;
grant execute on function private.is_workspace_storage_path(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-media', 'private-media', false, 524288000, array['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'video/mp4', 'text/vtt'])
on conflict (id) do update set public = false;

create policy private_media_select on storage.objects for select to authenticated
using (bucket_id = 'private-media' and (select private.is_workspace_storage_path(name)));
create policy private_media_insert on storage.objects for insert to authenticated
with check (bucket_id = 'private-media' and (select private.is_workspace_storage_path(name)));
create policy private_media_update on storage.objects for update to authenticated
using (bucket_id = 'private-media' and (select private.is_workspace_storage_path(name)))
with check (bucket_id = 'private-media' and (select private.is_workspace_storage_path(name)));
create policy private_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'private-media' and (select private.is_workspace_storage_path(name)));

comment on schema api is 'Add api to Supabase Data API exposed schemas to use authenticated credit reservation RPCs.';
