import Link from "next/link";
import { PricingCards } from "@/components/billing/pricing-cards";
import { MarketingPage } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { publicMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, pageSchema, pricingOffers } from "@/lib/seo/structured-data";
import { pricingTiers, formatUsd, planTerms } from "@/lib/billing/pricing";

const title = "AI Video Generator Pricing and Credits";
const description = "Compare ETA's Starter, Creator and Studio plans. See monthly prices, annual totals, included credits and how to manage your video subscription.";
export const metadata = publicMetadata({ title, description, path: "/pricing" });

export default function PricingPage() {
  return <MarketingPage title="A credit budget for your next story." description="Choose monthly flexibility or an annual subscription. All three tiers support the same creative workflows; the difference is your credit budget." eyebrow="ETA plans and pricing">
    <JsonLd data={{ ...pageSchema("/pricing", title, description), mainEntity: { "@type": "OfferCatalog", name: "ETA subscriptions", itemListElement: pricingOffers() } }} />
    <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }])} />
    <section aria-label="Subscription plans"><PricingCards /></section>
    <section><h2 className="editorial text-3xl">What does each billing option include?</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">All prices below are in US dollars. Annual subscriptions are charged as one annual payment, not as twelve monthly payments. The yearly credit allocation is issued upfront.</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[650px] text-left text-sm"><caption className="sr-only">ETA plan prices and credit allocations by billing interval</caption><thead className="bg-accent/50"><tr>{["Plan", "Monthly payment", "Monthly credits", "Annual payment", "Annual credits"].map((label) => <th scope="col" key={label} className="p-4 font-semibold">{label}</th>)}</tr></thead><tbody>{pricingTiers.map((tier) => <tr key={tier.id} className="border-t border-border"><th scope="row" className="p-4">{tier.name}</th><td className="p-4">{formatUsd(tier.monthlyAmount)}</td><td className="p-4">{tier.monthlyCredits.toLocaleString("en-US")}</td><td className="p-4">{formatUsd(planTerms(tier, "year").amount)}<span className="block text-xs text-muted-foreground">{formatUsd(tier.annualMonthlyAmount)}/month equivalent</span></td><td className="p-4">{planTerms(tier, "year").credits.toLocaleString("en-US")}</td></tr>)}</tbody></table></div>
    </section>
    <section className="grid gap-8 md:grid-cols-2">
      <div><h2 className="text-xl font-semibold">How many videos can I create?</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">It depends on the workflow, duration, selected model and number of variants. The studio displays a credit estimate before each paid stage. Compare <Link className="text-primary underline" href="/features/faceless-video-generator">faceless videos</Link>, <Link className="text-primary underline" href="/features/ai-cartoon-series">cartoons</Link> and <Link className="text-primary underline" href="/features/ai-ugc-product-ads">UGC product ads</Link>. UGC planning costs 20 credits; each 15-second ad costs 120 credits, or 240 for 30 seconds.</p></div>
      <div><h2 className="text-xl font-semibold">Can I update my payment method or cancel?</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Sign in, open My account and use the billing portal to manage payment details and your subscription. The portal shows the effective date of a cancellation. Cancelling a subscription does not cancel a running video job; manage those separately on the Jobs page.</p><Link className="mt-3 inline-block text-sm text-primary underline" href="/studio/profile?tab=billing">Manage subscription</Link></div>
      <div><h2 className="text-xl font-semibold">What happens when a generation fails?</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Failed or confirmed-cancelled stages return that stage’s reserved credits. A completed earlier stage, such as cartoon cast creation, stays charged. Cancellation requests may take time to stop provider work. Returned generation credits are not the same as a refund of a subscription payment.</p></div>
      <div><h2 className="text-xl font-semibold">Are unused credits the same as cash?</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">No. Credits are the in-app budget used for generation stages. Check your account for your current balance and billing status. For a payment or billing dispute, <Link className="text-primary underline" href="/contact">contact ETA support</Link> with your account email and a description of the issue, never your full card details.</p></div>
    </section>
  </MarketingPage>;
}
