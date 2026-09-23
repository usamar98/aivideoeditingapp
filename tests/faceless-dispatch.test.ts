import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({account:vi.fn(),trigger:vi.fn(),rpc:vi.fn(),read:vi.fn(),save:vi.fn(),update:vi.fn(),revalidate:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@trigger.dev/sdk",()=>({tasks:{trigger:mocks.trigger}}));
vi.mock("@/lib/account",()=>({requireAccount:mocks.account,publicError:(error:Error)=>error.message}));
import { startFacelessJob } from "@/app/studio/faceless/actions";
const projectId="10000000-0000-4000-8000-000000000001",jobId="20000000-0000-4000-8000-000000000001";

beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("TRIGGER_SECRET_KEY","tr_prod_private");vi.stubEnv("GEMINI_API_KEY","private");
  vi.spyOn(console,"error").mockImplementation(()=>{});
  const response=Promise.resolve({error:null});
  const write={eq:vi.fn(()=>write),in:vi.fn(()=>write),is:vi.fn(()=>write),select:vi.fn(()=>write),maybeSingle:mocks.save,then:response.then.bind(response)};
  mocks.update.mockReturnValue(write);
  const project={select:()=>project,eq:()=>project,single:async()=>({data:{id:projectId}})};
  const generation={select:()=>generation,eq:()=>generation,single:mocks.read};
  mocks.account.mockResolvedValue({user:{id:"owner"},db:{from:(name:string)=>name==="generations"?generation:project},admin:{rpc:mocks.rpc,from:()=>({update:mocks.update})}});
  mocks.rpc.mockResolvedValue({data:jobId,error:null});
  mocks.read.mockResolvedValue({data:{status:"reserved",provider_request_id:null,cancel_requested_at:null},error:null});
  mocks.trigger.mockResolvedValue({id:"run_test"});mocks.save.mockResolvedValue({data:{cancel_requested_at:null},error:null});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe("faceless dispatch diagnostics and recovery",()=>{
  it("persists and returns a safe auth error instead of hiding it",async()=>{
    mocks.trigger.mockRejectedValue({status:401,message:"Authorization: Bearer tr_prod_private"});
    const result=await startFacelessJob(projectId,"script");
    expect(result.error).toContain("authentication failed");expect(result.error).toContain("HTTP 401");expect(result.error).toContain(jobId);
    expect(result.error).not.toContain("tr_prod_private");
    expect(mocks.update).toHaveBeenCalledWith({error_message:expect.stringContaining("authentication failed")});
    expect(mocks.rpc).toHaveBeenCalledTimes(1); // No refund based solely on a network error.
  });
  it("retries an uncertain submission with the same generation idempotency key",async()=>{
    mocks.trigger.mockRejectedValueOnce({name:"APIConnectionTimeoutError"}).mockResolvedValueOnce({id:"run_test"});
    expect((await startFacelessJob(projectId,"script")).error).toContain("timed out");
    expect(await startFacelessJob(projectId,"script")).toEqual({ok:true});
    for(const call of mocks.trigger.mock.calls) expect(call).toEqual(["faceless-pipeline",{generationId:jobId},expect.objectContaining({idempotencyKey:jobId}),{retry:{maxAttempts:1}}]);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({provider_request_id:"run_test",error_message:null}));
  });
  it("distinguishes a saved-job read failure from a Trigger submission failure",async()=>{
    mocks.read.mockResolvedValue({data:null,error:{code:"42501",message:"private details"}});
    expect((await startFacelessJob(projectId,"script")).error).toContain("read_saved_job");
    expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("distinguishes saving a run ID from submitting the task",async()=>{
    mocks.save.mockResolvedValue({data:null,error:{code:"PGRST204",message:"private details"}});
    expect((await startFacelessJob(projectId,"script")).error).toContain("save_run");
    expect(console.error).toHaveBeenCalledWith("[jobs]",expect.objectContaining({stage:"save_run",code:"PGRST204"}));
  });
  it("does not dispatch again once cancellation has been requested",async()=>{
    mocks.read.mockResolvedValue({data:{status:"reserved",provider_request_id:null,cancel_requested_at:"2026-09-24"}});
    expect((await startFacelessJob(projectId,"script")).error).toContain("cancelling");expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("does not report submission success if cancellation wins before saving the run ID",async()=>{
    mocks.save.mockResolvedValue({data:null,error:null});
    expect((await startFacelessJob(projectId,"script")).error).toContain("state changed");
  });
});
