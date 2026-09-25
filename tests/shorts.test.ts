import { describe, expect, it } from "vitest";
import { shortsDemo } from "@/lib/shorts/demo";
import { shortsUploadSchema, shortsBriefSchema, shortsPlanSchema, shortsSelectionSchema, SHORTS_MAX_BYTES, validateShortsPlan } from "@/lib/shorts/schema";
import { clipWords, framingCommands, safeCaption, shortsCaptions, shortsRenderArgs } from "../trigger/shorts-media";
import { parseShortsTranscript, parseShortsPlan, shortsPlannerRequest } from "../trigger/shorts-planner";
const analysis = shortsDemo.analysis!, plan = shortsDemo.plan!, clip = plan.clips[0];
const completion = (clips: unknown[]) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ clips }) } }] });

describe("Shorts inputs and editorial boundaries", () => {
  it("accepts only bounded video uploads and affirmative permission", () => {
    expect(shortsUploadSchema.safeParse({ mime: "video/mp4", size: SHORTS_MAX_BYTES }).success).toBe(true);
    for (const input of [{ mime: "audio/mp3", size: 100 }, { mime: "video/mp4", size: 0 }, { mime: "video/mp4", size: SHORTS_MAX_BYTES + 1 }]) expect(shortsUploadSchema.safeParse(input).success).toBe(false);
    expect(shortsBriefSchema.safeParse({ ...shortsDemo.brief, rightsConfirmed: false }).success).toBe(false);
  });
  it("rejects duplicate clips, selections and invalid duration or corrections", () => {
    expect(shortsSelectionSchema.safeParse(["clip-1", "clip-1"]).success).toBe(false);
    expect(shortsSelectionSchema.safeParse([]).success).toBe(false);
    expect(shortsPlanSchema.safeParse({ ...plan, clips: [clip, clip] }).success).toBe(false);
    for (const end of [10, 61, Infinity]) expect(shortsPlanSchema.safeParse({ ...plan, clips: [{ ...clip, end }] }).success).toBe(false);
    expect(() => validateShortsPlan({ ...plan, clips: [{ ...clip, start: 80, end: 100 }] }, analysis)).toThrow(/past/);
    expect(() => validateShortsPlan({ ...plan, captionEdits: { "99999": "wrong" } }, analysis)).toThrow(/caption/);
    expect(() => validateShortsPlan({ ...plan, speakerPositions: { unknown: .5 } }, analysis)).toThrow(/speaker/);
    expect(() => validateShortsPlan(plan, analysis)).not.toThrow();
  });
  it("parses timestamped words, clamps the tail and rejects speech-free files", () => {
    const words = parseShortsTranscript({ chunks: [
      { text: " tail ", timestamp: [29, 33], speaker: "B" }, { text: "start", timestamp: [0, 1], speaker: "A" },
      { text: "missing", timestamp: [null, null] }, { text: "bad", timestamp: [5, 4] }, { text: "outside", timestamp: [31, 32] },
    ] }, 30);
    expect(words).toEqual([{ text: "start", start: 0, end: 1, speaker: "A" }, { text: "tail", start: 29, end: 30, speaker: "B" }]);
    expect(() => parseShortsTranscript({ chunks: [] }, 30)).toThrow(/speech/);
  });
  it("requires real transcript indices and keeps original speech rather than invented audio", () => {
    const result = parseShortsPlan(completion([{ title: "A useful tip", reason: "A complete thought", startWord: 0, endWord: 30 }]), analysis, 3);
    expect(result.clips[0].start).toBe(analysis.words[0].start); expect(result.clips[0].end).toBe(analysis.words[30].end);
    expect(() => parseShortsPlan(completion([{ title: "Tip", reason: "Reason", startWord: 9000, endWord: 9999 }]), analysis, 3)).toThrow(/boundaries/);
    expect(() => parseShortsPlan(completion([{ title: "Tip", reason: "Reason", startWord: 0, endWord: 2 }]), analysis, 3)).toThrow();
    const request = shortsPlannerRequest(shortsDemo.brief, analysis);
    expect(request.messages[0].content).toContain("untrusted data"); expect(request.messages[0].content).toContain("negation");
    expect(JSON.parse(request.messages[1].content).words[0][0]).toBe(0);
  });
});
describe("Captions and speaker-assisted framing", () => {
  it("clips and rebases words without extending beyond the selected video", () => {
    expect(clipWords([{ start: 9, end: 11, text: "start", speaker: "A" }, { start: 29, end: 31, text: "end", speaker: "A" }], { start: 10, end: 30 })).toEqual([
      { start: 0, end: 1, text: "start", speaker: "A" }, { start: 19, end: 20, text: "end", speaker: "A" },
    ]);
  });
  it("removes caption markup and creates bounded animated word events and SRT", () => {
    expect(safeCaption("{\\pos(0,0)}<script>\nHello")).not.toMatch(/[{}<>\\\n]/);
    const captions = shortsCaptions(analysis.words, clip);
    expect(captions.srt).toContain("00:00:00,000 -->"); expect(captions.ass).toContain("PlayResY: 1280");
    expect(captions.ass).toContain("{\\c&H005CE7FF&}"); expect(captions.srt).not.toContain("Dialogue:");
    const overlap = shortsCaptions([{ start: 0, end: 2, text: "one", speaker: "A" }, { start: 0, end: 1, text: "two", speaker: "B" }], clip);
    expect(overlap.ass.match(/Dialogue:/g)).toHaveLength(1);
    expect(overlap.ass).not.toContain("0:00:00.00,0:00:00.00");
  });
  it("follows the mapped voice, not the largest unrelated face, and clamps crop positions", () => {
    const sample = [{ t: 0, faces: [{ x: .3, size: .1 }, { x: .8, size: .4 }] }];
    const left = framingCommands(sample, clip, analysis, plan);
    expect(left.found).toBe(1); expect(left.commands).toContain("crop@follow x");
    expect(left.commands).toEqual(framingCommands([{ t: 0, faces: [{ x: .3, size: .1 }] }], clip, analysis, plan).commands);
    const right = framingCommands(sample, { ...clip, center: .8 }, analysis, { ...plan, speakerPositions: { SPEAKER_00: .8 } });
    expect(Number(right.commands.split(" ").at(-1)!.replace(";", ""))).toBeGreaterThan(Number(left.commands.split(" ").at(-1)!.replace(";", "")));
    expect(framingCommands([{ t: 0, faces: [{ x: .99, size: .8 }] }], { ...clip, center: 0 }, analysis, { ...plan, speakerPositions: {} }).found).toBe(0);
    expect(framingCommands([{ t: 0, faces: [] }], { ...clip, center: 0 }, analysis, { ...plan, speakerPositions: {} }).commands).toBe("0.000 crop@follow x 0;");
  });
  it("uses fixed local media inputs, bounded codecs and each chosen framing/caption mode", () => {
    expect(shortsRenderArgs(clip).join(" ")).toContain("sendcmd=f=framing.txt");
    expect(shortsRenderArgs({ ...clip, framing: "manual", captions: "none" }).join(" ")).not.toContain("ass=captions.ass");
    expect(shortsRenderArgs({ ...clip, framing: "fit" }).join(" ")).toContain("boxblur");
    expect(shortsRenderArgs(clip)).toEqual(expect.arrayContaining(["file,pipe", "libx264", "aac", "+faststart", "yuv420p"]));
  });
});
