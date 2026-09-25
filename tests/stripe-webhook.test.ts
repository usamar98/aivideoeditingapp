import Stripe from "stripe";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
import { packSession } from "./fixtures/credit-pack";

const mocks=vi.hoisted(()=>({duplicate:false,quantity:1,proration:false,rpc:vi.fn(),upsert:vi.fn(),processed:vi.fn(),subscriptions:vi.fn(),retrieveInvoice:vi.fn(),retrievePrice:vi.fn(),retrieveSession:vi.fn()}));
vi.mock("@/lib/billing/stripe",()=>({getStripe:()=>({webhooks:new Stripe("sk_test_local_only").webhooks,checkout:{sessions:{retrieve:mocks.retrieveSession}},subscriptions:{list:mocks.subscriptions},invoices:{retrieve:mocks.retrieveInvoice,listLineItems:async function*(){yield {amount:1900,quantity:mocks.quantity,pricing:{price_details:{price:"price_test"}},parent:{subscription_item_details:{proration:mocks.proration}}};}},prices:{retrieve:mocks.retrievePrice}})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:mocks.rpc,from:(table:string)=>{const chain={error:null,select:()=>chain,eq:()=>chain,maybeSingle:async()=>({error:null,data:table==="billing_customers"?{user_id:"user_owned",workspace_id:"workspace_owned"}:mocks.duplicate?{processed_at:"2026-09-22"}:null}),upsert:mocks.upsert,update:(value:unknown)=>{mocks.processed(value);return chain;}};return chain;}})}));
import { POST } from "@/app/api/webhooks/stripe/route";
const secret="whsec_local_verification_only";
function request(type="invoice.paid",signatureValid=true){const body=JSON.stringify({id:"evt_local",object:"event",created:Math.floor(Date.now()/1000),type,data:{object:{id:"in_test",customer:"cus_owned"}}});const signature=Stripe.webhooks.generateTestHeaderString({payload:body,secret:signatureValid?secret:"wrong"});return new Request("https://example.test/api/webhooks/stripe",{method:"POST",headers:{"stripe-signature":signature},body});}
beforeEach(()=>{vi.clearAllMocks();mocks.duplicate=false;mocks.quantity=1;mocks.proration=false;vi.stubEnv("STRIPE_SECRET_KEY","sk_test_local_only");vi.stubEnv("STRIPE_WEBHOOK_SECRET",secret);mocks.rpc.mockResolvedValue({error:null});mocks.upsert.mockResolvedValue({error:null});mocks.subscriptions.mockResolvedValue({data:[]});mocks.retrieveInvoice.mockResolvedValue({id:"in_test",billing_reason:"subscription_cycle",status:"paid",amount_paid:1900});mocks.retrievePrice.mockResolvedValue({metadata:{credits:"100"},product:{metadata:{app:"framefoundry"}}});});
afterEach(()=>vi.unstubAllEnvs());
describe("Stripe webhook boundary",()=>{
  it.each([[440,2],[1100,3],[13200,2],[26400,3]])("grants verified %i credits × %i invoice quantity, idempotently",async(credits,quantity)=>{
    mocks.quantity=quantity;mocks.retrievePrice.mockResolvedValue({metadata:{credits:String(credits)},product:{metadata:{app:"framefoundry"}}});
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("apply_credit_purchase",expect.objectContaining({credit_amount:credits*quantity,event_key:"stripe:invoice:in_test"}));
    mocks.duplicate=true;await POST(request());expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([0,-1,1.5,4])("does not silently fulfill unsupported quantity %s",async(quantity)=>{
    mocks.quantity=quantity;const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    expect((await POST(request())).status).toBe(500);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.processed).not.toHaveBeenCalled();log.mockRestore();
  });
  it("does not grant extra credits for prorated quantity changes",async()=>{
    mocks.quantity=3;mocks.proration=true;expect((await POST(request())).status).toBe(200);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([5280,13200,26400])("grants the full annual allocation of %i exactly once per processed event",async(credits)=>{mocks.retrievePrice.mockResolvedValue({metadata:{credits:String(credits)},product:{metadata:{app:"framefoundry"}}});expect((await POST(request())).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith("apply_credit_purchase",expect.objectContaining({credit_amount:credits,event_key:"stripe:invoice:in_test"}));mocks.duplicate=true;expect((await POST(request())).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledTimes(1);});
  it("rejects forged signatures before reading or crediting data",async()=>{expect((await POST(request("invoice.paid",false))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.subscriptions).not.toHaveBeenCalled();});
  it("acknowledges processed event retries without fulfillment",async()=>{mocks.duplicate=true;expect((await POST(request())).status).toBe(200);expect(mocks.rpc).not.toHaveBeenCalled();});
  it("uses the owned customer and invoice id for credit fulfillment",async()=>{expect((await POST(request())).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith("apply_credit_purchase",{target_workspace_id:"workspace_owned",credit_amount:100,event_key:"stripe:invoice:in_test",external_id:"in_test"});expect(mocks.processed).toHaveBeenCalled();});
  it("returns a retryable error if credits cannot be persisted",async()=>{mocks.rpc.mockResolvedValue({error:{message:"offline"}});const consoleSpy=vi.spyOn(console,"error").mockImplementation(()=>{});expect((await POST(request())).status).toBe(500);expect(mocks.processed).not.toHaveBeenCalled();consoleSpy.mockRestore();});
  it("never grants credits on payment failure",async()=>{expect((await POST(request("invoice.payment_failed"))).status).toBe(200);expect(mocks.rpc).not.toHaveBeenCalled();});
});

function packRequest(type = "checkout.session.completed", id = "evt_pack", signed = true) {
  const body = JSON.stringify({ id, object: "event", type, data: { object: packSession() } });
  return new Request("https://example.test/api/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: body, secret: signed ? secret : "wrong" }) } });
}
describe("one-time credit pack webhook", () => {
  beforeEach(() => mocks.retrieveSession.mockResolvedValue(packSession()));
  it("grants only 10 credits after retrieving and verifying the paid checkout", async () => {
    expect((await POST(packRequest())).status).toBe(200);
    expect(mocks.retrieveSession).toHaveBeenCalledWith("cs_test_creditpack123", { expand: ["line_items", "payment_intent"] });
    expect(mocks.rpc).toHaveBeenCalledWith("apply_credit_purchase", { target_workspace_id: "workspace_owned", credit_amount: 10, event_key: "stripe:checkout:cs_test_creditpack123", external_id: "cs_test_creditpack123" });
    expect(mocks.subscriptions).not.toHaveBeenCalled();
  });
  it("uses the same database idempotency key for different delivery events", async () => {
    await POST(packRequest()); await POST(packRequest("checkout.session.async_payment_succeeded", "evt_second"));
    expect(mocks.rpc.mock.calls.map((call) => call[1].event_key)).toEqual(["stripe:checkout:cs_test_creditpack123", "stripe:checkout:cs_test_creditpack123"]);
  });
  it("ignores processed event replays", async () => {
    mocks.duplicate = true; expect((await POST(packRequest())).status).toBe(200);
    expect(mocks.retrieveSession).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not grant on an unpaid completion or failed payment", async () => {
    mocks.retrieveSession.mockResolvedValue(packSession({ payment_status: "unpaid" }));
    await POST(packRequest()); await POST(packRequest("checkout.session.async_payment_failed", "evt_failed"));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ amount_total: 1 }, { customer: "cus_other" }, { client_reference_id: "other" }])("rejects paid sessions with invalid terms %j", async (override) => {
    mocks.retrieveSession.mockResolvedValue(packSession(override));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(packRequest())).status).toBe(500); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.processed).not.toHaveBeenCalled(); log.mockRestore();
  });
  it("retries failed persistence without marking the event processed", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "database unavailable" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(packRequest())).status).toBe(500); expect(mocks.processed).not.toHaveBeenCalled(); log.mockRestore();
  });
  it("rejects forged payment webhooks", async () => {
    expect((await POST(packRequest("checkout.session.completed", "evt_pack", false))).status).toBe(400);
    expect(mocks.retrieveSession).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
