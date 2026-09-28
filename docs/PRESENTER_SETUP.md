# AI digital-clone presenter

This is an authorized-photo talking-presenter workflow, not a trained personal avatar or cloned voice. It uses VEED Fabric 1.0 through the existing fal account and ETA's existing ElevenLabs studio voice. No HeyGen account is needed.

## Deployment

1. Apply `supabase/migrations/20260928174504_digital_clone_presenter.sql` after the existing migrations. It adds private presenter/project tables, service-only billing RPCs and storage restrictions. Existing balances are unchanged.
2. Deploy the web application and Trigger worker. `src/trigger/pipelines.ts` exports `presenter-pipeline`. Do not enable production rendering with only the web deployment; the new task must be deployed too.
3. The worker needs `FAL_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Use a licensed stock studio voice, not an unconsented personal voice. The web app also needs its existing Supabase credentials and `TRIGGER_SECRET_KEY`. Keep secrets server-side.
4. The existing Trigger build installs FFmpeg and fonts. Local worker testing needs FFmpeg/ffprobe (or `FFMPEG_PATH` / `FFPROBE_PATH`). No new dependency is needed.
5. Visit `/studio/presenter`. Add your own adult portrait, confirm permission, save a reviewed English script, then confirm rendering. Test with an authorized photo and an explicitly approved paid generation. Check MP4/SRT, accurate refunds, Jobs cancellation and presenter revocation.

Preview UI without upload or billing: `/studio/presenter?preview=1`. Public feature route: `/features/ai-digital-clone-presenter`; it participates in the existing publication-aware sitemap and metadata system.

## Boundaries and charging

- JPG/PNG/WebP, maximum 8 MB; worker verifies image headers, decodability, minimum 256px each side and maximum 20 megapixels before paid work.
- Fabric 1.0 is server-allowlisted. Only 480p/720p and portrait/landscape exports are supported.
- Maximum duration 15 or 30 seconds; script limits 28/62 words. Actual TTS duration is checked before animation. A too-long script fails and refunds the reservation; create a shorter script rather than retrying unchanged text.
- Reserve 15 preparation credits plus 6/10 credits per selected maximum second. Settle against actual speech duration rounded up, with a full refund on failure/cancellation. Server and SQL tariffs must stay in sync. Reassess the tariff when provider pricing or subscription discounts change.
- Checkpoints save provider submission intent and request IDs before polling. An uncertain submission is not automatically repeated. Don't remove an intent checkpoint merely to force a retry without checking provider billing first.
- Original and generated assets are private. Provider links expire. Exports are permanently copied into ETA storage, not served from temporary provider URLs.
- Consent is a timestamped, versioned account attestation, **not identity matching or liveness verification**. An AI disclosure is burned into each export. Do not market this as verified identity or a trained voice/motion clone.
- Revocation serializes against render starts, requires active jobs to be cancelled/finished first, disables future renders, and removes the original uploaded portrait. Completed exports, derived processing artifacts and consent records remain for the account/deletion-support workflow. Previously issued signed links may remain usable until expiry. Broader retention/deletion remains governed by the app's privacy policy.
- This release provides downloads. It does not add presenter exports to the social publishing library or automatically publish them.

## Research references (checked September 28, 2026)

- [HeyGen digital twins](https://help.heygen.com/en/articles/12089286-create-your-first-digital-twin-video-avatar-with-avatar-iv): reusable recorded-video avatars with explicit consent.
- [Synthesia personal avatars](https://docs.synthesia.io/docs/personal-avatars): photo/video avatar workflows with consent verification.
- [Fabric API contract](https://fal.ai/models/veed/fabric-1.0/api): image URL + audio URL + resolution → MP4 video URL.

These products informed the portrait/script/review workflow. ETA does not claim their identity verification, voice cloning or trained-motion capabilities.
