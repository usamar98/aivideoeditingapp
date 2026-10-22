import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { absoluteUrl, breadcrumbSchema, organizationId, pageSchema } from "@/lib/seo/structured-data";
import { JsonLd } from "./json-ld";
import { MarketingPage } from "./site-chrome";

export function CreationGuide({ path, title, description, publishedAt, children }: {
  path: string; title: string; description: string; publishedAt: string; children: ReactNode;
}) {
  const articleId = absoluteUrl(`${path}#article`);
  const displayDate = new Date(`${publishedAt}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return <MarketingPage title={title} description={description} eyebrow="Create AI Videos practical guide">
    <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", "@id": articleId, headline: title, description, url: absoluteUrl(path), mainEntityOfPage: absoluteUrl(`${path}#webpage`), image: absoluteUrl("/opengraph-image"), author: { "@type": "Organization", "@id": organizationId, name: brand.name, url: absoluteUrl("/about") }, publisher: { "@id": organizationId }, datePublished: publishedAt, dateModified: publishedAt, inLanguage: "en" }} />
    <JsonLd data={{ ...pageSchema(path, title, description), mainEntity: { "@id": articleId }, datePublished: publishedAt, dateModified: publishedAt }} />
    <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Guides", path: "/guides" }, { name: title, path }])} />
    <p className="text-sm text-muted-foreground">By <Link href="/about" className="underline underline-offset-4">{brand.name}</Link> · Published <time dateTime={publishedAt}>{displayDate}</time> · Based on the supported workflows in this studio</p>
    <article className="max-w-4xl space-y-10 text-sm leading-8 text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_p+p]:mt-4 [&_li]:pl-1">
      {children}
    </article>
    <p className="text-sm"><Link href="/guides" className="text-primary underline underline-offset-4">Explore all video creation guides</Link></p>
  </MarketingPage>;
}

export function GuideSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={id}><h2 id={id} className="editorial mb-5 scroll-mt-6 text-3xl leading-tight">{title}</h2>{children}</section>;
}
