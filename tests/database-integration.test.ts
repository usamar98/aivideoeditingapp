import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only",()=>({}));
const triggerMocks=vi.hoisted(()=>({list:vi.fn(),retrieve:vi.fn(),cancel:vi.fn()}));
vi.mock("@trigger.dev/sdk",()=>({runs:triggerMocks}));
import { cancelJob } from "@/lib/jobs/cancel";
import { cartoonDemo } from "@/lib/cartoons/demo";
import { CARTOON_PLAN_CREDITS, cartoonRenderCredits, type CartoonBrief } from "@/lib/cartoons/schema";

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
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;`);
  const initial=readFileSync("supabase/migrations/202609220001_initial_video_saas.sql","utf8").replace("create extension if not exists pgcrypto;","");
  await db.exec(initial);
  await db.exec(readFileSync("supabase/migrations/20260922145706_faceless_stripe_profiles.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20260923173517_jobs_cancellation.sql","utf8"));
  await db.exec(readFileSync("supabase/migrations/20260924135448_cartoon_studio.sql","utf8"));
  await db.exec("grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;");
  await db.exec(`insert into auth.users values ('${userA}'),('${userB}'); insert into public.profiles(id) values ('${userA}'),('${userB}'); insert into public.workspaces(id,name,owner_id) values('${workspace}','Test studio','${userA}'); insert into public.workspace_members(workspace_id,user_id,role) values('${workspace}','${userA}','owner'); insert into public.credit_accounts(workspace_id,cached_balance) values('${workspace}',100); insert into public.faceless_projects(id,user_id,workspace_id,title,brief) values('${project}','${userA}','${workspace}','Test project','{}');`);
},30000);
afterAll(async()=>{await db?.close();});

async function asUser(id:string){await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claim.role','authenticated',false);`);}
async function asService(){await db.exec("reset role; set role service_role; select set_config('request.jwt.claim.role','service_role',false);");}
describe("cartoon database ownership, pricing and settlement", () => {
  async function fixture(brief: CartoonBrief = cartoonDemo.brief, ready = false) {
    await asService(); const workspaceId = randomUUID(), projectId = randomUUID();
    await db.query("insert into public.workspaces(id,name,owner_id) values($1,'Cartoon test',$2)",[workspaceId,userA]);
    await db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'owner')",[workspaceId,userA]);
    await db.query("insert into public.credit_accounts(workspace_id,cached_balance) values($1,10000)",[workspaceId]);
    await db.query("insert into public.cartoon_projects(id,user_id,workspace_id,title,brief,storyboard,cast_paths,status) values($1,$2,$3,'Cartoon',$4,$5,$6,$7)",[projectId,userA,workspaceId,JSON.stringify(brief),ready ? JSON.stringify(cartoonDemo.storyboard) : null,JSON.stringify(ready ? {c1:`${workspaceId}/${userA}/portrait.png`}:{}),ready ? "ready":"draft"]);
    return { workspaceId, projectId };
  }
  it("isolates projects and denies browser writes/start/finish", async () => {
    const {projectId}=await fixture();
    await asUser(userB); expect((await db.query("select id from public.cartoon_projects where id=$1",[projectId])).rows).toHaveLength(0);
    await asUser(userA); expect((await db.query("select id from public.cartoon_projects where id=$1",[projectId])).rows).toHaveLength(1);
    await expect(db.query("update public.cartoon_projects set cast_paths='{}' where id=$1",[projectId])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.start_cartoon_job($1,$2,gen_random_uuid(),'plan')",[projectId,userA])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.finish_cartoon_job(gen_random_uuid(),true)")).rejects.toThrow(/permission denied/);
    await asService(); await expect(db.query("select public.start_cartoon_job($1,$2,gen_random_uuid(),'plan')",[projectId,userB])).rejects.toThrow(/not found/);
  });
  it("reserves a plan once, fences a late worker, unlocks and refunds once", async () => {
    const {projectId,workspaceId}=await fixture(), id=randomUUID();
    await db.query("select public.start_cartoon_job($1,$2,$3,'plan')",[projectId,userA,id]);
    expect((await db.query<{id:string}>("select public.start_cartoon_job($1,$2,gen_random_uuid(),'plan') as id",[projectId,userA])).rows[0].id).toBe(id);
    expect(Number((await db.query<{n:string}>("select cached_balance as n from public.credit_accounts where workspace_id=$1",[workspaceId])).rows[0].n)).toBe(10000-CARTOON_PLAN_CREDITS);
    await db.query("select public.request_generation_cancellation($1,$2)",[id,userA]);
    await db.query("select public.confirm_generation_cancellation($1)",[id]);
    await db.query("select public.confirm_generation_cancellation($1)",[id]);
    expect((await db.query<{ok:boolean}>("select public.claim_generation_job($1,'late',1) as ok",[id])).rows[0].ok).toBe(false);
    await db.query("select public.finish_cartoon_job($1,true,$2,$3)",[id,JSON.stringify(cartoonDemo.storyboard),JSON.stringify({c1:"late"})]);
    expect((await db.query("select status,storyboard from public.cartoon_projects where id=$1",[projectId])).rows[0]).toMatchObject({status:"draft",storyboard:null});
    expect(Number((await db.query<{n:string}>("select cached_balance as n from public.credit_accounts where workspace_id=$1",[workspaceId])).rows[0].n)).toBe(10000);
  });
  it("allows owned reference uploads but blocks browser checkpoint tampering", async () => {
    const {workspaceId}=await fixture();
    const checkpointId=randomUUID(),uploadId=randomUUID();
    await db.exec("reset role");
    await db.query("insert into storage.objects(id,name,bucket_id) values($1,$2,'private-media')",[checkpointId,`${workspaceId}/${userA}/cartoons/job/result.json`]);
    await asUser(userA);
    expect((await db.query("select id from storage.objects where id=$1",[checkpointId])).rows).toHaveLength(1);
    expect((await db.query("delete from storage.objects where id=$1 returning id",[checkpointId])).rows).toHaveLength(0);
    expect((await db.query("update storage.objects set name=name where id=$1 returning id",[checkpointId])).rows).toHaveLength(0);
    await expect(db.query("insert into storage.objects(id,name,bucket_id) values($1,$2,'private-media')",[randomUUID(),`${workspaceId}/${userA}/cartoons/job/fake.json`])).rejects.toThrow(/row-level security/);
    await db.query("insert into storage.objects(id,name,bucket_id) values($1,$2,'private-media')",[uploadId,`${workspaceId}/${userA}/reference.png`]);
    await expect(db.query("update storage.objects set name=$2 where id=$1",[uploadId,`${workspaceId}/${userA}/cartoons/job/fake.json`])).rejects.toThrow(/row-level security/);
  });
  it("charges the exact server-owned rate for every duration/model", async () => {
    for (const model of ["kling-o3","seedance-2.5"] as const) for (const duration of [15,30,60] as const) {
      const brief={...cartoonDemo.brief,model,duration};const {projectId}=await fixture(brief,true),id=randomUUID();
      await db.query("select public.start_cartoon_job($1,$2,$3,'render')",[projectId,userA,id]);
      expect(Number((await db.query<{cost:string}>("select estimated_credits as cost from public.generations where id=$1",[id])).rows[0].cost)).toBe(cartoonRenderCredits(brief));
      await db.query("select public.finish_cartoon_job($1,false)",[id]);
    }
  });
  it("settles successful renders once and rejects foreign output paths", async () => {
    const {projectId,workspaceId}=await fixture(cartoonDemo.brief,true),id=randomUUID();
    await db.query("select public.start_cartoon_job($1,$2,$3,'render')",[projectId,userA,id]);
    await expect(db.query("select public.finish_cartoon_job($1,true,null,null,'foreign/video.mp4')",[id])).rejects.toThrow(/Invalid video/);
    const output=`${workspaceId}/${userA}/cartoons/${id}/video.mp4`;
    await db.query("select public.finish_cartoon_job($1,true,null,null,$2)",[id,output]);
    await db.query("select public.finish_cartoon_job($1,true,null,null,$2)",[id,output]);
    await db.query("select public.request_generation_cancellation($1,$2)",[id,userA]);
    await db.query("select public.confirm_generation_cancellation($1)",[id]);
    expect((await db.query("select status,output_path from public.cartoon_projects where id=$1",[projectId])).rows[0]).toMatchObject({status:"complete",output_path:output});
    expect(Number((await db.query<{n:string}>("select cached_balance as n from public.credit_accounts where workspace_id=$1",[workspaceId])).rows[0].n)).toBe(9880);
  });
  it("enforces the shared two-job limit and leaves cancelled casts editable", async () => {
    const {projectId,workspaceId}=await fixture(cartoonDemo.brief,true), id=randomUUID(), other=randomUUID(), blocked=randomUUID();
    await db.query("insert into public.generations(id,workspace_id,requested_by,operation,provider,model,idempotency_key,status,estimated_credits) values($1::uuid,$2,$3,'faceless-script','trigger.dev','gemini',$1::text,'processing',2)",[other,workspaceId,userA]);
    await db.query("select public.start_cartoon_job($1,$2,$3,'render')",[projectId,userA,id]);
    await db.query("insert into public.cartoon_projects(id,user_id,workspace_id,title,brief) values($1,$2,$3,'Blocked',$4)",[blocked,userA,workspaceId,JSON.stringify(cartoonDemo.brief)]);
    await expect(db.query("select public.start_cartoon_job($1,$2,gen_random_uuid(),'plan')",[blocked,userA])).rejects.toThrow(/Two jobs/);
    await db.query("select public.request_generation_cancellation($1,$2)",[id,userA]);
    await db.query("select public.finish_cartoon_job($1,true,null,null,$2)",[id,`${workspaceId}/${userA}/cartoons/${id}/video.mp4`]);
    expect((await db.query("select status,output_path from public.cartoon_projects where id=$1",[projectId])).rows[0]).toMatchObject({status:"ready",output_path:null});
    const next=randomUUID(); await db.query("select public.start_cartoon_job($1,$2,$3,'plan')",[blocked,userA,next]);
    await db.query("select public.finish_cartoon_job($1,false)",[next]);
    await db.query("update public.generations set status='failed' where id=$1",[other]);
  });
});
describe("real Postgres migration and authorization",()=>{
  it("allows username updates but never is_admin escalation",async()=>{await asUser(userA);await db.query("update public.profiles set username='creator_a' where id=$1",[userA]);await expect(db.query("update public.profiles set is_admin=true where id=$1",[userA])).rejects.toThrow();});
  it("isolates private projects between accounts",async()=>{await asUser(userA);expect((await db.query("select id from public.faceless_projects")).rows).toHaveLength(1);await asUser(userB);expect((await db.query("select id from public.faceless_projects")).rows).toHaveLength(0);});
  it("blocks direct job/credit mutations and billing writes",async()=>{await asUser(userA);await expect(db.query("select public.start_faceless_job($1,$2,$3,'script')",[project,userA,job])).rejects.toThrow(/permission denied/);await expect(db.query("select api.settle_generation_credits($1,0,'hack')",[job])).rejects.toThrow(/permission denied/);await expect(db.query("insert into public.billing_customers(user_id,workspace_id,stripe_customer_id) values($1,$2,'cus_fake')",[userA,workspace])).rejects.toThrow(/permission denied/);});
  it("reserves once and returns the same active job on retries",async()=>{await asService();await db.query("select public.start_faceless_job($1,$2,$3,'script')",[project,userA,job]);const retry=await db.query<{start_faceless_job:string}>("select public.start_faceless_job($1,$2,gen_random_uuid(),'script')",[project,userA]);expect(retry.rows[0].start_faceless_job).toBe(job);expect(Number((await db.query<{cached_balance:string}>(`select cached_balance from public.credit_accounts where workspace_id='${workspace}'`)).rows[0].cached_balance)).toBe(98);});
  it("refunds failed jobs exactly once",async()=>{await asService();await db.query("select public.finish_faceless_job($1,false)",[job]);await db.query("select public.finish_faceless_job($1,false)",[job]);expect(Number((await db.query<{cached_balance:string}>(`select cached_balance from public.credit_accounts where workspace_id='${workspace}'`)).rows[0].cached_balance)).toBe(100);expect((await db.query<{status:string}>("select status from public.faceless_projects")).rows[0].status).toBe("failed");});
  it("fulfills a repeated Stripe invoice only once",async()=>{await asService();for(let i=0;i<2;i++)await db.query("select public.apply_credit_purchase($1,100,'stripe:invoice:in_test','in_test')",[workspace]);expect(Number((await db.query<{cached_balance:string}>(`select cached_balance from public.credit_accounts where workspace_id='${workspace}'`)).rows[0].cached_balance)).toBe(200);});
});

