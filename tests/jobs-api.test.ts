import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),cancel:vi.fn(),jobs:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.user}})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({})}));
vi.mock("@/lib/jobs/cancel",()=>({cancelJob:mocks.cancel}));
vi.mock("@/lib/jobs/repository",()=>({getJobs:mocks.jobs}));
import { POST } from "@/app/api/generations/[generationId]/cancel/route";
import { GET } from "@/app/api/jobs/route";
const id="10000000-0000-4000-8000-000000000001";
beforeEach(()=>{vi.resetAllMocks();mocks.user.mockResolvedValue({data:{user:{id:"owner"}},error:null});mocks.cancel.mockResolvedValue({code:200,body:{status:"cancelled"}});mocks.jobs.mockResolvedValue({jobs:[],total:0,page:0,pageSize:25});});
describe("Jobs HTTP boundaries",()=>{
  it("blocks cross-origin cancellation before authenticating or touching workers",async()=>{
    const result=await POST(new Request(`https://studio.test/api/generations/${id}/cancel`,{method:"POST",headers:{origin:"https://unrelated.test"}}),{params:Promise.resolve({generationId:id})});
    expect(result.status).toBe(403);expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("requires verified authentication for listing and cancellation",async()=>{
    mocks.user.mockResolvedValue({data:{user:null},error:null});
    expect((await GET(new Request("https://studio.test/api/jobs"))).status).toBe(401);
    expect((await POST(new Request(`https://studio.test/api/generations/${id}/cancel`,{method:"POST"}),{params:Promise.resolve({generationId:id})})).status).toBe(401);
    expect(mocks.cancel).not.toHaveBeenCalled();expect(mocks.jobs).not.toHaveBeenCalled();
  });
  it("lists only the authenticated owner's filtered page with no shared cache",async()=>{
    const result=await GET(new Request("https://studio.test/api/jobs?filter=done&page=2"));
    expect(mocks.jobs).toHaveBeenCalledWith(expect.any(Object),"owner","done",2);
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects malformed filters and negative page numbers",async()=>{
    expect((await GET(new Request("https://studio.test/api/jobs?filter=everything"))).status).toBe(400);
    expect((await GET(new Request("https://studio.test/api/jobs?page=-1"))).status).toBe(400);
    expect(mocks.jobs).not.toHaveBeenCalled();
  });
});
