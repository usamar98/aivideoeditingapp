import { describe, expect, it } from "vitest";

import { storyboardResponseSchema } from "@/lib/editor/schemas";

const baseScene = {
  title: "A tiny forecast",
  characters: ["Pip", "Moss"],
  setting: "Rooftop workshop",
  action: "Pip turns the weather dial while Moss checks the gauge.",
  dialogue: "Pip: Ready? Moss: Forecasting surprises.",
  camera: "Slow push in",
  targetDurationSeconds: 10,
};

describe("structured storyboard output", () => {
  it("accepts a production-ready 30 second draft without generated asset fields", () => {
    const result = storyboardResponseSchema.parse({
      title: "Pocket Weather",
      logline: "A tiny cloud escapes in the workshop.",
      recap: "Pip and Moss repaired the rooftop workshop.",
      aspectRatio: "16:9",
      targetDurationSeconds: 30,
      scenes: [baseScene, { ...baseScene, title: "A windy idea" }, { ...baseScene, title: "A gentle fix" }],
    });
    expect(result.scenes).toHaveLength(3);
  });

  it("rejects storyboards whose scene timing is outside the product limit", () => {
    expect(() => storyboardResponseSchema.parse({
      title: "Too short",
      logline: "A draft that cannot meet the episode duration.",
      recap: "",
      aspectRatio: "9:16",
      targetDurationSeconds: 30,
      scenes: [baseScene, baseScene, { ...baseScene, targetDurationSeconds: 3 }],
    })).toThrow(/Scene durations/);
  });
});
