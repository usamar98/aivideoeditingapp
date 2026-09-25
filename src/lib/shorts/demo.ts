import type { ShortsProjectView } from "./schema";
const text = "A useful clip starts with a complete idea. Give your audience enough context to understand the question before you share the answer. One practical example usually works better than a long list. Keep the original speaker meaning intact. Before publishing watch the entire clip and read the captions aloud. Correct any names and check that the framing follows the person you want viewers to see. A good ending leaves people with something they can actually try today.";
export const shortsDemo: ShortsProjectView = {
  id: "demo", title: "One conversation. Several useful moments.", status: "ready", revision: 0,
  brief: { title: "Sample podcast", sourceAssetId: "00000000-0000-4000-8000-000000000001", context: "Practical advice for creators", language: "en", targetSeconds: 30, clipCount: 3, rightsConfirmed: true },
  analysis: { duration: 90, width: 1920, height: 1080, words: text.split(" ").map((word, i) => ({ start: i * .8, end: i * .8 + .7, text: word, speaker: i < 38 ? "SPEAKER_00" : "SPEAKER_01" })) },
  plan: { captionEdits: {}, speakerPositions: { SPEAKER_00: .3, SPEAKER_01: .7 }, clips: [
    { id: "clip-1", title: "Start with a complete idea", reason: "A practical introduction with a clear takeaway.", start: 0, end: 30, framing: "follow", center: .3, captions: "highlight" },
    { id: "clip-2", title: "Your pre-publishing checklist", reason: "A self-contained checklist for reviewing a short.", start: 30, end: 60, framing: "fit", center: .5, captions: "clean" },
  ] }, sourceUrl: null, error: null, outputs: [], job: null,
};
