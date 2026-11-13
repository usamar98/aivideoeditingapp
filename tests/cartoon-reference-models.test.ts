import { describe, expect, it } from "vitest";
import { cartoonDemo } from "@/lib/cartoons/demo";
import { cartoonVideoInput } from "@/lib/cartoons/prompts";
import { cartoonBriefSchema, type CartoonBrief } from "@/lib/cartoons/schema";

const story = cartoonDemo.storyboard!;
// The scene lists Bolt before Nova even though the storyboard introduces Nova first.
const scene = { ...story.scenes[0], characterIds: ["c2", "c1"] };
const frame = "https://fal.media/opening.png";
const portraits = ["https://fal.media/bolt.png", "https://fal.media/nova.png"];

function sceneRequest(model: "minimax-h3-reference" | "wan-3-reference", options: Partial<Pick<CartoonBrief, "aspectRatio" | "audio" | "resolution">> = {}) {
  const brief = cartoonBriefSchema.parse({ ...cartoonDemo.brief, model, ...options });
  return cartoonVideoInput(scene, story, brief, frame, portraits, "creator");
}

describe("cartoon character-reference model requests", () => {
  it.each(["9:16", "16:9"] as const)("anchors MiniMax at the storyboard frame with separate cast portraits in %s", (aspectRatio) => {
    const { endpoint, input } = sceneRequest("minimax-h3-reference", { aspectRatio });
    expect(endpoint).toBe("minimax/h3-max/reference-to-video");
    expect(input).toMatchObject({
      image_url: frame, reference_image_urls: portraits, aspect_ratio: aspectRatio,
      resolution: "768P", duration: 5, prompt_expansion_mode: expect.any(String),
    });
    expect(input.prompt).toMatch(/\bImage 1\b[^.!?\n]{0,45}\bBolt\b/i);
    expect(input.prompt).toMatch(/\bImage 2\b[^.!?\n]{0,45}\bNova\b/i);
    expect(input.prompt).toContain(scene.dialogue[0].text);
    expect(input).not.toHaveProperty("audio");
    expect(input).not.toHaveProperty("generate_audio");
  });

  it.each(["9:16", "16:9"] as const)("grounds Wan in the scene composition before its cast portraits in %s", (aspectRatio) => {
    const { endpoint, input } = sceneRequest("wan-3-reference", { aspectRatio });
    expect(endpoint).toBe("alibaba/wan-3.0/reference-to-video");
    expect(input).toMatchObject({
      reference_image_urls: [frame, ...portraits], aspect_ratio: aspectRatio,
      resolution: "720p", duration: 5, audio: true,
    });
    expect(input.prompt).toMatch(/\bImage 1\b[^.!?\n]{0,60}\b(composition|opening|first frame)\b/i);
    expect(input.prompt).toMatch(/\bImage 2\b[^.!?\n]{0,45}\bBolt\b/i);
    expect(input.prompt).toMatch(/\bImage 3\b[^.!?\n]{0,45}\bNova\b/i);
    expect(input.prompt).toContain(scene.dialogue[0].text);
    expect(input).not.toHaveProperty("image_url");
    expect(input).not.toHaveProperty("generate_audio");
  });

  it("supports silent Wan scenes without passing spoken dialogue", () => {
    const { input } = sceneRequest("wan-3-reference", { audio: false, resolution: "1080p" });
    expect(input).toMatchObject({ audio: false, resolution: "1080p" });
    expect(input.prompt).not.toContain(scene.dialogue[0].text);
  });

  it("uses uppercase fal resolution values for MiniMax when another tier is selected", () => {
    expect(sceneRequest("minimax-h3-reference", { resolution: "1080p" }).input).toHaveProperty("resolution", "1080P");
  });

  it.each([
    { model: "minimax-h3-reference", resolution: "720p" },
    { model: "wan-3-reference", resolution: "768p" },
    { model: "minimax-h3-reference", audio: false },
  ])("rejects settings unsupported by the selected reference model: %j", (settings) => {
    expect(cartoonBriefSchema.safeParse({ ...cartoonDemo.brief, ...settings }).success).toBe(false);
  });
});