describe("atomic job cancellation", () => {
  // Exercise the actual cancellation handler against Postgres, including its
  // post-request read. Provider calls must not be needed for unclaimed jobs.
  function cancellationClient() {
    return {
      from: () => {
        const filters: Record<string,string> = {};
        async function read() {
          const result = await db.query("select * from public.generations where id=$1 and requested_by=$2",[filters.id,filters.requested_by]);
          return {data:result.rows[0] || null,error:null};
        }
        const chain = {select:()=>chain,eq:(key:string,value:string)=>{filters[key]=value;return chain;},in:()=>chain,single:read,maybeSingle:read};
        return chain;
      },
      rpc: async (name:string,args:{job_id:string;owner_id?:string}) => {
        const query=name==="request_generation_cancellation" ? "select public.request_generation_cancellation($1,$2) as result" : "select public.confirm_generation_cancellation($1) as result";
        const result=await db.query<{result:unknown}>(query,name==="request_generation_cancellation" ? [args.job_id,args.owner_id] : [args.job_id]);
        return {data:result.rows[0].result,error:null};
      },
    } as unknown as SupabaseClient;
  }
  async function newJob(kind = "script") {
    await asService();
    const projectId = randomUUID(), jobId = randomUUID();
    await db.query("insert into public.faceless_projects(id,user_id,workspace_id,title,brief,storyboard) values($1,$2,$3,'Cancel test','{}',$4::jsonb)", [projectId,userA,workspace,kind === "render" ? JSON.stringify({title:"My saved story",scenes:[]}) : null]);
    await db.query("select public.start_faceless_job($1,$2,$3,$4)",[projectId,userA,jobId,kind]);
    return {projectId,jobId};
  }
  async function balance() { return Number((await db.query<{cached_balance:string}>("select cached_balance from public.credit_accounts where workspace_id=$1",[workspace])).rows[0].cached_balance); }
  async function cancel(id: string) { await db.query("select public.request_generation_cancellation($1,$2)",[id,userA]); await db.query("select public.confirm_generation_cancellation($1)",[id]); }
  async function newEpisode() {
    await asService(); const id = randomUUID(), asset = randomUUID();
    await db.query("insert into public.assets(id,workspace_id,owner_id,kind,storage_path,mime_type) values($1,$2,$3,'export',$4,'video/mp4')",[asset,workspace,userA,`${workspace}/${userA}/${asset}.mp4`]);
    await db.query("insert into public.generations(id,workspace_id,requested_by,operation,provider,model,idempotency_key,estimated_credits,output_asset_ids) values($1,$2,$3,'episode-export','trigger.dev','ffmpeg',$4,20,array[$5::uuid])",[id,workspace,userA,id,asset]);
    await asUser(userA);
    await db.query("select api.reserve_generation_credits($1,$2,20,$3)",[workspace,id,`${id}:reserve`]);
    await asService(); return {id,asset};
  }

  it("cancels an undispatched job through the app and refunds exactly once without Trigger",async()=>{
    const {jobId,projectId}=await newJob("render");const reserved=await balance();const client=cancellationClient();
    const saved=(await db.query("select storyboard from public.faceless_projects where id=$1",[projectId])).rows[0];
    expect((await cancelJob(client,client,userA,jobId)).body.status).toBe("cancelled");
    expect((await cancelJob(client,client,userA,jobId)).body.status).toBe("cancelled");
    expect(await balance()).toBe(reserved+20);
    expect((await db.query("select storyboard from public.faceless_projects where id=$1",[projectId])).rows[0]).toEqual(saved);
    expect((await db.query("select id from public.credit_ledger where generation_id=$1 and kind='release'",[jobId])).rows).toHaveLength(1);
    expect((await db.query<{ok:boolean}>("select public.claim_generation_job($1,'run_late',1) as ok",[jobId])).rows[0].ok).toBe(false);
    await db.query("select public.finish_faceless_job($1,true,null,'late-output.mp4')",[jobId]);
    expect((await db.query("select status,output_path from public.faceless_projects where id=$1",[projectId])).rows[0]).toMatchObject({status:"ready",output_path:null});
    expect(triggerMocks.list).not.toHaveBeenCalled();expect(triggerMocks.cancel).not.toHaveBeenCalled();
  });
  it("frees a slot immediately for an unclaimed queued job, even with a saved run ID",async()=>{
    const first=await newJob(),second=await newJob();
    await db.query("update public.generations set status='submitted',provider_request_id='run_queued' where id=$1",[first.jobId]);
    await expect(newJob()).rejects.toThrow(/Two jobs/);
    const client=cancellationClient();expect((await cancelJob(client,client,userA,first.jobId)).body.status).toBe("cancelled");
    const third=await newJob();
    expect((await db.query<{ok:boolean}>("select public.claim_generation_job($1,'run_queued',1) as ok",[first.jobId])).rows[0].ok).toBe(false);
    await cancel(second.jobId);await cancel(third.jobId);
  });

  it("rejects another owner and denies direct browser cancellation RPCs",async()=>{
    const {jobId} = await newJob();
    await expect(db.query("select public.request_generation_cancellation($1,$2)",[jobId,userB])).rejects.toThrow(/Job not found/);
    await asUser(userA);
    await expect(db.query("select public.request_generation_cancellation($1,$2)",[jobId,userA])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.confirm_generation_cancellation($1)",[jobId])).rejects.toThrow(/permission denied/);
    await asService(); await cancel(jobId);
  });
  it("keeps credits reserved while cancelling, prevents worker start, and releases once",async()=>{
    const {jobId,projectId} = await newJob(); const reserved = await balance();
    await db.query("select public.request_generation_cancellation($1,$2)",[jobId,userA]);
    expect(await balance()).toBe(reserved);
    expect((await db.query<{claim_generation_job:boolean}>("select public.claim_generation_job($1,'run_late',1)",[jobId])).rows[0].claim_generation_job).toBe(false);
    await db.query("select public.confirm_generation_cancellation($1)",[jobId]);
    await db.query("select public.confirm_generation_cancellation($1)",[jobId]);
    await db.query("select public.finish_faceless_job($1,true,'{\"title\":\"Late output\"}'::jsonb)",[jobId]);
    expect(await balance()).toBe(reserved+2);
    expect((await db.query<{status:string}>("select status from public.generations where id=$1",[jobId])).rows[0].status).toBe("cancelled");
    expect((await db.query<{status:string;storyboard:unknown}>("select status,storyboard from public.faceless_projects where id=$1",[projectId])).rows[0]).toMatchObject({status:"draft",storyboard:null});
    expect((await db.query("select id from public.credit_ledger where generation_id=$1 and kind='release'",[jobId])).rows).toHaveLength(1);
    await expect(db.query("update public.generations set status='processing' where id=$1",[jobId])).rejects.toThrow(/terminal job cannot/);
    await expect(db.query("update public.generations set output_asset_ids=array[gen_random_uuid()] where id=$1",[jobId])).rejects.toThrow(/terminal job cannot/);
    await expect(db.query("update public.generations set cancel_requested_at=null where id=$1",[jobId])).rejects.toThrow(/cannot be cleared/);
  });
  it("cancellation wins when requested before a worker publishes its result",async()=>{
    const {jobId,projectId} = await newJob("render"); const reserved = await balance();
    await db.query("select public.claim_generation_job($1,'run_render',1)",[jobId]);
    await db.query("select public.request_generation_cancellation($1,$2)",[jobId,userA]);
    await db.query("select public.finish_faceless_job($1,true,null,'unwanted-video.mp4')",[jobId]);
    expect(await balance()).toBe(reserved+20);
    expect((await db.query<{status:string;output_path:null}>("select status,output_path from public.faceless_projects where id=$1",[projectId])).rows[0]).toMatchObject({status:"ready",output_path:null});
  });
  it("does not refund a successfully completed job when cancel arrives too late",async()=>{
    const {jobId} = await newJob(); const reserved = await balance();
    await db.query("select public.finish_faceless_job($1,true,'{\"title\":\"Done\"}'::jsonb)",[jobId]);
    await cancel(jobId);
    expect(await balance()).toBe(reserved);
    expect((await db.query<{status:string}>("select status from public.generations where id=$1",[jobId])).rows[0].status).toBe("succeeded");
  });
  it("frees one of the two active slots only after cancellation is confirmed",async()=>{
    const first = await newJob(), second = await newJob();
    await expect(newJob()).rejects.toThrow(/Two jobs/);
    await db.query("select public.request_generation_cancellation($1,$2)",[first.jobId,userA]);
    await expect(newJob()).rejects.toThrow(/Two jobs/);
    await db.query("select public.confirm_generation_cancellation($1)",[first.jobId]);
    const third = await newJob();
    await cancel(second.jobId); await cancel(third.jobId);
  });
  it("cannot deduct credits after an episode was cancelled before reservation",async()=>{
    await asService(); const id = randomUUID(); const before = await balance();
    await db.query("insert into public.generations(id,workspace_id,requested_by,operation,provider,model,idempotency_key,estimated_credits) values($1,$2,$3,'episode-export','trigger.dev','ffmpeg',$4,20)",[id,workspace,userA,id]);
    await cancel(id);
    await asUser(userA);
    await expect(db.query("select api.reserve_generation_credits($1,$2,20,$3)",[workspace,id,`${id}:reserve`])).rejects.toThrow(/no longer runnable/);
    await asService(); expect(await balance()).toBe(before);
  });
  it("cancels an episode atomically even when its export finishes at the same time",async()=>{
    const {id,asset} = await newEpisode(); const reserved = await balance();
    await db.query("select public.request_generation_cancellation($1,$2)",[id,userA]);
    await db.query("select public.finish_episode_job($1,true,$2)",[id,asset]);
    await db.query("select public.finish_episode_job($1,true,$2)",[id,asset]);
    expect(await balance()).toBe(reserved+20);
    expect((await db.query<{status:string;output_asset_ids:string[]}>("select status,output_asset_ids from public.generations where id=$1",[id])).rows[0]).toMatchObject({status:"cancelled",output_asset_ids:[]});
    expect((await db.query<{deleted_at:unknown}>("select deleted_at from public.assets where id=$1",[asset])).rows[0].deleted_at).not.toBeNull();
  });
  it("settles a completed episode once without allowing a later cancel refund",async()=>{
    const {id,asset} = await newEpisode(); const reserved = await balance();
    await db.query("select public.finish_episode_job($1,true,$2)",[id,asset]);
    await db.query("select public.finish_episode_job($1,true,$2)",[id,asset]);
    await cancel(id);
    expect(await balance()).toBe(reserved);
    expect((await db.query<{status:string;reported_credits:string;output_asset_ids:string[]}>("select status,reported_credits,output_asset_ids from public.generations where id=$1",[id])).rows[0]).toMatchObject({status:"succeeded",output_asset_ids:[asset]});
  });
});
