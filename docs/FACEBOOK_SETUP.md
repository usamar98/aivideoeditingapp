# Facebook Page Reels — operator setup

Status (2026-10-01): prepared for the production web release; the hosted Facebook database migration and Trigger.dev worker are deployed. Meta app **Editing App** and the managed test Page already exist. Live connection and publishing remain gated on production credentials and the real acceptance test below. No real Facebook post is created by the automated tests. See [FACEBOOK_VERIFICATION.md](FACEBOOK_VERIFICATION.md) for the verified deployment boundaries.

Entry point: `/studio/social/facebook` (Studio → Publish → Facebook Pages).

## 1. Create the Page and Meta app

1. Create a Facebook Page you manage. The Facebook account used for testing must have permission to create Page content (full control also works).
2. Open the existing **Editing App** in [Meta for Developers → My Apps](https://developers.facebook.com/apps/). Do not create a duplicate app for this deployment. It uses the Page-management use case. Meta changes its setup screens; use its Facebook Login and Pages permissions, not an Instagram-only or ads-only integration.
3. Keep the app in **Development** initially. Add your real test account as an app administrator/developer/tester and accept any role invitation. That account must also manage the test Page. Standard access is for eligible app-role testing, not a public-customer rollout.
4. In app settings provide the real operator/business information requested by Meta, contact `support@editingapp.live`, domain `editingapp.live`, homepage `https://www.editingapp.live`, privacy `https://www.editingapp.live/privacy`, and terms `https://www.editingapp.live/terms`. Do not invent business details.
5. Enable the web/server OAuth login flow. Under Facebook Login settings add **Valid OAuth Redirect URIs** exactly as below. Enable web OAuth and strict redirect matching where shown. This implementation uses a user-access-token flow, not a system-user or app-access token. If Meta presents a different mandatory login configuration flow, share that screen (without secrets) before proceeding.

| Setting | Production URL |
| --- | --- |
| Valid OAuth redirect URI | `https://www.editingapp.live/api/social/facebook/callback` |
| Deauthorize callback | `https://www.editingapp.live/api/social/facebook/deauthorize` |
| User data deletion callback | `https://www.editingapp.live/api/social/facebook/deletion` |

For local login testing, also register `http://localhost:3004/api/social/facebook/callback` if allowed by the Meta app settings, and run ETA on that same port. Otherwise use an HTTPS staging domain with its own exact callback and staging credentials. A localhost callback is not a production webhook URL.

The deauthorization and deletion routes accept Meta's authenticated `signed_request` POST. The deletion response returns an opaque confirmation code and status URL. They must be publicly reachable after deployment; they are not URLs the user must open manually.

## 2. Request only these permissions

| Permission | ETA use |
| --- | --- |
| `pages_show_list` | Display eligible Pages so the user explicitly selects one. |
| `pages_read_engagement` | Read the selected Page's identity and Reel status. Required with Page publishing access. |
| `pages_manage_posts` | Upload and publish the video the user selected on that Page. |

ETA does not ask for Ads, Messenger, Instagram, personal-profile posting or comment-management access. Meta may include basic profile permission as part of login. No `publish_to_groups` or legacy `publish_actions` permission is used.

Before connecting ordinary customers, request the required **Advanced Access/App Review** for these permissions and complete business/access verification if the dashboard requires it. Follow the live app's access requirements and switch to Live only when approved and ready. Approval time is not guaranteed.

Prepare a real screen recording: sign into ETA → Facebook tab → consent → Meta authorization and Page access → explicit Page selection → select a completed vertical video → review caption and public-post consent → publish → show the resulting Reel on that Page → demonstrate scheduling/cancellation and disconnect. Use content you have rights to publish. Do not include App Secrets, tokens or other people's account details.

## 3. Server environment

Save the following in **Vercel Production and Trigger.dev Production**. Do not paste secrets into chat, commit them, or prefix them with `NEXT_PUBLIC_`.

```dotenv
FACEBOOK_APP_ID=your-numeric-app-id
FACEBOOK_APP_SECRET=your-meta-app-secret
FACEBOOK_GRAPH_VERSION=the-supported-version-shown-in-your-meta-app
FACEBOOK_REDIRECT_URI=https://www.editingapp.live/api/social/facebook/callback
FACEBOOK_PUBLISHING_ENABLED=false
```

`FACEBOOK_GRAPH_VERSION` must be an actual supported version in `vNN.0` form. It has no hard-coded default so an old tutorial cannot silently pick the production API version. Copy the version from your Meta dashboard and verify it in the live acceptance test.

Reuse the **existing** `SOCIAL_TOKEN_ENCRYPTION_KEY` from YouTube. It must match on Vercel and Trigger; changing it breaks existing encrypted connections. Existing `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` and production `TRIGGER_SECRET_KEY` are also required. The worker and website must target the same database and Trigger environment. No new AI-provider key is required.

Only after installation, turn `FACEBOOK_PUBLISHING_ENABLED=true` in both environments for your eligible app-role Page test. This flag is an operator safety switch, not a substitute for Meta approval. Keep customer access restricted by Meta Development mode until review is complete. Redeploy after changing environment settings.

## 4. Database and worker deployment

New migration: `supabase/migrations/20260927110254_facebook_publishing.sql`.

It creates separate `facebook_connections`, `facebook_oauth_states`, `facebook_posts` and `facebook_deletions` tables and service-only transactional functions. All tables have RLS and no browser-role grants. Existing YouTube data and source videos are unchanged.

The migration passed local PostgreSQL-engine tests and was applied on 2026-10-01 to project `xpvuxuwzztqxzocfquxq`. Hosted migration history records it as `20261001161531_facebook_publishing` (the deployment tool assigns the hosted timestamp). Do not apply the local file again or push unrelated historical migrations. Backend-only grants and RLS were verified after application. Trigger.dev production version `20261001.1` was deployed to `proj_buramjqzkflsxgozeeew`; verify these tasks remain present after future releases:

- `facebook-publish`
- `facebook-publishing-recovery` — every minute, production only; also cleans expired grants/deletion receipts.

The recovery task is essential: scheduling is held in ETA's database, not a native Facebook schedule. No paid Meta ad campaign is created. No ETA generation credits are deducted for publishing.

## 5. Acceptance test (requires explicit permission to post publicly)

1. Sign into a real ETA account, open Facebook Pages and authorize the three permissions. Select the intended Page. Confirm no publishing happens merely by connecting.
2. Use a harmless completed ETA export: 9:16 H.264 MP4, 4–60 seconds, minimum 540×960, 23–60 fps, up to 200 MiB, AAC audio if present. These are ETA's conservative initial acceptance limits, not a claim about every format Facebook supports.
3. Review the video, title/caption, AI disclosure and public-post authorization, then click **Publish public Facebook Reel**. Confirm the worker's remote ID matches the resulting Page Reel and status becomes Published.
4. Schedule another eligible export at least 15 minutes ahead; cancel it before the publication boundary and verify no Reel is published. For a real schedule test, keep the worker online and check the UTC time.
5. Disconnect and verify the local Page/token/history data is removed. Existing published Reels remain on Facebook. Remove any test Reel manually in Meta Business Suite.
6. Test the real Meta deauthorization/deletion flow from the same test account. Never forge an approval claim or submit a fixture demo as evidence of a real API call.

## Behavior and limits

- One Page per ETA account, explicitly selected; reconnect the same Page. Disconnect first to change Page/account.
- Public Page Reels only. No personal profiles, feed-photo/text posts, landscape/long-form uploads, private uploads or Instagram publishing in this version. No automatic crop/transcode.
- ETA begins uploading at the scheduled time; worker capacity and Facebook processing can delay visibility. Before publication, a schedule over 15 minutes late pauses for attention. Once Facebook has accepted a publication request, processing may still take longer; ETA cannot recall that request.
- Cancel is atomic before ETA records publication intent. After that point, manage visibility/removal in Meta Business Suite. A lost finish response is reconciled against the same Reel ID, never automatically resubmitted; uncertainty is shown honestly rather than risking a duplicate.
- A selected export cannot be posted twice through the same connection unless the previous job was cancelled before publication. For a failed/uncertain finished request, inspect Facebook manually; ETA intentionally offers status reconciliation, not a one-click duplicate.
- Source ownership is checked on submission and before media transfer. A one-hour signed link lets Meta fetch only the chosen private export. Videos stream to a bounded temporary file for validation and are not loaded entirely into worker memory.
- User/Page tokens and pending Page selection are encrypted with context-bound AES-GCM. Credentials are not returned to the browser. Pending authorization expires after ten minutes. Saved connection/post records remain until disconnect/deletion/account removal; unresolved post history prevents duplicate publication.
- Disconnect deletes local Facebook credentials/history even if remote revocation is unavailable and tells the user to remove ETA in Facebook Business Integrations. An interrupted disconnect can be retried; an active worker must stop first. Signed Meta deletion/deauthorization removes matching Facebook connections and post records without deleting ETA source projects, billing data or YouTube connections. Opaque deletion receipts expire after 30 days.
- The AI option appends an explicit caption disclosure; it does **not** set Meta's native AI-label field. Users must apply any additional required native disclosure in Meta's tools. Don't describe this as automatic full Meta policy compliance.
- No credentials were available during local implementation, so live OAuth, app review, real Page upload and schedule timing still require the acceptance test above.

## References

- [Meta's official Facebook API/Reels collection](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)
- [Meta permissions reference](https://developers.facebook.com/docs/permissions/)
- [Facebook Login manual flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)
- [Meta data deletion callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/)
- [App Review](https://developers.facebook.com/docs/app-review/)

Meta documentation endpoints were rate-limited during development; the accessible Meta-owned Postman collection was used to check the Reels request sequence. Dashboard labels, supported API versions and review requirements must be confirmed in your actual app before activation.
