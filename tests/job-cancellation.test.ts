import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cancel: vi.fn(), retrieve: vi.fn(), list: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk", () => ({ runs: mocks }));
import { cancelJob } from "@/lib/jobs/cancel";
import { jobStatusLabel } from "@/lib/jobs/types";

const jobId = "10000000-0000-4000-8000-000000000001";
function database(job: Record<string, unknown> | null = { id:jobId, status:"processing", provider_request_id:"run_owned", operation:"faceless-render", created_at:"2026-09-23T00:00:00Z", settings:{} }, fresh?: Record<string, unknown>) {
  const chain = { select:vi.fn(()=>chain), eq:vi.fn(()=>chain), in:vi.fn(()=>chain), maybeSingle:vi.fn(async()=>({data:job,error:null})) };
  const rpc = vi.fn(async (name:string) => ({data:name === "request_generation_cancellation" ? {status:job?.status,runId:job?.provider_request_id} : "cancelled",error:null as null|{message:string}}));
  const state = { select:vi.fn(()=>state), eq:vi.fn(()=>state), single:vi.fn(async()=>({data:fresh || {...job,attempt_count:1,cancel_requested_at:"2026-09-23",reported_credits:null},error:null as null|{message:string}})) };
  return { db:{from:()=>chain} as unknown as SupabaseClient, admin:{rpc,from:()=>state} as unknown as SupabaseClient, rpc, chain, state };
}
beforeEach(()=>{ vi.resetAllMocks(); vi.stubEnv("TRIGGER_SECRET_KEY","tr_test_local"); mocks.cancel.mockResolvedValue({id:"run_owned"}); mocks.retrieve.mockResolvedValueOnce({id:"run_owned",payload:{generationId:jobId},isCompleted:false,status:"EXECUTING"}).mockResolvedValue({id:"run_owned",payload:{generationId:jobId},isCompleted:true,status:"CANCELED"}); mocks.list.mockReturnValue((async function*(){})()); });
afterEach(()=>{ vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("backend job cancellation",()=>{
  it("requests stop, cancels the actual worker, and settles only after confirmed termination",async()=>{
    const {db,admin,rpc,chain}=database(); const result=await cancelJob(db,admin,"owner",jobId);
    expect(chain.eq).toHaveBeenCalledWith("requested_by","owner");
    expect(mocks.cancel).toHaveBeenCalledWith("run_owned",expect.any(Object));
    expect(rpc).toHaveBeenNthCalledWith(1,"request_generation_cancellation",{job_id:jobId,owner_id:"owner"});
    expect(rpc).toHaveBeenNthCalledWith(2,"confirm_generation_cancellation",{job_id:jobId});
    expect(result.body.status).toBe("cancelled");
  });
  it("does not touch another user's invisible job",async()=>{
    const {db,admin,rpc}=database(null); expect((await cancelJob(db,admin,"intruder",jobId)).code).toBe(404);
    expect(rpc).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("does not release the slot when cancellation is only acknowledged",async()=>{
    mocks.retrieve.mockReset().mockResolvedValue({payload:{generationId:jobId},isCompleted:false,status:"EXECUTING"});
    const {db,admin,rpc}=database(); expect((await cancelJob(db,admin,"owner",jobId)).code).toBe(202);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps cancellation retryable on a provider failure",async()=>{
    mocks.cancel.mockRejectedValue(new Error("offline"));mocks.retrieve.mockReset().mockResolvedValue({payload:{generationId:jobId},isCompleted:false});const {db,admin,rpc}=database();
    expect((await cancelJob(db,admin,"owner",jobId)).body.status).toBe("cancelling");expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("never refunds a previously attempted run with an unknown dispatch outcome without finding it",async()=>{
    const {db,admin,rpc}=database({status:"reserved",provider_request_id:null,operation:"faceless-script",created_at:"2026-09-23",settings:{}});
    expect((await cancelJob(db,admin,"owner",jobId)).code).toBe(202);expect(rpc).toHaveBeenCalledTimes(1);expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it.each(["created", "reserved", "submitted"])("cancels an unstarted %s job without a Trigger key or run",async(status)=>{
    vi.stubEnv("TRIGGER_SECRET_KEY", "");
    const {db,admin,rpc,state}=database({status,provider_request_id:null}, {status,attempt_count:0,cancel_requested_at:"2026-09-23",reported_credits:null});
    const result=await cancelJob(db,admin,"owner",jobId);
    expect(result).toMatchObject({code:200,body:{status:"cancelled",creditsReleased:true}});
    expect(rpc).toHaveBeenNthCalledWith(2,"confirm_generation_cancellation",{job_id:jobId});
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(state.single.mock.invocationCallOrder[0]);
    expect(state.single.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1]);
    expect(mocks.list).not.toHaveBeenCalled();expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("fences a queued, unclaimed job even when a run ID is already saved",async()=>{
    const {db,admin}=database({status:"submitted",provider_request_id:"run_queued"}, {status:"submitted",attempt_count:0,cancel_requested_at:"2026-09-23",reported_credits:null});
    expect((await cancelJob(db,admin,"owner",jobId)).body.status).toBe("cancelled");
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("uses the post-request state when the worker wins the claim race",async()=>{
    mocks.retrieve.mockReset().mockResolvedValue({payload:{generationId:jobId},isCompleted:false});
    const {db,admin,rpc}=database({status:"reserved",provider_request_id:"run_owned",attempt_count:0}, {status:"processing",attempt_count:1,cancel_requested_at:"2026-09-23",reported_credits:null});
    expect((await cancelJob(db,admin,"owner",jobId)).code).toBe(202);
    expect(rpc).toHaveBeenCalledTimes(1);expect(mocks.cancel).toHaveBeenCalledTimes(1);
  });
  it.each([
    {status:"reserved",attempt_count:undefined,cancel_requested_at:"2026-09-23",reported_credits:null},
    {status:"reserved",attempt_count:0,cancel_requested_at:null,reported_credits:null},
    {status:"processing",attempt_count:0,cancel_requested_at:"2026-09-23",reported_credits:null},
    {status:"reserved",attempt_count:0,cancel_requested_at:"2026-09-23",reported_credits:2},
  ])("fails closed when the unstarted-job proof is incomplete: %j",async(fresh)=>{
    const {db,admin,rpc}=database({status:"reserved",provider_request_id:null,created_at:"2026-09-23",settings:{}},fresh);
    expect((await cancelJob(db,admin,"owner",jobId)).code).toBe(202);expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not refund when the post-request database read fails",async()=>{
    vi.spyOn(console,"error").mockImplementation(()=>{});
    const {db,admin,rpc,state}=database();state.single.mockResolvedValue({data:null!,error:{message:"private details"}});
    expect((await cancelJob(db,admin,"owner",jobId)).code).toBe(503);expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps failed unstarted-job settlement retryable instead of claiming success",async()=>{
    vi.spyOn(console,"error").mockImplementation(()=>{});
    const {db,admin,rpc}=database({status:"reserved"},{status:"reserved",attempt_count:0,cancel_requested_at:"2026-09-23",reported_credits:null});
    rpc.mockResolvedValueOnce({data:{status:"reserved",runId:null},error:null}).mockResolvedValueOnce({data:null!,error:{message:"private details"}});
    expect((await cancelJob(db,admin,"owner",jobId)).code).toBe(503);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("verifies the exact generation payload when recovering a missing run id",async()=>{
    const {db,admin}=database({status:"reserved",provider_request_id:null,operation:"faceless-script",created_at:"2026-09-23",settings:{}});
    mocks.list.mockReturnValue((async function*(){yield {id:"run_wrong"};yield {id:"run_right"};})());
    mocks.retrieve.mockReset().mockImplementation(async(id)=>({id,payload:{generationId:id==="run_right"?jobId:"another-job"},isCompleted:mocks.cancel.mock.calls.length>0}));
    expect((await cancelJob(db,admin,"owner",jobId)).body.status).toBe("cancelled");
    expect(mocks.cancel).toHaveBeenCalledTimes(1);expect(mocks.cancel).toHaveBeenCalledWith("run_right",expect.any(Object));
  });
  it("does not call providers for a completed or already cancelled job",async()=>{
    for(const status of ["succeeded","failed","cancelled"]){const {db,admin,rpc}=database({status});await cancelJob(db,admin,"owner",jobId);expect(rpc).not.toHaveBeenCalled();}
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("never cancels a foreign run id stored on an owned row",async()=>{
    mocks.retrieve.mockReset().mockResolvedValue({payload:{generationId:"someone-elses-job"},isCompleted:false});
    const {db,admin,rpc}=database();expect((await cancelJob(db,admin,"owner",jobId)).code).toBe(409);
    expect(mocks.cancel).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps cancelling distinct from cancelled in the UI",()=>{
    expect(jobStatusLabel({status:"processing",cancelRequested:true})).toBe("Cancelling");
    expect(jobStatusLabel({status:"cancelled",cancelRequested:true})).toBe("Cancelled");
  });
});
