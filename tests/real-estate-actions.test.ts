import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estateBrief } from "./fixtures/real-estate";
const mocks=vi.hoisted(()=>({account:vi.fn(),rpc:vi.fn(),project:vi.fn(),job:vi.fn(),trigger:vi.fn(),saved:vi.fn(),diagnostic:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@trigger.dev/sdk",()=>({tasks:{trigger:mocks.trigger}}));
vi.mock("@/lib/account",()=>({requireAccount:mocks.account,publicError:(e:Error)=>e.message}));
vi.mock("@/lib/jobs/diagnostics",()=>({recordDispatchFailure:mocks.diagnostic}));
import { createEstateUpload,createEstateProject,startEstateJob } from "@/app/studio/real-estate/actions";
const id="10000000-0000-4000-8000-000000000003",jobId="10000000-0000-4000-8000-000000000004";
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("TRIGGER_SECRET_KEY","test");
  const write={eq:()=>write,in:()=>write,is:()=>write,select:()=>write,maybeSingle:mocks.saved};
  const project={select:()=>project,eq:()=>project,single:mocks.project},job={select:()=>job,eq:()=>job,single:mocks.job};
  mocks.account.mockResolvedValue({user:{id:"owner"},workspaceId:"workspace",db:{from:(name:string)=>name==="generations"?job:project},admin:{rpc:mocks.rpc,from:()=>({update:()=>write})}});
  mocks.project.mockResolvedValue({data:{brief:estateBrief}});mocks.rpc.mockResolvedValue({data:jobId,error:null});mocks.job.mockResolvedValue({data:{status:"reserved",provider_request_id:null,cancel_requested_at:null}});
  mocks.trigger.mockResolvedValue({id:"run_test"});mocks.saved.mockResolvedValue({data:{id:jobId},error:null});mocks.diagnostic.mockResolvedValue("Dispatch is uncertain.");
});
afterEach(()=>vi.unstubAllEnvs());
describe("real estate authenticated server actions",()=>{
  it("authenticates upload, save and render independently",async()=>{
    mocks.account.mockRejectedValue(new Error("Please sign in"));
    for(const result of [await createEstateUpload({mime:"image/png",size:100}),await createEstateProject(estateBrief,true),await startEstateJob(id,true)])expect(result.error).toContain("sign in");
    expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.trigger).not.toHaveBeenCalled();
  });
  it("requires approval and ownership before reserving",async()=>{
    expect((await createEstateProject(estateBrief,false)).error).toContain("Confirm");expect((await startEstateJob(id,false)).error).toContain("confirm");
    mocks.project.mockResolvedValue({data:null});expect((await startEstateJob(id,true)).error).toContain("not found");expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("binds billing to the owner and reuses the saved job id for dispatch",async()=>{
    expect(await startEstateJob(id,true)).toEqual({ok:true});expect(mocks.rpc).toHaveBeenCalledWith("start_real_estate_job",expect.objectContaining({project_id:id,owner_id:"owner"}));
    expect(mocks.trigger).toHaveBeenCalledWith("real-estate-pipeline",{generationId:jobId},expect.objectContaining({idempotencyKey:jobId,concurrencyKey:"owner"}),{retry:{maxAttempts:1}});
    mocks.job.mockResolvedValue({data:{status:"processing",provider_request_id:"run_existing"}});await startEstateJob(id,true);expect(mocks.trigger).toHaveBeenCalledTimes(1);
  });
  it("preserves reserved credits on ambiguous dispatch and prevents cancellation races",async()=>{
    mocks.trigger.mockRejectedValueOnce(new Error("private provider response"));const result=await startEstateJob(id,true);expect(result.error).toContain("credits remain reserved");expect(result.error).not.toContain("private provider response");
    expect(await startEstateJob(id,true)).toEqual({ok:true});expect(mocks.trigger.mock.calls.every(c=>c[2].idempotencyKey===jobId)).toBe(true);
    mocks.job.mockResolvedValue({data:{status:"reserved",cancel_requested_at:"now"}});expect((await startEstateJob(id,true)).error).toContain("Cancellation");expect(mocks.trigger).toHaveBeenCalledTimes(2);
  });
});
