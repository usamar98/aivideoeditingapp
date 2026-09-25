# ETA brand assets

ETA pairs a custom geometric wordmark with an electric-blue E/play emblem. Cream lettering and navy type match the existing website palette. The full logo appears on the public pages and sign-in screen; the compact emblem appears in the studio sidebar and mobile navigation.

- `public/brand/eta-symbol.svg`: master square emblem, including the small-size favicon design.
- `public/brand/eta-wordmark.svg`: master ETA lettering, outlined as paths so no font download is needed.
- `public/brand/eta-logo.svg`: generated transparent horizontal lockup.
- `public/brand/eta-logo.png`: a high-resolution transparent export for reuse outside the app.
- `src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`: generated browser and home-screen icons, discovered automatically by Next.js.

After editing either master vector, regenerate the derived files with:

```sh
node scripts/generate-brand-assets.mjs
```

The script uses Sharp from the project's installed Next.js dependency; it needs no network or paid image API. Commit the generated assets along with the master vectors. Public branding is defined in `src/config/brand.ts`; the legacy `NEXT_PUBLIC_PRODUCT_NAME` setting is no longer used. Billing catalog names, subscriptions, and existing user data are unchanged.
