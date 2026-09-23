import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { assertJobActive, claimJob, finishCancelledJob } from "../trigger/job-control";

function client(data: Record<string,unknown> | null) {
  const chain = { select:()=>chain,eq:()=>chain,single:async()=>({data,error:null}) };
  const rpc = vi.fn(async()=>({data:true,error:null}));
  return {db:{from:()=>chain,rpc} as unknown as SupabaseClient,rpc};
}
describe("worker cancellation gates",()=>{
  it("refuses to start paid work when the atomic claim is denied",async()=>{
    const {db,rpc}=client({});rpc.mockResolvedValue({data:false,error:null});
    await expect(claimJob(db,"job","run_1",1)).rejects.toThrow(/no longer runnable/);
  });
  it.each(["cancelled","succeeded","failed"])("never restarts a %s job",async(status)=>{
    await expect(assertJobActive(client({status,cancel_requested_at:null}).db,"job",new AbortController().signal)).rejects.toThrow(/stopped/);
  });
  it("stops between phases as soon as cancellation is requested",async()=>{
    await expect(assertJobActive(client({status:"processing",cancel_requested_at:"now"}).db,"job",new AbortController().signal)).rejects.toThrow(/cancellation requested/);
  });
  it("stops on the Trigger abort signal",async()=>{
    const controller=new AbortController();controller.abort(new Error("Worker stopped"));
    await expect(assertJobActive(client({status:"processing"}).db,"job",controller.signal)).rejects.toThrow("Worker stopped");
  });
  it("does not settle cancellation while the run function is still working",async()=>{
    const {db,rpc}=client({requested_by:"owner"});let stop!:()=>void;
    const running=new Promise<void>((resolve)=>{stop=resolve;});
    const hook=finishCancelledJob(db,"job",running);
    await vi.waitFor(()=>expect(rpc).toHaveBeenCalledWith("request_generation_cancellation",{job_id:"job",owner_id:"owner"}));
    expect(rpc).toHaveBeenCalledTimes(1);
    stop();await hook;
    expect(rpc).toHaveBeenCalledWith("confirm_generation_cancellation",{job_id:"job"});
  });
});
