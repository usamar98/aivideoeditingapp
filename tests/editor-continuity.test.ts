import { describe, expect, it } from "vitest";

import { demoEpisode } from "@/lib/editor/demo";
import { reorderScene, replaceScene } from "@/lib/editor/operations";

describe("scene-level editing", () => {
  it("replaces one scene without mutating approved neighbors", () => {
    const originalFirst = demoEpisode.scenes[0];
    const originalThird = demoEpisode.scenes[2];
    const replacement = { ...demoEpisode.scenes[1], dialogue: "A revised line", approved: false };
    const next = replaceScene(demoEpisode, replacement.id, replacement);

    expect(next.scenes[0]).toEqual(originalFirst);
    expect(next.scenes[2]).toEqual(originalThird);
    expect(next.scenes[1].dialogue).toBe("A revised line");
  });

  it("reorders scenes while keeping stable IDs and sequential positions", () => {
    const next = reorderScene(demoEpisode, "scene-3", 0);
    expect(next.scenes.map((scene) => scene.id)).toEqual(["scene-3", "scene-1", "scene-2"]);
    expect(next.scenes.map((scene) => scene.position)).toEqual([0, 1, 2]);
  });
});
