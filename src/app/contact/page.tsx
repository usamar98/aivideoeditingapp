import Link from "next/link";
import { brand } from "@/config/brand";
import { MarketingPage } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { publicMetadata } from "@/lib/seo/metadata";
import { pageSchema, breadcrumbSchema } from "@/lib/seo/structured-data";

const title = "Contact ETA Support — Accounts, Billing and Video Jobs";
const description = "Contact ETA support for account access, subscriptions, credits or video generation issues. Learn which job details to include and how to manage billing.";
export const metadata = publicMetadata({ title, description, path: "/contact" });

export default function ContactPage() {
  return <MarketingPage title="How can we help with your studio?" description="For questions about ETA, your account, a subscription or a video job, email our support address. Include enough detail to identify the issue without sharing sensitive credentials." eyebrow="Contact ETA">
    <JsonLd data={pageSchema("/contact", title, description, "ContactPage")} />
    <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }])} />
    <a className="inline-block break-all rounded-2xl border border-primary/20 bg-accent px-5 py-5 text-lg font-semibold text-primary sm:text-2xl" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
    <div className="grid gap-10 md:grid-cols-2"><section><h2 className="editorial text-3xl">For a video generation issue</h2><ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-7 text-muted-foreground"><li>Include your account email and the affected job ID from the Jobs page.</li><li>Tell us which workflow you used and the step that failed.</li><li>Include the approximate time and any visible error message.</li><li>If you attach a screenshot, crop or hide unrelated personal information.</li></ul><p className="mt-5 text-sm leading-7"><Link href="/studio/jobs" className="text-primary underline">Open Jobs</Link> to check a status or request cancellation. Cancellation may need worker confirmation before the reserved credits and job slot are released.</p></section><section><h2 className="editorial text-3xl">For billing or account access</h2><p className="mt-5 text-sm leading-7 text-muted-foreground">Payment methods and subscription cancellation are managed through <Link className="text-primary underline" href="/studio/profile?tab=billing">My account</Link>. For an unexpected charge or credit balance, include the date, plan name and a description of what happened.</p><p className="mt-4 text-sm leading-7 text-muted-foreground">Never send your password, full card number, API secret, email confirmation link or authentication token. Support does not need those details to identify a job or review an account question.</p><p className="mt-4 text-sm leading-7 text-muted-foreground">Looking for plan details? See <Link className="text-primary underline" href="/pricing">pricing and credit questions</Link>. For a correction to our public product information, include the page URL and the statement you want us to review.</p></section></div>
  </MarketingPage>;
}
