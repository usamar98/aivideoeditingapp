import { describe, expect, it, vi } from "vitest";
import { FACELESS_MACHINE, concatRenderArgs, sceneFilter, sceneRenderArgs } from "../trigger/faceless-render";

vi.mock("@trigger.dev/sdk", () => ({
  schemaTask: <T,>(definition: T) => definition,
  task: <T,>(definition: T) => definition,
}));
import { facelessPipeline } from "../trigger/faceless-pipeline";
import { renderSmokeCheck } from "../src/trigger/render-smoke-check";

describe("memory-bounded faceless rendering", () => {
  it("gives the real worker and synthetic check the same 4 GB machine", () => {
    expect(FACELESS_MACHINE).toBe("medium-2x");
    expect(facelessPipeline).toHaveProperty("machine", FACELESS_MACHINE);
    expect(renderSmokeCheck).toHaveProperty("machine", FACELESS_MACHINE);
  });
  it("caps decoder, filter, and encoder pools with options on the correct side of inputs", () => {
    const args = sceneRenderArgs(1, 12, "scale=720:1280");
    expect(args.slice(args.indexOf("-filter_threads"), args.indexOf("-filter_threads") + 2)).toEqual(["-filter_threads", "1"]);
    expect(args.slice(args.indexOf("-threads:v"), args.indexOf("-threads:v") + 2)).toEqual(["-threads:v", "2"]);
    expect(args.indexOf("-threads")).toBeLessThan(args.indexOf("-i"));
    expect(args.indexOf("-threads:v")).toBeGreaterThan(args.lastIndexOf("-i"));
    expect(args).toContain("-nostats");
    expect(args.at(-1)).toBe("clip-1.mp4");
  });
  it("keeps captions and aspect-ratio dimensions unchanged", () => {
    expect(sceneFilter(720, 1280, 2, true)).toContain("scale=720:1280");
    expect(sceneFilter(720, 1280, 2, true)).toContain("subtitles=captions-2.srt");
    expect(sceneFilter(1280, 720, 0, false)).not.toContain("subtitles");
  });
  it("assembles clips without re-encoding", () => {
    const args = concatRenderArgs();
    expect(args.slice(args.indexOf("-c"), args.indexOf("-c") + 2)).toEqual(["-c", "copy"]);
    expect(args).toContain("+faststart");
  });
});
