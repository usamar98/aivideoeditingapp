import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { logJobFailure, recordDispatchFailure, safeJobError } from "@/lib/jobs/diagnostics";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("safe job diagnostics", () => {
  it.each([[401,"authentication"], [403,"permission"], [404,"not_found"], [429,"rate_limit"], [504,"timeout"], [503,"unavailable"], [422,"invalid_request"]])("classifies HTTP %s without retaining the response", (status, category) => {
    expect(safeJobError({ status, message: "secret", body: "secret" })).toMatchObject({ status, category });
    expect(JSON.stringify(safeJobError({status,message:"secret"}))).not.toContain("secret");
  });
  it("never logs keys, request payloads, signed URLs, stacks, or arbitrary error properties", () => {
    vi.stubEnv("TRIGGER_SECRET_KEY", "tr_prod_private_key");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    logJobFailure("submit_task", "job-reference", {
      status:401, code:"tr_prod_private_key", name:"tr_prod_private_key",
      message:"Bearer tr_prod_private_key", stack:"private stack", headers:{Authorization:"secret header"},
      body:{topic:"private topic",url:"https://example.test?token=signed-secret"},
    });
    expect(log).toHaveBeenCalledWith("[jobs]", expect.objectContaining({ stage:"submit_task",generationId:"job-reference",triggerEnvironment:"production",category:"authentication",status:401 }));
    const serialized = JSON.stringify(log.mock.calls);
    for (const secret of ["tr_prod_private_key","private stack","secret header","private topic","signed-secret"]) expect(serialized).not.toContain(secret);
  });
  it("records only sanitized errors on unsettled jobs without a cancellation request", async () => {
    vi.spyOn(console,"error").mockImplementation(()=>{});
    const chain = { eq:vi.fn(()=>chain), in:vi.fn(()=>chain), is:vi.fn(()=>chain), then:Promise.resolve({error:null}).then.bind(Promise.resolve({error:null})) };
    const update = vi.fn(()=>chain);
    const admin = { from:vi.fn(()=>({update})) } as unknown as SupabaseClient;
    const message = await recordDispatchFailure(admin,"job-reference","submit_task",{status:403,message:"secret payload"});
    expect(message).toContain("HTTP 403");expect(message).toContain("job-reference");
    expect(update).toHaveBeenCalledWith({error_message:message});expect(message).not.toContain("secret payload");
    expect(chain.in).toHaveBeenCalledWith("status",["created","reserved","submitted"]);
    expect(chain.is).toHaveBeenCalledWith("cancel_requested_at",null);expect(chain.is).toHaveBeenCalledWith("reported_credits",null);
  });
  it("still returns a safe error if persisting diagnostics fails", async () => {
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    const admin={from:()=>{throw new Error("secret connection string");}} as unknown as SupabaseClient;
    expect(await recordDispatchFailure(admin,"job-reference","save_run",{code:"42501",message:"secret"})).toContain("denied access");
    expect(log).toHaveBeenLastCalledWith("[jobs]",expect.objectContaining({stage:"save_diagnostic"}));
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
});
