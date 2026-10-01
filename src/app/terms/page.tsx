import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { brand } from "@/config/brand";
import { publicMetadata } from "@/lib/seo/metadata";

const title = "Terms of Service";
const description = "The rules for using ETA’s AI video studio, including accounts, subscriptions, credits, cancellations, content rights and acceptable use.";
export const metadata = publicMetadata({ title, description, path: "/terms" });

const sections: LegalSection[] = [
  {
    id: "facebook", title: "Facebook Page Reels and ETA-held schedules",
    content: <><p>Facebook publishing requires a separate authorized Page connection. Review the connected Page, completed video, title, caption, AI disclosure and publication time before confirming each public Reel. Only publish content you have rights to use, with all necessary consents and disclosures, and follow the <a href="https://www.facebook.com/terms.php" target="_blank" rel="noopener noreferrer">Facebook Terms</a> and applicable Meta policies. Personal-profile posting is not supported.</p><p>These Reels are public, not private test uploads. ETA stores schedules and begins the upload at the selected time; it does not create a native Facebook schedule. Times use your device’s timezone and are stored in UTC. Worker availability, Meta processing, moderation and access restrictions can delay or prevent publication. If ETA is more than 15 minutes late before requesting publication, it pauses the job for review. Processing after Meta receives the request can still delay the public result.</p><p>Cancel in ETA before publication starts. Once ETA has recorded its intent to send the publication request, cancellation is no longer available because Facebook may already be publishing the Reel. Manage published or uncertain Reels in Meta Business Suite. Disconnecting removes local Facebook credentials and publishing history and stops pending ETA-held schedules, but does not remove published Reels or recall an in-flight publication. See the <Link href="/privacy#facebook">Facebook data policy</Link>.</p><p>When you select the AI-content option, ETA appends “AI-generated or digitally altered video.” to the caption. This does not set Facebook’s native AI label. You remain responsible for additional disclosures required by Meta, including using Meta’s own tools where necessary. Connection or upload success is not a guarantee of platform approval, reach or exact publication timing. Availability to public users depends on Meta access approval and operator configuration.</p></>,
  },
  {
    id: "agreement", title: "Using ETA",
    content: <><p>These terms govern your use of ETA (“we”, “us” or “our”) at editingapp.live, including its AI video tools, workspace and paid features. By creating an account or using the service, you agree to these terms. If you do not agree, do not use the service. Our <Link href="/privacy">Privacy Policy</Link> explains how we handle information.</p><p>You must be at least 18 and legally able to enter an agreement. If you use ETA for a business or another organization, you must have authority to act for it. Contact <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> with questions.</p></>,
  },
  {
    id: "accounts", title: "Accounts and security",
    content: <><p>Provide accurate account information and protect your sign-in credentials. You are responsible for activity you authorize through your account. Do not share passwords, authentication links or private media links with people who should not have access.</p><p>Report suspected unauthorized access promptly. Google sign-in authenticates an ETA account; it does not connect a YouTube channel or authorize publishing to a social platform.</p></>,
  },
  {
    id: "service", title: "What the service provides",
    content: <><p>ETA helps you create faceless videos, cartoons and AI-presenter product ads from supported prompts, scripts, images or product links. Features, models, available formats and credit estimates are described in the relevant workflow. Development fixtures and illustrative examples are not completed customer generations.</p><p>AI outputs may contain inaccurate facts, inconsistent characters, visual defects, speech errors or unexpected content. Review every result before use. ETA does not guarantee a particular creative result, uniqueness, copyright protection, platform approval, advertising performance or uninterrupted availability. Download and keep your own copies of work you need.</p><p>ETA produces downloadable media. Optional YouTube publishing requires a separate channel connection and explicit confirmation for each upload. YouTube public posting and scheduling depend on configuration and Google approval. Facebook Page Reels use a separate optional connection, subject to Meta access approval and configuration. Other social connections are not currently supported.</p></>,
  },
  {
    id: "youtube", title: "YouTube uploads and scheduled publication",
    content: <><p>By using ETA’s YouTube publishing feature, you agree to be bound by the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>. Review the connected channel, video, title, description, audience, altered/synthetic-content disclosure, visibility and publication time before confirming. Only upload content you are authorized to publish, and follow YouTube’s policies and applicable laws.</p><p>ETA initially uploads privately. Public/unlisted visibility or a public schedule is applied only after processing and your explicit choice. YouTube controls processing, content review, Shorts classification, quotas and publication. Scheduled times are converted from your device’s local timezone to UTC; delays or rejections can prevent the requested timing. If the selected time passes before the video is ready, ETA does not intentionally publish it late and asks you to review it.</p><p>Cancellation requests stop further work where possible and attempt to clear a YouTube schedule and keep the video private, not delete it. A request is not a confirmed cancellation. A video may become public before a cancellation is processed; make it private in YouTube Studio when publication is near. Existing public uploads should be managed in YouTube Studio.</p><p>Disconnecting removes ETA’s connection and publishing history after access revocation; it does not delete YouTube videos or cancel schedules already held by YouTube. Manage those schedules in YouTube Studio before disconnecting. Your ETA subscription and source projects remain separate. See our <Link href="/privacy#youtube">YouTube data policy</Link> for information handling and removal controls.</p></>,
  },
  {
    id: "billing", title: "Subscriptions and payments",
    content: <><p>Paid plans renew at the monthly or annual interval selected at checkout unless cancelled before the next renewal. The checkout shows the price, billing interval and any applicable taxes. Annual plans are billed as one yearly payment; a displayed monthly equivalent is not a monthly payment plan.</p><p>Stripe processes payments. By purchasing a recurring plan, you authorize the recurring charges disclosed at checkout. Keep your payment method current. Payment failures may prevent new subscription credits from being added.</p><p>See <Link href="/pricing">Pricing</Link> for current offers and credit allocations. We will disclose material changes to subscription pricing before they take effect and provide any notice required by law.</p></>,
  },
  {
    id: "credits", title: "Credits, generation and refunds",
    content: <><p>Monthly plans grant their credits after each successful monthly payment. Annual plans grant the full year’s credits upfront after payment, not in monthly installments. Credits are service units for generation, not cash or a bank balance.</p><p>Each generation stage shows its credit cost before you start. Planning and rendering are separate stages. Credits are reserved for an active job and charged for a successful stage. A successfully completed script, cast, presenter or storyboard stage remains charged even if you decide not to render the video.</p><p>Failed jobs and confirmed cancellations return the credits reserved for that job. A running cancellation may require worker confirmation; provider work already in progress may not stop immediately. Returning reserved credits is not a refund of a subscription payment.</p><p>If you believe a charge, job or credit balance is incorrect, contact <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> with your account email, job ID and relevant payment date. Subscription cancellation does not automatically refund earlier payments. We review refund requests and honor any refund, withdrawal or other consumer rights required by applicable law.</p></>,
  },
  {
    id: "cancellation", title: "Cancellation and account closure",
    content: <><p>Use <Link href="/studio/profile?tab=billing">My account → Billing</Link> to manage your payment method and cancel future subscription renewals through the billing portal. Review its confirmation and effective cancellation date. If you cannot access these controls, contact support before your next renewal.</p><p>Cancelling a generation job does not cancel your subscription. Signing out or revoking Google access also does not cancel it. For account closure and deletion of associated personal information, follow the support process in our <Link href="/privacy#rights">Privacy Policy</Link>.</p></>,
  },
  {
    id: "content", title: "Your content and generated output",
    content: <><p>You retain the rights you already hold in your uploads and prompts. You give ETA and the service providers used for your request permission to host, copy, process and transform that content as needed to provide the service, deliver outputs, and address support, security or legal issues.</p><p>You must have permission to use all uploaded material, including product photos, logos, character artwork, faces, voices and personal information. A public product link does not itself give you permission to reuse its contents.</p><p>ETA does not claim ownership of your original uploads or generated outputs. Use of an output remains subject to applicable law, third-party rights and the terms of the model or provider involved. We do not guarantee exclusive rights or that every output is suitable for commercial use. You are responsible for checking rights and permissions before publication.</p></>,
  },
  {
    id: "acceptable-use", title: "Acceptable use and AI disclosures",
    content: <><p>Do not use ETA to:</p><ul>
      <li>Create illegal content, facilitate fraud, infringe intellectual-property rights or expose private information.</li>
      <li>Impersonate a real person without authorization, create non-consensual intimate content, or exploit or sexualize minors.</li>
      <li>Make deceptive advertisements or unsupported product claims, or present a fictional AI presenter as a real customer giving a personal testimonial.</li>
      <li>Bypass safety checks, account limits, payment controls or access restrictions; upload malicious files; or interfere with the service.</li>
    </ul><p>AI-presenter content is synthetic. Keep required AI disclosures and follow the rules of the platform where you publish. You are responsible for substantiating advertising claims and obtaining permission for endorsements, likenesses and protected material.</p></>,
  },
  {
    id: "providers", title: "Third-party services and changes",
    content: <><p>ETA relies on authentication, hosting, payment and AI providers. Their availability, model capabilities, moderation policies and terms can affect a request. Access may be delayed or unavailable because of provider failures, maintenance, safety review or capacity limits.</p><p>We may improve, replace or discontinue features or model options. We will provide notice or remedies where required by applicable law. A feature description or roadmap is not a guarantee that an unreleased capability will become available.</p></>,
  },
  {
    id: "suspension", title: "Misuse, suspension and disputes",
    content: <><p>We may restrict or suspend access where reasonably necessary to address misuse, security threats, non-payment or legal requirements. Where appropriate, we will explain the issue and provide a way to contact support. Mandatory consumer rights are not removed by a suspension.</p><p>For a dispute, an infringement report or an account concern, contact <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> with enough information to identify the issue. Do not include passwords or full payment-card details.</p></>,
  },
  {
    id: "responsibility", title: "Responsibility and your legal rights",
    content: <><p>To the extent permitted by applicable law, ETA is provided on an “as available” basis without a promise that every output will be accurate or meet your intended purpose. You are responsible for reviewing content and deciding whether it is appropriate to publish or rely on.</p><p>Nothing in these terms excludes liability or limits a warranty, remedy or consumer right that cannot legally be excluded or limited. These terms do not require you to waive protections that apply where you live.</p></>,
  },
  {
    id: "updates", title: "Changes to these terms",
    content: <><p>The latest terms are published at this URL with their update date. We will give additional notice of material changes and seek agreement where required by applicable law. If you no longer agree to the terms, stop using the service and cancel any subscription renewal.</p><p>For questions, email <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p></>,
  },
];

export default function TermsPage() {
  return <LegalPage title={title} description={description} path="/terms" sections={sections} />;
}
