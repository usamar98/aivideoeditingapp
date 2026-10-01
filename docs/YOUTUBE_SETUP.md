# YouTube publishing setup

The implementation is at `/studio/social` (Studio → **Publish**). It connects one YouTube channel per ETA account, uploads completed ETA exports, and supports private, unlisted, public and scheduled publication. Facebook Pages have a separate setup in [FACEBOOK_SETUP.md](FACEBOOK_SETUP.md). Instagram, TikTok and X are not implemented.

## 1. Google Cloud

Use your separate **ETA YouTube Publishing** web-application OAuth client. Do not replace the Google sign-in client in Supabase.

- Enable **YouTube Data API v3** in the client's Google Cloud project.
- Add these **Authorized redirect URIs**, exactly:
  - Production: `https://www.editingapp.live/api/social/youtube/callback`
  - Local development: `http://localhost:3004/api/social/youtube/callback`
- JavaScript origins are not required for this server-side authorization flow. If you add them, use origins only (`https://www.editingapp.live`, `http://localhost:3004`), not callback paths.
- Under Google Auth Platform → **Data Access**, add `https://www.googleapis.com/auth/youtube.force-ssl`.
  - This scope supports uploading, reading channel/video status, and changing visibility to cancel schedules. `youtube.upload` alone cannot perform `videos.update`.
  - ETA does not use this broader permission for comments, subscriptions or unrelated channel content.
- Configure Branding with your homepage, `https://www.editingapp.live/privacy`, and `https://www.editingapp.live/terms`.
- During Testing, add the Google account that owns the test YouTube channel as a test user. Select the correct Google/Brand Account when connecting.
- Submit sensitive-scope verification through **Verification Center** before public rollout. Brand verification for Google sign-in does not by itself approve YouTube access. Testing refresh tokens for this scope may expire after seven days; reconnecting is expected during testing.

**Separate upload audit:** new/unverified YouTube API projects can be restricted to private uploads. Complete YouTube's API compliance audit before enabling public/unlisted publication and scheduling. Do not turn on the flag below as a workaround for Google's restriction.

