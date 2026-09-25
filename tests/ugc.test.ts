import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk", () => ({ schemaTask: (options: unknown) => options }));
import { ugcDemo } from "@/lib/ugc/demo";
import { ugcBriefSchema, ugcPlanSchema, ugcSelectionSchema, ugcRenderCredits, ugcScript, validateUgcPlan, UGC_AVATAR_MODEL } from "@/lib/ugc/schema";
import { isPublicAddress, validateProductUrl, parseProductPage, imageMime } from "@/lib/ugc/product-import";
import { ugcRenderArgs, wrapAdCta } from "../trigger/ugc-render";
import { parseUgcCompletion, ugcPlannerRequest } from "../trigger/ugc-pipeline";
import { cartoonFalClient } from "../trigger/cartoon-fal";
import { getFeature } from "@/lib/features/catalog";
import { featureEditorial } from "@/lib/seo/editorial-content";

describe("UGC contracts and pricing", () => {
  it("validates the preview without pretending there is generated output", () => {
    validateUgcPlan(ugcPlanSchema.parse(ugcDemo.plan), ugcBriefSchema.parse(ugcDemo.brief));
    expect(ugcDemo.outputs).toEqual([]); expect(ugcDemo.presenterUrl).toBeNull();
    expect(ugcScript(ugcDemo.plan!, "hook-1")).toContain("Bringing your own drink?");
  });
  it.each([{ duration: 60 }, { rightsConfirmed: false }, { productAssetIds: [] }, { brandColor: "red;evil" }, { presenter: "celebrity" }, { productUrl: "http://shop.com" }])("rejects unsafe or unsupported briefs %j", (change) => {
    expect(ugcBriefSchema.safeParse({ ...ugcDemo.brief, ...change }).success).toBe(false);
  });
  it("requires distinct hooks and refuses overlong scripts", () => {
    const plan = structuredClone(ugcDemo.plan!); plan.hooks[1].id = "hook-1";
    expect(() => validateUgcPlan(plan, ugcDemo.brief)).toThrow(/distinct/);
    plan.hooks[1].id = "hook-2"; plan.body = "long ".repeat(80);
    expect(() => validateUgcPlan(plan, ugcDemo.brief)).toThrow(/Shorten/);
    expect(ugcSelectionSchema.safeParse(["hook-1", "hook-1"]).success).toBe(false);
    expect(ugcSelectionSchema.safeParse([]).success).toBe(false);
  });
  it("charges only selected duration/variant count", () => {
    expect(ugcRenderCredits(15, 1)).toBe(120); expect(ugcRenderCredits(15, 3)).toBe(360);
    expect(ugcRenderCredits(30, 3)).toBe(720);
    expect(() => ugcRenderCredits(15, 0)).toThrow(); expect(() => ugcRenderCredits(15, 1.5)).toThrow();
  });
});
describe("safe product imports", () => {
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "224.0.0.1", "192.0.2.1"])("rejects nonpublic address %s", (address) => expect(isPublicAddress(address)).toBe(false));
  it.each(["https://user:pass@shop.com/p", "https://localhost/p", "http://shop.com", "https://shop.com:8443", "file:///etc/passwd", "https://127.1/p", "https://[::1]/p", "https://metadata.internal/p"])("rejects unsafe URL %s", (url) => expect(() => validateProductUrl(url)).toThrow());
  it("accepts public HTTPS without executing embedded product markup", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    const parsed = parseProductPage(`<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"<b>A cup</b>","description":"A useful &amp; reusable cup","image":["/cup.jpg","http://127.0.0.1/private"]}]}</script><meta property="og:image" content="/cup.jpg">`, "https://shop.example/p");
    expect(parsed).toEqual({ productName: "A cup", description: "A useful & reusable cup", images: ["https://shop.example/cup.jpg"] });
  });
  it("falls back to safe metadata when merchant JSON is invalid", () => {
    const parsed = parseProductPage('<script type="application/ld+json">invalid</script><title>Shop product</title><meta name="description" content="Product details">', "https://shop.example/p");
    expect(parsed.productName).toBe("Shop product"); expect(parsed.description).toBe("Product details"); expect(parsed.images).toEqual([]);
  });
  it("rejects a MIME-spoofed playlist or SVG before FFmpeg", () => {
    expect(() => imageMime(Buffer.from("ffconcat version 1.0"))).toThrow();
    expect(() => imageMime(Buffer.from("<svg>bad</svg>"))).toThrow();
    expect(imageMime(Buffer.from([137,80,78,71,13,10,26,10]))).toBe("image/png");
  });
});
describe("UGC provider and export contracts", () => {
  it("separates untrusted brief data from claim and word-count instructions", () => {
    const request = ugcPlannerRequest(ugcDemo.brief);
    expect(request.messages[0].content).toContain("Never invent personal experience");
    expect(request.messages[0].content).toContain("28 words");
    expect(request.messages[1].content).toContain("approvedBenefits");
    expect(request.response_format.json_schema.strict).toBe(true);
  });
  it("accepts complete structured plans and rejects refusals and truncated completions", () => {
    const completion = { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(ugcDemo.plan) } }] };
    expect(parseUgcCompletion(completion)).toEqual(ugcDemo.plan);
    expect(() => parseUgcCompletion({ choices: [{ ...completion.choices[0], finish_reason: "length" }] })).toThrow();
  });
  it("allowlists the avatar endpoint without adding SDK POST retries", async () => {
    vi.stubEnv("FAL_KEY", "not-a-real-key");
    const mock = vi.fn().mockResolvedValue(new Response("failed", { status: 503 })); vi.stubGlobal("fetch", mock);
    try { await expect(cartoonFalClient().queue.submit(UGC_AVATAR_MODEL, { input: { image_url: "https://fal.media/portrait.png", audio_url: "https://fal.media/voice.mp3" } })).rejects.toThrow(/rejected/); expect(mock).toHaveBeenCalledTimes(1); }
    finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  it.each(["9:16", "1:1", "16:9"] as const)("builds a bounded %s composition with original photos, voice and disclosure", (aspectRatio) => {
    const args = ugcRenderArgs({ ...ugcDemo.brief, aspectRatio }, 4), filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("AI presenter"); expect(filter).toContain("subtitles=captions.srt"); expect(filter).toContain("expansion=none");
    expect(filter).toContain("products3"); expect(args).toContain("1:a:0"); expect(args).toContain("-filter_complex_threads");
    expect(args).not.toContain(ugcDemo.brief.cta);
  });
  it("can omit burned captions without losing downloadable SRT generation", () => {
    expect(ugcRenderArgs({ ...ugcDemo.brief, captions: false }, 1).join(" ")).not.toContain("subtitles=");
    expect(wrapAdCta("A slightly longer call to action")).toContain("\n");
  });
  it("publishes substantive SEO without fake examples or unsupported claims", () => {
    const feature = getFeature("ai-ugc-product-ads")!;
    expect(feature.seo.canonicalPath).toBe("/features/ai-ugc-product-ads"); expect(feature.status).toBe("published");
    expect(feature.exampleMedia).toEqual([]); expect(featureEditorial[feature.slug].faqs.length).toBeGreaterThanOrEqual(6);
    expect(feature.limitations.join(" ")).toContain("not a genuine customer review");
  });
});
