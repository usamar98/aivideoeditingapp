import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/features/repository", () => ({ getPublishedFeaturesData: async () => [] }));
vi.mock("@/components/billing/pricing-cards", () => ({ PricingCards: () => null }));
import Home, { metadata } from "@/app/page";
import { JsonLd } from "@/components/marketing/json-ld";
import { homeFaqs } from "@/lib/seo/editorial-content";
import { faqSchema } from "@/lib/seo/structured-data";
import { heroMediaRows } from "@/components/marketing/hero-media";

describe("requested homepage SEO fixes", () => {
  it("uses the exact title, one descriptive H1 and a separate slogan", async () => {
    const $ = load(renderToStaticMarkup(await Home()));
    expect($("h1")).toHaveLength(1);
    expect($("h1").text()).toBe("Create faceless videos, AI cartoons and UGC ads");
    expect($("h1 br")).toHaveLength(0);
    expect($("h1").next("p").text()).toBe("Made to move.");
    expect(metadata.title).toEqual({ absolute: "AI Video Generator for Faceless Videos, Cartoons & UGC Ads | Create AI Videos" });
    expect(metadata.alternates?.canonical).toBe("https://createaivideos.app/");
  });

  it("server-renders one FAQ graph that exactly matches the visible section", async () => {
    const $ = load(renderToStaticMarkup(await Home()));
    const graphs = $("script[type='application/ld+json']").map((_, item) => JSON.parse($(item).text())).get();
    const faqs = graphs.filter(graph => graph["@type"] === "FAQPage");
    expect(faqs).toHaveLength(1);
    expect(faqs[0]).toMatchObject({ "@context": "https://schema.org", "@id": "https://createaivideos.app/#faq", url: "https://createaivideos.app/#questions" });
    expect(faqs[0].mainEntity).toEqual(homeFaqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })));
    expect($("#questions h3").map((_, item) => $(item).text()).get()).toEqual(homeFaqs.map(item => item.question));
    expect($("#questions section p").map((_, item) => $(item).text()).get()).toEqual(homeFaqs.map(item => item.answer));
    expect(JSON.stringify(graphs)).not.toMatch(/AggregateRating|SearchAction|"HowTo"/);
  });

  it("uses the existing safe serializer for question and answer text", () => {
    const hostile = "</script><script>alert('example')</script>";
    const html = renderToStaticMarkup(createElement(JsonLd, { data: faqSchema([{ question: hostile, answer: hostile }]) }));
    expect(html.match(/<script/g)).toHaveLength(1);
    const $ = load(html);
    expect(JSON.parse($("script").text()).mainEntity[0].acceptedAnswer.text).toBe(hostile);
  });

  it("fills all twelve hero image alts without exposing duplicate background content to screen readers", async () => {
    const $ = load(renderToStaticMarkup(await Home()));
    const images = $(".hero-reels img");
    expect(images).toHaveLength(12);
    expect($(".hero-reels").attr("aria-hidden")).toBe("true");
    const descriptions = heroMediaRows.flatMap(row => row.filter(item => item.kind === "image").map(item => item.alt));
    expect(new Set(descriptions).size).toBe(6);
    images.each((_, image) => {
      const alt = $(image).attr("alt")!;
      expect(descriptions).toContain(alt);
      expect(alt.length).toBeGreaterThan(20);
      expect(alt.length).toBeLessThanOrEqual(125);
    });
  });
});
