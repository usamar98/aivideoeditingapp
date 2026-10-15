# Create AI Videos brand assets

Create AI Videos uses an electric-blue C/play emblem and a navy wordmark. The C stands for creation and the play symbol identifies the video studio. The cream-and-blue interface palette is preserved. The full logo appears on public and sign-in pages; the compact emblem appears in the studio sidebar, browser tab and mobile navigation.

- `public/brand/create-ai-videos-symbol.svg`: master square emblem, including the small-size favicon design.
- `public/brand/create-ai-videos-wordmark.svg`: master lettering, using local Arial/Helvetica without a font download.
- `public/brand/create-ai-videos-logo.svg`: generated transparent horizontal lockup.
- `public/brand/create-ai-videos-logo.png`: a high-resolution transparent export for reuse outside the app.
- `src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`: generated browser and home-screen icons, discovered automatically by Next.js.
- `public/brand/create-ai-videos-icon-{192,512,1024}.png`: app shortcuts and provider-dashboard icons. Use the 1024px version for Meta/Google/Stripe branding where accepted.
- `src/app/manifest.ts`: application name, shortcut name, theme and icon metadata.

The canonical website is `https://createaivideos.app` (without www), and the confirmed support mailbox is `support@createaivideos.app`. The retired `eta-*` asset URLs remain compatibility aliases containing the **new** artwork, not the retired E emblem.

After editing either master vector, regenerate the derived files with:

```sh
node scripts/generate-brand-assets.mjs
```

The script uses Sharp from the project's installed Next.js dependency; it needs no network or paid image API. Commit the generated assets along with the master vectors. Public branding is defined in `src/config/brand.ts`; the legacy `NEXT_PUBLIC_PRODUCT_NAME` setting is no longer used. Billing IDs, subscriptions, OAuth cookies, encrypted tokens and existing user data are unchanged. See [domain migration](DOMAIN_MIGRATION.md) for the external cutover checklist.
