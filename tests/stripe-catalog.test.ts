import { describe,expect,it } from "vitest";
import type Stripe from "stripe";
import { toBillingPlan,isCreditInvoice } from "@/lib/billing/catalog";
const price={id:"price_test",active:true,unit_amount:1900,currency:"usd",billing_scheme:"per_unit",metadata:{credits:"100"},recurring:{interval:"month",interval_count:1,usage_type:"licensed"},product:{active:true,name:"Creator",description:"Creative tools",metadata:{app:"framefoundry"}}} as unknown as Stripe.Price;
describe("Stripe catalog authorization",()=>{
  it("discovers configured plans without env price IDs",()=>{expect(toBillingPlan(price)).toMatchObject({id:"price_test",name:"Creator",credits:100,amount:1900});});
  it("rejects unrelated, archived, metered, zero-priced, or malformed plans",()=>{
    expect(toBillingPlan({...price,product:"prod_other"})).toBeNull();expect(toBillingPlan({...price,active:false})).toBeNull();expect(toBillingPlan({...price,unit_amount:0})).toBeNull();expect(toBillingPlan({...price,metadata:{credits:"-1"}})).toBeNull();expect(toBillingPlan({...price,metadata:{credits:"2.5"}})).toBeNull();expect(toBillingPlan({...price,product:{...(price.product as Stripe.Product),metadata:{app:"unrelated"}}})).toBeNull();
  });
  it("never grants credits for failed payments or proration invoices",()=>{expect(isCreditInvoice("subscription_cycle",true,1900)).toBe(true);expect(isCreditInvoice("subscription_create",true,1900)).toBe(true);expect(isCreditInvoice("subscription_update",true,500)).toBe(false);expect(isCreditInvoice("subscription_cycle",false,0)).toBe(false);expect(isCreditInvoice("subscription_cycle",true,0)).toBe(false);});
});
