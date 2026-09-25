import { brand } from "@/config/brand";
import { pricingTiers, planTerms } from "@/lib/billing/pricing";

export const absoluteUrl = (path: string) => new URL(path, brand.siteUrl).toString();
export const organizationId = absoluteUrl("/#organization");
export const websiteId = absoluteUrl("/#website");

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

export function identitySchema() {
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": organizationId, name: brand.name, url: absoluteUrl("/"), description: brand.description,
      logo: { "@type": "ImageObject", url: absoluteUrl("/brand/eta-logo.png"), width: 864, height: 256 },
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: brand.supportEmail, url: absoluteUrl("/contact") } },
    { "@type": "WebSite", "@id": websiteId, name: brand.name, url: absoluteUrl("/"), description: brand.description, inLanguage: "en", publisher: { "@id": organizationId } },
  ] };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(item.path) })) };
}

export function pageSchema(path: string, name: string, description: string, type = "WebPage") {
  return { "@context": "https://schema.org", "@type": type, "@id": absoluteUrl(`${path}#webpage`), url: absoluteUrl(path), name, description, inLanguage: "en", isPartOf: { "@id": websiteId }, publisher: { "@id": organizationId } };
}

export function pricingOffers() {
  return pricingTiers.flatMap((tier) => (["month", "year"] as const).map((interval) => {
    const terms = planTerms(tier, interval);
    return { "@type": "Offer", name: `${tier.name} — ${interval === "month" ? "monthly" : "annual"} subscription`, url: absoluteUrl("/pricing"), priceCurrency: "USD", price: (terms.amount / 100).toFixed(2),
      description: `${terms.credits.toLocaleString("en-US")} credits per ${interval}. ${interval === "year" ? "Billed annually; full year's credits granted upfront." : "Billed monthly."}`,
      priceSpecification: { "@type": "UnitPriceSpecification", price: (terms.amount / 100).toFixed(2), priceCurrency: "USD", billingDuration: interval === "year" ? "P1Y" : "P1M" } };
  }));
}
