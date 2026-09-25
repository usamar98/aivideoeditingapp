# Public legal pages

- Privacy Policy: `https://www.editingapp.live/privacy`
- Terms of Service: `https://www.editingapp.live/terms`

These routes are server-rendered public pages with canonical metadata, navigation,
and sitemap entries. The homepage footer and Google/email account form link to
both. No migration, provider secret or environment variable is required.

## Owner review before publication

This is a product-specific starting draft, not legal advice or a compliance
certification. Have qualified counsel review the text for the actual operator,
markets and practices before launch. In particular:

- The operator has only been identified as ETA. Confirm and add the legal person
  or company name, business address and other disclosures required for its country
  and customers. Do not invent a company identity, jurisdiction or address.
- Confirm an adults-only service is appropriate, and that operational practices
  match the stated eligibility and content rules.
- Confirm actual provider contracts, retention, international transfers, Google
  data restrictions, refund handling and any tracking enabled outside this repo.
- Ensure `support@editingapp.live` is monitored for access, export, deletion,
  refunds and infringement reports. Account deletion is a support process, not
  an implemented self-service control or a fixed deletion SLA.
- No numerical retention schedule, arbitration provision or liability cap was
  invented. Counsel should determine any additional locally required terms.
- The signup notice links the policies but does not add a consent/version ledger.
  Assess any additional consent and agreement-recording requirements separately.

## Deployment and Google branding

Deploy the website before submitting the production URLs. Open both without a
session and confirm HTTP 200, full content and footer links. Enter the URLs in
Google Auth Platform → Branding, verify the branding, and publish it after
approval. Do not use localhost URLs in the public consent screen.

Reference requirements reviewed when preparing these pages:
- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://developers.google.com/terms/api-services-user-data-policy

When materially editing the policy text, update its visible date in
`src/components/marketing/legal-page.tsx` and the relevant discovery dates in
`src/lib/seo/site.ts`.
