import "server-only";

import { z } from "zod";

const timingResponseSchema = z.object({
  audio_base64: z.string(),
  alignment: z
    .object({
      characters: z.array(z.string()),
      character_start_times_seconds: z.array(z.number()),
      character_end_times_seconds: z.array(z.number()),
    })
    .nullable()
    .optional(),
  normalized_alignment: z
    .object({
      characters: z.array(z.string()),
      character_start_times_seconds: z.array(z.number()),
      character_end_times_seconds: z.array(z.number()),
    })
    .nullable()
    .optional(),
});

export async function createSpeechWithTiming(input: {
  voiceId: string;
  text: string;
  languageCode?: string;
}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ElevenLabs is unavailable: ELEVENLABS_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text: input.text,
        model_id: "eleven_multilingual_v2",
        language_code: input.languageCode,
        apply_text_normalization: "auto",
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!response.ok) throw new Error(`ElevenLabs request failed with ${response.status}.`);
  return timingResponseSchema.parse(await response.json());
}
