# TikTok setup — Create AI Videos

This integration adds `/studio/social/tiktok` alongside YouTube and Facebook. It supports account connection, private testing, Direct Post, creator-specific privacy and interactions, editable captions, AI/commercial disclosures, application-managed scheduling and status reconciliation. It does not change the existing YouTube/Facebook integrations or spend generation credits.

Code is not TikTok approval. You still need your developer app, domain verification, local migration release and deployed workers. Never send client secrets, access tokens or refresh tokens in chat or commit them.

## 1. Create your developer app

1. Sign in at [TikTok for Developers](https://developers.tiktok.com/), open Manage apps and create an app for **Create AI Videos**. Supply the real website, recognizable logo, privacy policy and terms. Describe this as a public creator tool for original videos, not an internal bulk uploader or copier of other platforms' content.
2. Add **Login Kit**, configure its **Web** platform, and add **Content Posting API → Direct Post**. Request `user.info.basic` and `video.publish`; this implementation does not request `video.upload` or use the inbox/draft flow.
3. Register this exact HTTPS redirect URL (no wildcard, query or fragment):

   `https://createaivideos.app/api/social/tiktok/callback`

4. Website: `https://createaivideos.app/`
   Privacy: `https://createaivideos.app/privacy`
   Terms: `https://createaivideos.app/terms`
5. In **Manage URL properties**, verify ownership of `createaivideos.app`, or the HTTPS URL prefix `https://createaivideos.app/api/social/tiktok/media/` if the portal offers prefix verification. Complete TikTok's displayed DNS/file verification challenge exactly. Do not invent a verification file. Verify the same origin used by `TIKTOK_REDIRECT_URI`; do not redirect media downloads to another host.
6. Configure the portal's permitted test users for the selected app environment. Keep sandbox and production credentials/settings matched; register a separate HTTPS preview origin/callback if testing a separate environment. Plain localhost HTTP is intentionally not accepted by this integration.

## 2. Add server-only configuration

Set these in both the website server (Vercel Production, or the intended testing environment) and the matching Trigger.dev environment. Use the app's client key/secret from its developer settings:

```dotenv
TIKTOK_CLIENT_KEY=<your-client-key>
TIKTOK_CLIENT_SECRET=<your-client-secret>
TIKTOK_REDIRECT_URI=https://createaivideos.app/api/social/tiktok/callback
TIKTOK_PUBLISHING_ENABLED=false
TIKTOK_PUBLIC_POSTING_ENABLED=false
```

Keep the existing `SOCIAL_TOKEN_ENCRYPTION_KEY` unchanged. It must be 32 random bytes encoded as 64 hex characters and match across Vercel/Trigger. Rotating it without a credential migration breaks existing social connections. Never add `NEXT_PUBLIC_` to TikTok secrets.

The existing `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `TRIGGER_SECRET_KEY` are also required. Trigger needs its existing FFprobe/FFmpeg runtime. Keep demo mode disabled for real account testing. Environment changes require a new website deployment and matching worker deployment.

## 3. Release database and workers

Review and apply `supabase/migrations/20261026210910_tiktok_publishing.sql` through the normal database release process. It creates three isolated RLS-enabled, service-only tables and invoker functions; browser roles cannot read credentials or call queue functions. Do not apply unrelated pending migrations blindly.

Deploy Trigger.dev from this repo using its existing project configuration. Task discovery is through `src/trigger/tiktok.ts`, exporting `tiktok-publish` and `tiktok-publishing-recovery`. The recovery task runs every minute in PRODUCTION; a local dev worker needs to be running for immediate development tasks. Verify the deployed tasks and their environment variables before enabling publishing. Deploy the matching website code. This file is a release checklist, not confirmation that a hosted migration or deployment occurred.

## 4. Private acceptance test

1. Keep `TIKTOK_PUBLIC_POSTING_ENABLED=false`. Set the testing creator's **TikTok account to private**; unaudited Direct Post requires private accounts, not just private video visibility. TikTok limits unaudited clients to five posting users in a 24-hour window. App review/product access may still be required in your selected environment.
2. Verify the media domain, then set `TIKTOK_PUBLISHING_ENABLED=true` in the matching website and worker environments and redeploy both.
3. Open `https://createaivideos.app/studio/social/tiktok`, accept the connection policy, and authorize profile + video publishing. The callback verifies state, identity, requested scopes and creator access. Tokens remain encrypted on the server and refresh-token rotation is serialized.
4. Select one owned, completed, original video: 9:16 H.264 MP4, 3–60 seconds, at least 540×960, 23–60 fps, up to 200 MiB, AAC audio if present. The creator-specific duration limit can be lower. The worker validates the actual export before sending.
5. Load and watch the preview. Enter/edit the caption; manually choose **Only me** (privacy has no default). Comments, Duet and Stitch start off; settings disabled by TikTok stay disabled. Explicitly choose AI disclosure, applicable commercial disclosures, rights consent and music confirmation. Paid partnership cannot use Only me, so it is not available in unaudited private tests. Never change visibility silently to make a post pass.
6. Press Publish only when you authorize this private test. Follow processing until Published, then verify the video and privacy inside TikTok. A private successful post may have no public link; this is expected. Processing can take minutes. Also test a future schedule, cancel before sending starts, and disconnect. Do not test public posting or real customer accounts without proper approval.

The worker uses **PULL_FROM_URL**, as TikTok requires for server-stored media. A two-hour random-ticket capability on the verified app origin streams exactly the owned export; only its hash is stored. It supports byte ranges and does not expose a public storage bucket. No video bytes pass through a server action. Make sure hosting/firewall/protection rules allow TikTok to fetch a valid ticket URL without a login challenge or redirect. Large streaming responses can incur hosting bandwidth costs; validate the deployed media flow in the private test. Do not paste capability URLs into tickets or chat.

## 5. Audit and public launch

Record an end-to-end screencast showing the real account connection, creator nickname, owned video preview, editable caption, manually chosen privacy, disabled creator interactions, off-by-default interactions/commercial toggle, AI and commercial disclosures, music/branded-policy consent, explicit Publish, processing and final TikTok result. Demonstrate that Only me is incompatible with Paid partnership, schedules are app-managed, and users can disconnect. Submit the materials TikTok requests through its current review/audit flow.

Only after TikTok approves the necessary app products/scopes **and Direct Post audit**, set `TIKTOK_PUBLIC_POSTING_ENABLED=true` in both environments and redeploy. This flag does not bypass TikTok restrictions or guarantee approval. Public privacy choices still come from the live creator-info API. TikTok imposes creator/posting caps and moderation even after audit.

## Recovery and removal

- Fixed-label `tiktok.oauth` logs contain a random support reference, outcome and stage, not tokens, callback parameters or profile details. Never share full request URLs/query strings from hosting logs: OAuth codes and media tickets are sensitive.
- Enqueue is idempotent by user/request ID, and the same active export is deduplicated per connection. A durable publication-intent checkpoint is written **before** the non-idempotent init call. If its response/ID is lost, the app stops and asks you to check TikTok; it never blindly sends another copy. A known publish ID is only polled.
- Check status retries preparation safely before init, or reconciles a known existing request after init. For an uncertain init with no saved ID, check TikTok directly. Do not delete queue records to force a retry.
- Cancellation is only available before init intent. Sending/posted content must be managed in TikTok; disconnect cannot recall it. Disconnect revokes access where possible and deletes local connection, encrypted tokens and queue through cascading deletion; source videos and other platforms are untouched. If local removal is interrupted, retry Disconnect. If remote revocation is not confirmed, remove the app in TikTok's app permissions too.
- Provider-detected revoked/expired permissions require reconnection. This release polls post status; it does not claim to receive TikTok deauthorization webhooks. Unresolved queue history remains until disconnect/account deletion/support removal to protect against duplicates. OAuth states expire after ten minutes; expired states/media tickets are cleaned by recovery.

## Official references

- [Login Kit for Web](https://developers.tiktok.com/docs/en/login-kit-web)
- [Token management and revocation](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)
- [Content sharing requirements and unaudited restrictions](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
- [Query creator info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info)
- [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)
- [Media transfer and domain verification](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
- [Post status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status)
