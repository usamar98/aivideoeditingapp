# Google sign-up and sign-in

ETA's `/login` page has **Continue with Google** in both authentication modes.
Supabase handles Google OAuth and PKCE; `/auth/callback` exchanges the one-use code,
establishes the session cookie, calls the existing `api.ensure_personal_workspace`
function, and redirects to a validated same-site destination. The same button
creates a new account or signs into an existing account. Email/password remains available.

This is authentication only. It does not grant YouTube publishing access, request
offline Google access, store Google provider tokens in app tables, or run a Trigger task.
No new database migration, Google API key, service account, or dependency is needed.

## 1. Google Cloud: create an OAuth client (not an API key)

1. Open <https://console.cloud.google.com/auth/overview> and select/create a project.
2. Configure **Branding** with ETA, its logo, `https://www.editingapp.live`, the actual
   public privacy/terms URLs below, and an eligible support email offered by Google.
   Use `support@editingapp.live` on the website. Complete domain/brand verification
   if requested; do not invent legal-page URLs that have not been published.
   After deploying these pages, use:
   - Privacy Policy: `https://www.editingapp.live/privacy`
   - Terms of Service: `https://www.editingapp.live/terms`
   Both pages are public without sign-in and linked in the homepage footer and
   account form. Verify they return HTTP 200 on production before submitting.
3. Set **Audience → External**. While Testing, add your own Google account as a test
   user. Publish the consent configuration for public launch and complete any
   verification Google requests. Never ask customers to bypass warnings.
4. In **Data Access**, configure only `openid`,
   `https://www.googleapis.com/auth/userinfo.email`, and
   `https://www.googleapis.com/auth/userinfo.profile`. No Gmail, Drive, or YouTube scopes.
5. Open **Clients → Create client → Web application**. Name it `ETA Google Login`.
6. Authorized JavaScript origins:
   - `https://www.editingapp.live`
   - `http://localhost:3001` for local Next.js testing (prefer separate development credentials).
7. Authorized redirect URI: copy the **Callback URL (for OAuth)** shown in your
   Supabase project's **Authentication → Sign In / Providers → Google** settings.
   For a normal hosted project it is:

   ```text
   https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback
   ```

   Use the dashboard's exact value, especially with a custom auth domain. Do NOT
   enter ETA's `/auth/callback` or `/api/social/youtube/callback` here. Running
   Next.js locally against hosted Supabase still uses the hosted callback above.
8. Create the client and securely save its **Client ID** and **Client secret**.

## 2. Supabase: enable Google

1. Open **Authentication → Sign In / Providers → Google** (the label may be Providers).
2. Enable Google, paste the Google Client ID and Client secret, and save.
3. Leave nonce validation enabled and do not enable accepting users without email.
4. Keep new-user signups enabled if new creators should be able to register.
5. Under **Authentication → URL Configuration**, set:

   ```text
   Site URL: https://www.editingapp.live
   ```

6. Add these Redirect URLs. The scoped wildcard covers `next`, `provider`, and any
   SDK-added `sb_flow_id` query parameters; it does not allow arbitrary hosts:

   ```text
   https://www.editingapp.live/auth/callback
   https://www.editingapp.live/auth/callback?**
   http://localhost:3001/auth/callback
   http://localhost:3001/auth/callback?**
   ```

   Add another exact origin only if it really serves your app. Do not broadly
   allow every Vercel preview hostname. Prefer a separate project for testing.

The two redirects are different:

```text
ETA → Supabase → Google → Supabase /auth/v1/callback → ETA /auth/callback → Studio
```

## 3. Vercel

Keep the existing production settings:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_SUPABASE_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_EXISTING_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=https://www.editingapp.live
NEXT_PUBLIC_DEMO_MODE=false
```

The Google Client ID/secret belong in **Supabase provider settings**, not in new
Vercel variables or any `NEXT_PUBLIC_` secret. Deploy the updated website code.
No Trigger.dev deployment or additional worker variables are needed for login.

## 4. Verify after configuration

- In a fresh browser session, open `/login?next=/studio/jobs`, click **Create account**,
  and choose **Continue with Google**. No email/password fields need filling.
- Authorize your test Google account yourself. Confirm that ETA opens Jobs,
  the session persists on refresh, and the correct account/workspace appears.
- Sign out and repeat with **Sign in**. Confirm the same workspace is reused.
- Cancel the Google screen and confirm ETA shows a recoverable message.
- Test email/password sign-in and email confirmation too.
- In Supabase, verify the new user's Google identity and one owned workspace.
  Do not use an admin/service key to bypass workspace authorization.
- Treat account linking according to Supabase's verified-identity behavior; do not
  merge accounts or transfer credits based on an email typed into a form.

Automated tests mock the provider and database boundaries. They do not prove that
the production Google credentials, redirect allowlist, or user consent are configured.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Provider is not enabled | Google enabled and saved in the same Supabase project as the website |
| `redirect_uri_mismatch` | Google client contains Supabase's exact OAuth callback, not ETA's callback |
| Redirected to homepage / callback missing | Supabase Redirect URLs include the exact app origin and callback query variants |
| PKCE/code exchange failure | Start again in the same browser; allow cookies; do not reuse a consumed code |
| Access blocked while Testing | Add your Google account under Audience → Test users |
| Workspace setup could not finish | Existing database migrations, `api` schema exposure and authenticated RPC grants; not Google credentials |

References:
- <https://supabase.com/docs/guides/auth/social-login/auth-google>
- <https://supabase.com/docs/guides/auth/redirect-urls>
- <https://developers.google.com/identity/branding-guidelines>
