import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingPage } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, pageSchema } from "@/lib/seo/structured-data";

export type LegalSection = { id: string; title: string; content: ReactNode };
export const legalUpdatedAt = "2026-09-25";

export function LegalPage({ title, description, path, sections }: {
  title: string;
  description: string;
  path: "/privacy" | "/terms";
  sections: LegalSection[];
}) {
  return (
    <MarketingPage title={title} description={description} eyebrow="ETA / Legal">
      <JsonLd data={{ ...pageSchema(path, title, description), dateModified: legalUpdatedAt }} />
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: title, path }])} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border py-4 text-sm">
        <p className="text-muted-foreground">Last updated: <time dateTime={legalUpdatedAt}>September 25, 2026</time></p>
        <Link href={path === "/privacy" ? "/terms" : "/privacy"} className="text-primary underline underline-offset-4">
          {path === "/privacy" ? "Terms of Service" : "Privacy Policy"}
        </Link>
      </div>
      <div className="grid items-start gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold">On this page</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            {sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`} className="hover:text-primary hover:underline">{index + 1}. {section.title}</a></li>)}
          </ol>
        </nav>
        <div className="min-w-0 space-y-10">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-8 border-b border-border pb-10 last:border-0">
              <h2 id={`${section.id}-title`} className="editorial text-2xl sm:text-3xl">{index + 1}. {section.title}</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8 [&_a]:break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_li]:mt-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
                {section.content}
              </div>
            </section>
          ))}
        </div>
      </div>
    </MarketingPage>
  );
}
