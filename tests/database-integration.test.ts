import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll,afterAll,describe,it,expect } from "vitest";

const userA="10000000-0000-4000-8000-000000000001",userB="10000000-0000-4000-8000-000000000002",workspace="20000000-0000-4000-8000-000000000001",project="30000000-0000-4000-8000-000000000001",job="40000000-0000-4000-8000-000000000001";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,name text,bucket_id text);
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;`);
  const initial=readFileSync("supabase/migrations/202609220001_initial_video_saas.sql","utf8").replace("create extension if not exists pgcrypto;","");
  await db.exec(initial);
  await db.exec(readFileSync("supabase/migrations/20260922145706_faceless_stripe_profiles.sql","utf8"));
  await db.exec(`insert into auth.users values ('${userA}'),('${userB}'); insert into public.profiles(id) values ('${userA}'),('${userB}'); insert into public.workspaces(id,name,owner_id) values('${workspace}','Test studio','${userA}'); insert into public.workspace_members(workspace_id,user_id,role) values('${workspace}','${userA}','owner'); insert into public.credit_accounts(workspace_id,cached_balance) values('${workspace}',100); insert into public.faceless_projects(id,user_id,workspace_id,title,brief) values('${project}','${userA}','${workspace}','Test project','{}');`);
},30000);
afterAll(async()=>{await db?.close();});

async function asUser(id:string){await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claim.role','authenticated',false);`);}
async function asService(){await db.exec("reset role; set role service_role; select set_config('request.jwt.claim.role','service_role',false);");}
describe("real Postgres migration and authorization",()=>{
  it("allows username updates but never is_admin escalation",async()=>{await asUser(userA);await db.query("update public.profiles set username='creator_a' where id=$1",[userA]);await expect(db.query("update public.profiles set is_admin=true where id=$1",[userA])).rejects.toThrow();});
  it("isolates private projects between accounts",async()=>{await asUser(userA);expect((await db.query("select id from public.faceless_projects")).rows).toHaveLength(1);await asUser(userB);expect((await db.query("select id from public.faceless_projects")).rows).toHaveLength(0);});
  it("blocks direct job/credit mutations and billing writes",async()=>{await asUser(userA);await expect(db.query("select public.start_faceless_job($1,$2,$3,'script')",[project,userA,job])).rejects.toThrow(/permission denied/);await expect(db.query("select api.settle_generation_credits($1,0,'hack')",[job])).rejects.toThrow(/permission denied/);await expect(db.query("insert into public.billing_customers(user_id,workspace_id,stripe_customer_id) values($1,$2,'cus_fake')",[userA,workspace])).rejects.toThrow(/permission denied/);});
  it("reserves once and returns the same active job on retries",async()=>{await asService();await db.query("select public.start_faceless_job($1,$2,$3,'script')",[project,userA,job]);const retry=await db.query<{start_faceless_job:string}>("select public.start_faceless_job($1,$2,gen_random_uuid(),'script')",[project,userA]);expect(retry.rows[0].start_faceless_job).toBe(job);expect(Number((await db.query<{cached_balance:string}>("select cached_balance from public.credit_accounts")).rows[0].cached_balance)).toBe(98);});
  it("refunds failed jobs exactly once",async()=>{await asService();await db.query("select public.finish_faceless_job($1,false)",[job]);await db.query("select public.finish_faceless_job($1,false)",[job]);expect(Number((await db.query<{cached_balance:string}>("select cached_balance from public.credit_accounts")).rows[0].cached_balance)).toBe(100);expect((await db.query<{status:string}>("select status from public.faceless_projects")).rows[0].status).toBe("failed");});
  it("fulfills a repeated Stripe invoice only once",async()=>{await asService();for(let i=0;i<2;i++)await db.query("select public.apply_credit_purchase($1,100,'stripe:invoice:in_test','in_test')",[workspace]);expect(Number((await db.query<{cached_balance:string}>("select cached_balance from public.credit_accounts")).rows[0].cached_balance)).toBe(200);});
});
