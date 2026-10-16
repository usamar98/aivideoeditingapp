# Create AI Videos brand assets

Create AI Videos uses the approved white **CAV monogram** on a blue square and a navy wordmark. The cream-and-blue interface palette is preserved. The full logo appears on public and sign-in pages; the compact emblem appears in the studio sidebar, browser tab and mobile navigation.

- `public/brand/create-ai-videos-monogram.png`: approved square artwork used as the master for all exports.
- `public/brand/create-ai-videos-symbol.svg`: generated self-contained emblem with an embedded PNG, including the small-size favicon artwork.
- `public/brand/create-ai-videos-wordmark.svg`: master lettering, using local Arial/Helvetica without a font download.
- `public/brand/create-ai-videos-logo.svg`: generated transparent horizontal lockup.
- `public/brand/create-ai-videos-logo.png`: a high-resolution transparent export for reuse outside the app.
- `src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`: generated browser and home-screen icons, discovered automatically by Next.js.
- `public/brand/create-ai-videos-icon-{192,512,1024}.png`: app shortcuts and provider-dashboard icons where those dimensions are accepted.
- `public/brand/create-ai-videos-oauth-120.png`: opaque 120 × 120 consent-screen PNG under 1 MB, suitable for Google's requested upload size.
- `src/config/brand-assets.ts`: revisioned public artwork URLs to refresh cached website and installed-app icons.
- `src/app/manifest.ts`: application name, shortcut name, theme and icon metadata.

The canonical website is `https://createaivideos.app` (without www), and the confirmed support mailbox is `support@createaivideos.app`. The retired `eta-*` asset URLs remain compatibility aliases containing the **new** artwork, not the retired E emblem.

After replacing the approved master artwork or editing the wordmark, regenerate the derived files with:

```sh
node scripts/generate-brand-assets.mjs
```

The script uses Sharp from the project's installed Next.js dependency; it needs no network or paid image API. ICO frames must remain RGBA for Turbopack compatibility, even though the logo is opaque. Commit generated assets with the master artwork, and update the public asset revision when artwork changes. Public branding is defined in `src/config/brand.ts`; the legacy `NEXT_PUBLIC_PRODUCT_NAME` setting is no longer used. Billing IDs, subscriptions, OAuth cookies, encrypted tokens and existing user data are unchanged. Updating the site does not publish a new Google OAuth brand or guarantee review approval. See [domain migration](DOMAIN_MIGRATION.md) for the external cutover checklist.