References: [server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [upload restriction and audit link](https://developers.google.com/youtube/v3/docs/videos/insert), [visibility update scopes](https://developers.google.com/youtube/v3/docs/videos/update).

## 2. Server environment variables

Add these to **Vercel Production** and the **Trigger.dev Production** environment. They are all server-only, including the client ID. Never prefix them with `NEXT_PUBLIC_` or commit values.

```dotenv
YOUTUBE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_OAUTH_CLIENT_SECRET=your-google-client-secret
YOUTUBE_REDIRECT_URI=https://www.editingapp.live/api/social/youtube/callback
SOCIAL_TOKEN_ENCRYPTION_KEY=64-hex-characters
YOUTUBE_PUBLIC_PUBLISHING_ENABLED=false
```

Generate the encryption key once in your own terminal:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the **same key** to the web app and worker; store it securely. Do not paste it into chat. Changing this key without migrating encrypted data makes existing connections and upload checkpoints unreadable. For a fresh local database, use a separate local key; never point differently keyed workers at the same social tables.

The existing `NEXT_PUBLIC_SUPABASE_URL`, server-only `SUPABASE_SECRET_KEY`, and `TRIGGER_SECRET_KEY` are also required. Vercel and Trigger must refer to the same database and matching Trigger environment. Do not use a development Trigger key in production. No extra YouTube API key is needed: users authorize the OAuth client.

For local development, put the values in a Git-ignored environment file and use the localhost redirect URI. Set `NEXT_PUBLIC_DEMO_MODE=false` and sign into a real development ETA account. A fixture/demo account cannot connect or upload. Keep production credentials out of preview environments.

## 3. Supabase migration

Apply this **new migration only**, after the existing app migrations:

`supabase/migrations/20260926191045_youtube_publishing.sql`

Use Supabase's SQL Editor or your normal reviewed migration process. It creates three server-only tables (`social_connections`, `social_oauth_states`, `social_posts`) with RLS and service-role-only grants, plus trusted RPCs for authorization, queueing, leases and disconnecting. It does not change credits, plans, existing Google sign-in, or video generation tables. The standalone historical database setup file does not replace this new migration.

For development tests, the migration is executed in PGlite and its grants, duplicate protection and transitions are tested. That is not evidence that the migration has been applied to your hosted project.

## 4. Deploy both app and worker

Deploy the reviewed website changes and deploy the Trigger worker using the repository's pinned CLI:

```powershell
npx trigger.dev@4.6.4 deploy
```

Verify both tasks appear under **Production**:

- `youtube-publish` — resumable upload, processing/visibility check and cancellation.
- `youtube-publishing-recovery` — runs every five minutes in Production, dispatches pending work and removes expired/stale OAuth/API records.

In development, run `npm run dev -- --port 3004` and `npm run dev:trigger` separately. The recovery schedule is Production-only; use **Retry / refresh** on an upload card, or manually run the recovery task in the development dashboard to process follow-up status checks.

Redeploy after changing environment variables. Confirm the recovery schedule is active before allowing users to connect: it is also responsible for data-retention cleanup. Keep the public-publishing flag identical in both deployments. Set it to `true` only after approval and private end-to-end verification.

## 5. End-to-end acceptance test (requires your authorization)

1. Open `/studio/social`, accept the linked policies, then connect your own test channel. Check the channel shown before submitting anything.
2. Select a completed ETA video, review it, supply a title/description, audience, synthetic-content disclosure, and explicit upload consent. Choose **Private**.
3. Confirm it reaches **Private upload ready**, and verify the actual video in YouTube Studio. No paid AI generation is part of this upload workflow.
4. After approval, enable public publishing. Schedule a short video at least 30 minutes ahead. Verify its native YouTube schedule.
5. Cancel the schedule. Do not rely solely on “cancellation requested”: verify **Cancelled** and private/no schedule in YouTube Studio.
6. Disconnect and confirm ETA no longer shows the channel/upload history. Existing YouTube videos and any schedules not cancelled first remain on YouTube.

No real upload, production migration or worker deployment is performed by the local automated tests.

## Operational behavior and limits

- Only exports owned by the signed-in ETA user are accepted. Callers cannot submit arbitrary URLs or storage paths. The picker lists the newest 50 projects per tool; the queue shows the newest 100 records.
- Up to ten pending uploads per account; one leased worker per upload. A 200 MiB upload cap matches the short-video workflow. Larger files fail safely instead of loading into memory.
- Original MP4s stream to a temporary worker file and upload in 4 MiB chunks. The encrypted resumable session and offset are saved. A retry probes the existing session, including after a lost final response; an expired ambiguous session is not automatically replaced with a duplicate upload.
- Every upload begins private. Only a processed video receives the explicitly requested visibility/schedule. A schedule is held by YouTube, not an exact-time Trigger wake-up. A missed time before visibility is applied is reported for review instead of deliberately publishing late.
- Cancellation during a provider call may take time; after a race with publication the worker attempts to restore private visibility. Use YouTube Studio directly if publication is imminent. ETA never deletes an uploaded YouTube video.
- Disconnect waits for active worker leases to end, revokes the Google grant, then deletes connection and upload records. Recovery retries interrupted disconnects and removes locally stored data after six days even if Google cannot confirm revocation; users can revoke directly from their Google Account. It can remove pending queue records, but **does not cancel schedules already stored by YouTube**. Warn users before disconnecting. Google revocation can affect other grants under the same Cloud project; this is one reason to keep publishing and sign-in credentials distinct, and consider a separate Cloud project for stronger isolation.
- Expired/revoked access marks the connection for reconnection. Stale history and connections are removed after 29 days by the recovery task; inactive users may need to reconnect. Transient upload failures are retried for a bounded number of attempts, then marked Needs attention. Cancellation remains unconfirmed while its remote state cannot be verified.
- No ETA credits are consumed by publishing itself. Google quotas, Trigger compute and storage/network costs still apply to the operator. Do not shard requests across projects to evade YouTube quotas.
- Vertical/square exports can qualify as Shorts under YouTube's current rules; the API has no guaranteed “make this a Short” switch.

## Review before public rollout

The privacy and terms pages include YouTube-specific data handling, revocation, publication and cancellation disclosures. Have the operator/legal reviewer confirm they accurately describe your deployed service. See [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies). Approval is Google's decision, not guaranteed by this implementation.
