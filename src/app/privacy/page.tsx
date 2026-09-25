import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { brand } from "@/config/brand";
import { publicMetadata } from "@/lib/seo/metadata";

const title = "Privacy Policy";
const description = "How ETA handles account information, Google sign-in, uploaded media, AI generation, payments, cookies and privacy requests.";
export const metadata = publicMetadata({ title, description, path: "/privacy" });

const sections: LegalSection[] = [
  {
    id: "scope", title: "About this policy",
    content: <><p>This policy explains how ETA (“we”, “us” or “our”) handles personal information when you visit editingapp.live or use our AI video creation studio. It covers faceless videos, AI cartoons, product ads, podcast Shorts, accounts and subscriptions.</p><p>For privacy questions or requests, contact <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>. Our <Link href="/terms">Terms of Service</Link> explain the rules for using ETA.</p></>,
  },
  {
    id: "information", title: "Information we process",
    content: <ul>
      <li><strong>Account information:</strong> your email address, authentication identifier, profile name, sign-in provider and account settings. Email/password authentication is handled by our authentication provider.</li>
      <li><strong>Creative content:</strong> prompts, scripts, storyboards, character references, product images and links, generated images, audio, captions and videos, and the settings you choose.</li>
      <li><strong>Podcast Shorts:</strong> uploaded recordings, extracted audio, word-timed transcripts, anonymous speaker labels, selected clip boundaries, caption corrections and speaker-position settings. Audio and transcripts are sent to fal and its model providers for transcription and highlight selection. Optional face-follow computes temporary face positions inside the background worker to crop footage; it does not identify people by name or create stored facial identity profiles. Saved transcripts and clip projects remain part of your private workspace.</li>
      <li><strong>Service records:</strong> workspace membership, generation job identifiers, statuses, errors, credit reservations and credit transactions.</li>
      <li><strong>Billing information:</strong> Stripe customer and subscription identifiers, plan, payment status and transaction records. Payment details are collected by Stripe; ETA does not store your full card number or card security code.</li>
      <li><strong>Technical and support information:</strong> IP addresses, browser and device information, request logs, security events, and messages or attachments you send to support. Our hosting and service providers may process this information while delivering the service.</li>
    </ul>,
  },
  {
    id: "google", title: "Google sign-in and Google user data",
    content: <><p>If you choose Continue with Google, Google and Supabase authenticate you and provide basic identity information, including your Google account identifier, email address, and available profile name and picture. We use this information to create or identify your ETA account, maintain your session and give you access to your workspace. Relevant profile information is stored with your authentication record.</p><p>Google sign-in does not give ETA access to your Gmail messages, Drive files, contacts or YouTube channel. It does not authorize social posting. ETA does not receive your Google password.</p><p>Google identity data is used for account and related support or security purposes, not for advertising or AI model training. It is not sent as creative input to AI generation providers. If you separately put personal information in a prompt or uploaded file, that content is processed as described below.</p><p>You can remove ETA access in your <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Google Account connections</a>. Revoking Google access does not by itself delete your ETA projects or cancel a paid subscription; contact us for account deletion and use your billing settings to cancel renewal.</p></>,
  },
  {
    id: "use", title: "Why we use information",
    content: <><p>We use information to provide sign-in and private workspaces, save and process your projects, generate and deliver media, manage payments and credits, respond to support requests, investigate failures, prevent abuse and meet applicable legal obligations.</p><p>Where a legal basis is required, processing may be necessary to provide the service you request, meet a legal obligation, or pursue legitimate interests such as security and reliability, subject to your rights. Where consent is required for an optional activity, we will request it. Choosing not to provide information needed for an account or generation may prevent that feature from working.</p></>,
  },
  {
    id: "providers", title: "Service providers and AI processing",
    content: <><p>We share information needed to perform the requested function with service providers. Depending on the workflow, these include:</p><ul>
      <li><strong>Supabase:</strong> account authentication, project database and media storage.</li>
      <li><strong>Vercel and Trigger.dev:</strong> website hosting, request processing, background generation jobs and operational logs.</li>
      <li><strong>fal.ai and its model providers, Google Gemini, and ElevenLabs:</strong> processing relevant prompts, reference images, scripts or audio to generate stories, images, speech and video. Not every provider is used for every job.</li>
      <li><strong>Stripe:</strong> checkout, billing, subscriptions, payment methods and payment-related fraud prevention. Account email and billing identifiers may be shared to link a payment to your account.</li>
    </ul><p>AI processing requires sending the selected creative inputs to the relevant provider, which may use its own infrastructure and model partners. Provider retention and data-use terms vary; do not upload secrets, sensitive personal information or material you are not authorized to share. This policy does not promise zero retention by all providers.</p><p>We do not sell Google sign-in data or use it for targeted advertising. We may disclose other information when required by law, to protect users and the service, or as part of a business transfer with applicable privacy safeguards.</p></>,
  },
  {
    id: "cookies", title: "Cookies and browser storage",
    content: <><p>ETA uses authentication cookies to establish and maintain your session. Some editors and development samples use browser storage to remember local edits or settings. Clearing this storage can sign you out or remove locally saved drafts.</p><p>The current application does not include advertising trackers or a marketing analytics script. Google sign-in and Stripe checkout operate their own services and may use cookies under their own policies. Browser settings let you control storage, but blocking essential cookies may prevent sign-in from working.</p></>,
  },
  {
    id: "retention", title: "Storage, retention and security",
    content: <><p>Account records, projects, media and job records are stored to provide your workspace and support the service. Billing, security and dispute records may need to be kept longer to meet legal obligations or resolve issues. Retention depends on the record and purpose; we do not promise a fixed automatic deletion period for all data.</p><p>Workspace access controls and private media storage restrict normal access. Temporary signed media links are used for downloads and provider processing. Anyone with a valid signed link may be able to access that asset until the link expires, so avoid sharing those links with unintended recipients.</p><p>Service providers may process information outside your country. Applicable safeguards and legal requirements depend on the relevant service and location. No internet transmission or storage system can be guaranteed completely secure.</p></>,
  },
  {
    id: "rights", title: "Your choices and deletion requests",
    content: <><p>You can update supported profile details in <Link href="/studio/profile">My account</Link> and download completed media from your projects. For access to personal information, correction, export, or deletion of your account and associated content, email <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> from your account address. Deletion is handled through support, not an automatic self-service button.</p><p>We may need to verify your identity and clarify which records are involved. We handle requests in accordance with applicable law; some records may need to be retained for billing, security, disputes or legal obligations, and backup copies may remain until their normal removal cycle. Removing an account does not erase copies you downloaded or shared with others.</p><p>Depending on where you live, you may also have rights to restrict or object to processing, withdraw consent where used, or complain to your local data-protection authority. Contact support to exercise an applicable right. Please do not send passwords, card details or API keys.</p></>,
  },
  {
    id: "children", title: "Children and other people’s information",
    content: <><p>ETA is intended for adult creators and is not directed to children under 18. Do not create an account if you are under 18. If you believe a child has provided personal information, contact us so we can investigate and handle the information appropriately.</p><p>Only upload another person’s image, voice or personal information if you have the necessary permission and a lawful basis. Do not use ETA to impersonate people, create non-consensual intimate content or expose private information.</p></>,
  },
  {
    id: "updates", title: "Policy changes and contact",
    content: <><p>We may update this policy as the service or its data practices change. The latest version appears at this URL with its update date. We will provide additional notice or seek consent where required by applicable law.</p><p>Questions about this policy or a privacy concern? Email <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> with the subject “Privacy request”.</p></>,
  },
];

export default function PrivacyPage() {
  return <LegalPage title={title} description={description} path="/privacy" sections={sections} />;
}
