import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { storyboardResponseSchema } from "@/lib/editor/schemas";

export async function generateStructuredStoryboard(input: {
  idea: string;
  seriesGuide: string;
  characterSummary: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini is unavailable: GEMINI_API_KEY is not configured.");

  const client = new GoogleGenAI({ apiKey });
  const schema = z.toJSONSchema(storyboardResponseSchema, { target: "draft-7" });
  const response = await client.interactions.create({
    model: "gemini-3.8-flash",
    input: [
      `Episode idea: ${input.idea}`,
      `Series guide: ${input.seriesGuide}`,
      `Approved characters: ${input.characterSummary}`,
      "Create a 30–60 second narrated episode. Use 3–10 scenes, keep each scene between 3 and 15 seconds, and make their durations total 30–60 seconds. Use only the approved character names and preserve the series continuity facts.",
    ].join("\n\n"),
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema,
    },
    store: false,
  });

  if (!response.output_text) throw new Error("Gemini returned no storyboard content.");
  return storyboardResponseSchema.parse(JSON.parse(response.output_text));
}
