# Facebook Page Reels — operator setup

Migration note (2026-10-15): the owner provided Meta screenshots showing the existing app's Page permissions approved and the app Published. Keep that same app and approvals. Follow [DOMAIN_MIGRATION.md](DOMAIN_MIGRATION.md) to rename its display branding and move callbacks to createaivideos.app; do not repeat initial Development-mode setup for this already-approved app. The initial setup instructions below remain a reference for a new installation. Automated tests do not create real Facebook posts or verify external dashboard edits. Earlier deployment evidence is in [FACEBOOK_VERIFICATION.md](FACEBOOK_VERIFICATION.md).

Entry point: `/studio/social/facebook` (Studio → Publish → Facebook Pages).

## 1. Create the Page and Meta app

1. Create a Facebook Page you manage. The Facebook account used for testing must have permission to create Page content (full control also works).
2. Open the existing **Create AI Videos** in [Meta for Developers → My Apps](https://developers.facebook.com/apps/). Do not create a duplicate app for this deployment. It uses the Page-management use case. Meta changes its setup screens; use its Facebook Login and Pages permissions, not an Instagram-only or ads-only integration.
3. Keep the app in **Development** initially. Add your real test account as an app administrator/developer/tester and accept any role invitation. That account must also manage the test Page. Standard access is for eligible app-role testing, not a public-customer rollout.
4. In app settings provide the real operator/business information requested by Meta, contact `support@createaivideos.app`, domain `createaivideos.app`, homepage `https://createaivideos.app`, privacy `https://createaivideos.app/privacy`, and terms `https://createaivideos.app/terms`. Do not invent business details.
5. Enable the web/server OAuth login flow. Under Facebook Login settings add **Valid OAuth Redirect URIs** exactly as below. Enable web OAuth and strict redirect matching where shown. This implementation uses a user-access-token flow, not a system-user or app-access token. If Meta presents a different mandatory login configuration flow, share that screen (without secrets) before proceeding.

| Setting | Production URL |
| --- | --- |
| Valid OAuth redirect URI | `https://createaivideos.app/api/social/facebook/callback` |
| Deauthorize callback | `https://createaivideos.app/api/social/facebook/deauthorize` |
| User data deletion callback | `https://createaivideos.app/api/social/facebook/deletion` |

For local login testing, also register `http://localhost:3004/api/social/facebook/callback` if allowed by the Meta app settings, and run Create AI Videos on that same port. Otherwise use an HTTPS staging domain with its own exact callback and staging credentials. A localhost callback is not a production webhook URL.

The deauthorization and deletion routes accept Meta's authenticated `signed_request` POST. The deletion response returns an opaque confirmation code and status URL. They must be publicly reachable after deployment; they are not URLs the user must open manually.

## 2. Request only these permissions

| Permission | Create AI Videos use |
| --- | --- |
| `pages_show_list` | Display eligible Pages so the user explicitly selects one. |
| `pages_read_engagement` | Read the selected Page's identity and Reel status. Required with Page publishing access. |
| `pages_manage_posts` | Upload and publish the video the user selected on that Page. |

Create AI Videos does not ask for Ads, Messenger, Instagram, personal-profile posting or comment-management access. Meta may include basic profile permission as part of login. No `publish_to_groups` or legacy `publish_actions` permission is used.

Before connecting ordinary customers, request the required **Advanced Access/App Review** for these permissions and complete business/access verification if the dashboard requires it. Follow the live app's access requirements and switch to Live only when approved and ready. Approval time is not guaranteed.

Prepare a real screen recording: sign into Create AI Videos → Facebook tab → consent → Meta authorization and Page access → explicit Page selection → select a completed vertical video → review caption and public-post consent → publish → show the resulting Reel on that Page → demonstrate scheduling/cancellation and disconnect. Use content you have rights to publish. Do not include App Secrets, tokens or other people's account details.

## 3. Server environment

Save the following in **Vercel Production and Trigger.dev Production**. Do not paste secrets into chat, commit them, or prefix them with `NEXT_PUBLIC_`.

```dotenv
FACEBOOK_APP_ID=your-numeric-app-id
FACEBOOK_APP_SECRET=your-meta-app-secret
FACEBOOK_GRAPH_VERSION=the-supported-version-shown-in-your-meta-app
FACEBOOK_REDIRECT_URI=https://createaivideos.app/api/social/facebook/callback
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

The recovery task is essential: scheduling is held in Create AI Videos’ database, not a native Facebook schedule. No paid Meta ad campaign is created. No Create AI Videos generation credits are deducted for publishing.

## 5. Acceptance test (requires explicit permission to post publicly)

1. Sign into a real Create AI Videos account, open Facebook Pages and authorize the three permissions. Select the intended Page. Confirm no publishing happens merely by connecting.
2. Use a harmless completed Create AI Videos export: 9:16 H.264 MP4, 4–60 seconds, minimum 540×960, 23–60 fps, up to 200 MiB, AAC audio if present. These are Create AI Videos’ conservative initial acceptance limits, not a claim about every format Facebook supports.
3. Review the video, title/caption, AI disclosure and public-post authorization, then click **Publish public Facebook Reel**. Confirm the worker's remote ID matches the resulting Page Reel and status becomes Published.
4. Schedule another eligible export at least 15 minutes ahead; cancel it before the publication boundary and verify no Reel is published. For a real schedule test, keep the worker online and check the UTC time.
5. Disconnect and verify the local Page/token/history data is removed. Existing published Reels remain on Facebook. Remove any test Reel manually in Meta Business Suite.
6. Test the real Meta deauthorization/deletion flow from the same test account. Never forge an approval claim or submit a fixture demo as evidence of a real API call.

## Behavior and limits

- One Page per Create AI Videos account, explicitly selected; reconnect the same Page. Disconnect first to change Page/account.
- Public Page Reels only. No personal profiles, feed-photo/text posts, landscape/long-form uploads, private uploads or Instagram publishing in this version. No automatic crop/transcode.
- Create AI Videos begins uploading at the scheduled time; worker capacity and Facebook processing can delay visibility. Before publication, a schedule over 15 minutes late pauses for attention. Once Facebook has accepted a publication request, processing may still take longer; Create AI Videos cannot recall that request.
- Cancel is atomic before Create AI Videos records publication intent. After that point, manage visibility/removal in Meta Business Suite. A lost finish response is reconciled against the same Reel ID, never automatically resubmitted; uncertainty is shown honestly rather than risking a duplicate.
- A selected export cannot be posted twice through the same connection unless the previous job was cancelled before publication. For a failed/uncertain finished request, inspect Facebook manually; Create AI Videos intentionally offers status reconciliation, not a one-click duplicate.
- Source ownership is checked on submission and before media transfer. A one-hour signed link lets Meta fetch only the chosen private export. Videos stream to a bounded temporary file for validation and are not loaded entirely into worker memory.
- User/Page tokens and pending Page selection are encrypted with context-bound AES-GCM. Credentials are not returned to the browser. Pending authorization expires after ten minutes. Saved connection/post records remain until disconnect/deletion/account removal; unresolved post history prevents duplicate publication.
- Disconnect deletes local Facebook credentials/history even if remote revocation is unavailable and tells the user to remove Create AI Videos in Facebook Business Integrations. An interrupted disconnect can be retried; an active worker must stop first. Signed Meta deletion/deauthorization removes matching Facebook connections and post records without deleting Create AI Videos source projects, billing data or YouTube connections. Opaque deletion receipts expire after 30 days.
- The AI option appends an explicit caption disclosure; it does **not** set Meta's native AI-label field. Users must apply any additional required native disclosure in Meta's tools. Don't describe this as automatic full Meta policy compliance.
- No credentials were available during local implementation, so live OAuth, app review, real Page upload and schedule timing still require the acceptance test above.

## Diagnosing Page connection failures

The OAuth callback writes one structured `facebook.oauth` result per attempt to the server logs. Failed attempts show an opaque **Support reference** in the Facebook dashboard; search that reference in Vercel Production logs for `/api/social/facebook/callback`. Do not ask users for access tokens, App Secrets, authorization codes or full callback URLs.

- `permissions_missing`: one or more of the three requested permissions was not granted. The log contains only fixed scope names and normalized statuses.
- `pages_not_returned`: `/me/accounts` returned zero Pages across the completed pagination. A Page appearing in Meta's consent picker does not prove the API returned it. Investigate Page discovery/access before changing permissions.
- `page_content_access_missing`: the API returned Pages, but none had a currently recognized content-publishing task. Check `returnedPages`, `eligiblePages`, `pagesWithoutTasks`, the fixed-label `taskCounts` and `unrecognizedTasks`. Unknown roles remain ineligible; do not weaken authorization to make this error disappear.
- `connection_failed`: the `stage` identifies whether state validation, authentication, token exchange, Page discovery or saving the pending grant failed. Raw provider errors are intentionally not logged.
- `choose_page`: discovery succeeded and an encrypted pending grant was saved. Connecting still does not publish anything.

Diagnostics contain no account/Page IDs or names, emails, tokens, OAuth codes/state, raw task values, request URLs or provider error payloads. They are operational logs, not a new database table or a browser-readable debug endpoint. Counts are aggregated across the authorized Pages, not stored with the pending grant. The existing publishing task allowlist, scopes, encryption, state expiry and one-time consumption are unchanged. No environment variable, migration or worker deployment is needed for this diagnostic-only change. Confirm the production deployment is Ready before asking the affected user to retry once and share only the displayed message/reference.

### Empty-list Page-specific inspection

When `/me/accounts` completes successfully with zero Pages, the server additionally inspects that same user token with Meta's `/debug_token` endpoint, using the existing server-side app credentials. Working Page connections and task-filtered (nonempty) results do not make these extra calls. This is diagnostic only; it does not repair a grant or make a Page publishable.

The `pageGrants` summary checks token validity, app/user identity, expiry and the three scopes, then records each scope's target selection as `selected`, `all` or `unknown` plus a count. A present granular scope without `target_ids` means all; an absent or duplicate scope is treated as unknown, and an explicit empty array remains empty. `commonTargets` counts the intersection of explicit targets permitted by all three scopes. An all-Pages grant does not provide IDs to enumerate.

At most five common target IDs receive parallel, read-only `GET /{page-id}?fields=id` probes. A matching identity increments `readableTargets`; an API denial increments `rejectedTargets`; transport failures, malformed responses and identity mismatches increment `unavailableTargets`. `truncated` means more targets existed than the bounded probe inspected. The token inspection and each probe have a ten-second timeout. No Page tokens are fetched by these probes, no provider IDs are logged or persisted, and no posts are created.

Interpret results carefully:

- A verified explicit empty/disjoint selection suggests the permissions did not authorize the same Page. Review the user's Page selection and business asset assignment.
- Common targets with readable identities but an empty accounts edge isolate a Page-listing/discovery discrepancy. A readable Page ID is **not** evidence of a publishing task; publishing remains blocked.
- Rejected probes indicate that Meta did not permit that identity read. Review Page restrictions, Page/business access and business-required two-factor authentication; do not assume one cause from a count alone.
- `invalid`, `malformed`, `unavailable` or unknown selection is inconclusive. Optional inspection never replaces the original empty-list outcome with a fabricated success or a different provider error.

The current implementation deliberately does not query business inventories or blindly substitute `/me/assigned_pages`: Meta documents that edge for a business-scoped user, whereas this app uses an ordinary user-token login. Do not add `business_management`, change token type, invent a business/user ID, loosen content-task checks or ask customers to paste tokens as a workaround. A separate business integration would require a supported design and explicit approval for any expanded permissions.

Reference checked against Meta's v26.0 documentation on 2026-10-16: [token inspection](https://developers.facebook.com/docs/graph-api/reference/debug_token/), [user accounts](https://developers.facebook.com/docs/graph-api/reference/user/accounts/), [business-scoped assigned Pages](https://developers.facebook.com/docs/graph-api/reference/user/assigned_pages/) and [Page identity fields](https://developers.facebook.com/docs/graph-api/reference/page/). The runtime still uses the operator-configured supported API version, not a new hard-coded version.

## References

- [Meta's official Facebook API/Reels collection](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)
- [Meta permissions reference](https://developers.facebook.com/docs/permissions/)
- [Facebook Login manual flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)
- [Meta data deletion callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/)
- [App Review](https://developers.facebook.com/docs/app-review/)

Meta documentation endpoints were rate-limited during development; the accessible Meta-owned Postman collection was used to check the Reels request sequence. Dashboard labels, supported API versions and review requirements must be confirmed in your actual app before activation.
