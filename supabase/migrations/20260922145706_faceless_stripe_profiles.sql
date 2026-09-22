-- Private faceless projects and Stripe billing. Apply after the initial migration.
grant usage on schema private to service_role;
update storage.buckets set allowed_mime_types = array['image/png','image/jpeg','image/webp','audio/mpeg','audio/wav','video/mp4','text/vtt','application/json'] where id = 'private-media';
alter table public.profiles add column username text unique check (username ~ '^[a-z0-9_]{3,30}$');
-- Column revokes do not override table-level grants. Restrict profile writes explicitly.
revoke update, insert on public.profiles from authenticated;
grant update (username, display_name, avatar_path) on public.profiles to authenticated;
grant insert (id, username, display_name, avatar_path) on public.profiles to authenticated;

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null unique references public.workspaces(id),
  stripe_customer_id text not null unique,
  checkout_lock_token uuid,
  checkout_lock_until timestamptz,
  created_at timestamptz not null default now()
);
create table public.billing_subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  plan_name text not null,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create index billing_subscriptions_user on public.billing_subscriptions(user_id);
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
create policy billing_customer_own on public.billing_customers for select to authenticated using (user_id = (select auth.uid()));
create policy billing_subscription_own on public.billing_subscriptions for select to authenticated using (user_id = (select auth.uid()));
grant select on public.billing_customers, public.billing_subscriptions to authenticated;
grant all on public.billing_customers, public.billing_subscriptions to service_role;

create table public.faceless_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id),
  title text not null default 'Untitled video',
  brief jsonb not null,
  storyboard jsonb,
  status text not null default 'draft' check (status in ('draft','planning','ready','rendering','complete','failed')),
  generation_id uuid references public.generations(id),
  output_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index faceless_projects_user_created on public.faceless_projects(user_id, created_at desc);
create index faceless_projects_workspace on public.faceless_projects(workspace_id);
create index faceless_projects_generation on public.faceless_projects(generation_id);
alter table public.faceless_projects enable row level security;
create policy faceless_read_own on public.faceless_projects for select to authenticated using (user_id = (select auth.uid()));
-- Mutations go through authenticated server actions, not arbitrary client status/credit writes.
grant select on public.faceless_projects to authenticated;
grant all on public.faceless_projects to service_role;
create trigger faceless_updated before update on public.faceless_projects for each row execute function private.set_updated_at();

-- Server-only start transaction: the server has already checked ownership via getUser.
-- Lock the project and credit account together; costs cannot be supplied by a browser.
create function public.start_faceless_job(project_id uuid, owner_id uuid, job_id uuid, job_kind text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare p public.faceless_projects; cost numeric; balance numeric;
begin
  if job_kind not in ('script','render') then raise exception 'Invalid operation'; end if;
  select * into p from public.faceless_projects where id = project_id and user_id = owner_id for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.status in ('planning','rendering') then return p.generation_id; end if;
  if (select count(*) from public.generations where requested_by = owner_id and created_at > now() - interval '1 day' and operation like 'faceless-%') >= 50 then raise exception 'Daily generation limit reached'; end if;
  if job_kind = 'render' and p.storyboard is null then raise exception 'Review a script before rendering'; end if;
  cost := case when job_kind = 'script' then 2 else 20 end;
  select cached_balance into balance from public.credit_accounts where workspace_id = p.workspace_id for update;
  if balance is null or balance < cost then raise exception 'Not enough credits. Add a plan in your profile.'; end if;
  if (select count(*) from public.generations where workspace_id = p.workspace_id and status in ('reserved','submitted','processing')) >= 2 then raise exception 'Two jobs are already running. Please wait.'; end if;
  insert into public.generations (id, workspace_id, requested_by, operation, provider, model, settings, status, idempotency_key, estimated_credits)
  values (job_id, p.workspace_id, owner_id, 'faceless-' || job_kind, 'trigger.dev', case when job_kind = 'script' then 'gemini' else 'flux-schnell+elevenlabs+ffmpeg' end,
    jsonb_build_object('projectId', p.id, 'kind', job_kind, 'brief', p.brief, 'storyboard', p.storyboard), 'reserved', job_id::text, cost);
  insert into public.credit_ledger (workspace_id, generation_id, kind, amount, idempotency_key) values (p.workspace_id, job_id, 'reservation', -cost, job_id::text || ':reserve');
  update public.credit_accounts set cached_balance = cached_balance - cost where workspace_id = p.workspace_id;
  update public.faceless_projects set status = case when job_kind = 'script' then 'planning' else 'rendering' end, generation_id = job_id, error_message = null where id = p.id;
  return job_id;
end; $$;
revoke all on function public.start_faceless_job(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.start_faceless_job(uuid,uuid,uuid,text) to service_role;

create function public.finish_faceless_job(job_id uuid, succeeded boolean, result_storyboard jsonb default null, result_path text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare g public.generations; next_status text;
begin
  select * into g from public.generations where id = job_id and operation in ('faceless-script','faceless-render') for update;
  if g.id is null then raise exception 'Generation not found'; end if;
  if g.status in ('succeeded','failed','cancelled') then return; end if;
  if succeeded and g.operation = 'faceless-script' and result_storyboard is null then raise exception 'Missing storyboard'; end if;
  if succeeded and g.operation = 'faceless-render' and result_path is null then raise exception 'Missing output'; end if;
  perform private.settle_generation_credits(job_id, case when succeeded then g.estimated_credits else 0 end, job_id::text || ':settle');
  update public.generations set status = case when succeeded then 'succeeded'::public.generation_status else 'failed'::public.generation_status end, completed_at = now() where id = job_id;
  next_status := case when not succeeded then 'failed' when g.operation = 'faceless-script' then 'ready' else 'complete' end;
  update public.faceless_projects set status = next_status,
    storyboard = coalesce(result_storyboard, storyboard), output_path = case when succeeded and result_path is not null then result_path else output_path end,
    title = coalesce(result_storyboard->>'title', title),
    error_message = case when succeeded then null else 'Generation failed. Reserved credits were returned. You can edit and try again.' end
  where generation_id = job_id;
end; $$;
revoke all on function public.finish_faceless_job(uuid,boolean,jsonb,text) from public, anon, authenticated;
grant execute on function public.finish_faceless_job(uuid,boolean,jsonb,text) to service_role;

-- Only trusted workers may settle paid generations. Browser members cannot refund themselves.
revoke execute on function api.settle_generation_credits(uuid,numeric,text) from public, anon, authenticated;
revoke execute on function private.settle_generation_credits(uuid,numeric,text) from authenticated;
