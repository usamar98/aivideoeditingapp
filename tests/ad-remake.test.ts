import { describe, expect, it } from "vitest";
import { remakeBrief as b } from "./fixtures/ad-remake";
import { adRemakeBriefSchema, adRemakeUploadSchema, adRemakeInput, adRemakeModels, adRemakeCredits, validateAdRemakeSource } from "@/lib/ad-remake/schema";
import { getFeature } from "@/lib/features/catalog";
import { adRemakeRenderArgs, wrapRemakeCta } from "../trigger/ad-remake-render";
describe("Ad Remake input and export contracts", () => {
  it.each(["standard", "pro"] as const)("uses the documented reference editing contract for %s", model => {
    const input = adRemakeInput({ ...b, model }, "https://example.com/reference.mp4", ["https://example.com/product.png"]);
    expect(adRemakeModels[model].endpoint).toBe(`fal-ai/kling-video/o3/${model}/video-to-video/edit`);
    expect(input).toMatchObject({ video_url: "https://example.com/reference.mp4", keep_audio: false, elements: [{ frontal_image_url: "https://example.com/product.png" }] });
    expect(input.prompt).toContain("@Video1"); expect(input.prompt).toContain("@Element1");
    expect(adRemakeCredits({ ...b, model })).toBe(model === "standard" ? 30 : 40);
  });
  it("rejects unsafe, unowned-shape, oversized or unsupported inputs", () => {
    for (const patch of [{ seconds: 180 }, { seconds: 2.9 }, { rightsConfirmed: false }, { model: "free" }, { productAssetIds: [] }, { productAssetIds: [b.productAssetIds[0], b.productAssetIds[0]] }, { brandColor: "red,drawtext=bad" }, { title: "bad\nname" }]) expect(adRemakeBriefSchema.safeParse({ ...b, ...patch }).success).toBe(false);
    expect(adRemakeUploadSchema.safeParse({ kind: "video", mime: "video/webm", size: 100 }).success).toBe(false);
    expect(adRemakeUploadSchema.safeParse({ kind: "image", mime: "image/png", size: 9 * 1024 * 1024 }).success).toBe(false);
    expect(() => adRemakeInput(b, "url", [])).toThrow(/Missing/);
  });
  it("validates probed footage before inference and prevents credit estimate spoofing", () => {
    expect(() => validateAdRemakeSource({ seconds: 4.2, width: 720, height: 1280 }, 5)).not.toThrow();
    for (const patch of [{ seconds: NaN }, { seconds: 16 }, { seconds: 2 }, { seconds: 6 }, { width: 640 }, { height: 4000 }]) expect(() => validateAdRemakeSource({ seconds: 5, width: 720, height: 1280, ...patch }, 5)).toThrow();
  });
  it("preserves framing, removes provider audio and renders exact CTA safely", () => {
    const args = adRemakeRenderArgs(b, 5, 720, 1280, true).join(" ");
    expect(args).toContain("force_original_aspect_ratio=decrease"); expect(args).not.toContain("crop="); expect(args).toContain("-an");
    expect(args).toContain("AI-edited ad"); expect(args).toContain("textfile=cta.txt:expansion=none"); expect(args).toContain("gte(t,3)");
    expect(adRemakeRenderArgs({ ...b, keepAudio: true }, 5, 720, 1280, true).join(" ")).toContain("-map 1:a:0");
    const text = "x".repeat(60); expect(wrapRemakeCta(text).replaceAll("\n", "")).toBe(text); expect(wrapRemakeCta(text).split("\n").every(l => l.length <= 28)).toBe(true);
    expect(wrapRemakeCta("")).toBe("");
    const narrow = adRemakeRenderArgs({ ...b, cta: "x".repeat(60) }, 5, 360, 1920, false).join(" ");
    expect(narrow).toContain("fontsize=11"); expect(narrow).toContain("text_h/2");
  });
  it("publishes an accurate feature contract without fabricated examples", () => {
    const f = getFeature("ai-ad-remake")!; expect(f.exampleMedia).toEqual([]); expect(f.limitations.join(" ")).toContain("Human review"); expect(f.capabilities.join(" ")).toContain("3–15");
  });
});
