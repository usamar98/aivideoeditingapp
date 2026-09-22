# Faceless workflow research

Reviewed September 22, 2026 using official product descriptions (not signed-in paid-product tests).

| Example | Observed workflow | Applied to FrameFoundry |
| --- | --- | --- |
| [Invideo](https://invideo.io/make/ai-faceless-video-generator/) | Topic/prompt becomes a script with media, voiceover, and editing controls | Idea-first entry and a separate review step |
| [Fliki](https://fliki.ai/) | Text, stock/AI visuals, voiceover, and captions combine into faceless videos | Editable narration and image prompts per scene, language and format choices |
| [AutoShorts](https://autoshorts.ai/) | Faceless channel creation, scheduling, and posting | Clear creator-first entry; auto-posting deliberately excluded until separately implemented |

## Implemented scope

- An idea or an existing script; your existing script is split into scenes without an LLM rewrite.
- Gemini-generated storyboard, or user-written narration, persisted to a private project.
- Review title, narration, visual prompts, scene order; add/remove scenes; save before render.
- Landscape/vertical, approximately 30/60 seconds, cinematic/illustration/watercolor prompts, English/Spanish/French.
- fal FLUX Schnell still images, ElevenLabs narration/timing, FFmpeg MP4 assembly and optional burned captions.
- Checkpointed intermediate artifacts, saved job IDs, atomic credit reservation/refund, private signed downloads.

This is narrated AI still-image video, not generated moving footage. It does not include stock-footage search, background music, voice cloning, arbitrary voice selection, social publishing, URL ingestion, or automatic fact verification. Review factual claims and media rights before publishing. Illustrations and the demo storyboard are explicitly labelled and do not pretend to be provider-generated videos.

Provider references: [fal API](https://fal.ai/models/fal-ai/flux/schnell/api), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Stripe portal](https://docs.stripe.com/customer-management).
