export type IntegrationStatus = {
  key: "supabase" | "gemini" | "fal" | "elevenlabs" | "trigger" | "stripe";
  label: string;
  configured: boolean;
  purpose: string;
};

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    {
      key: "supabase",
      label: "Supabase",
      configured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
          process.env.SUPABASE_SECRET_KEY,
      ),
      purpose: "Authentication, private media, and project data",
    },
    {
      key: "gemini",
      label: "Gemini",
      configured: Boolean(process.env.GEMINI_API_KEY),
      purpose: "Scripts, series guides, and structured storyboards",
    },
    {
      key: "fal",
      label: "fal.ai",
      configured: Boolean(process.env.FAL_KEY),
      purpose: "Reference-guided images and scene animation",
    },
    {
      key: "elevenlabs",
      label: "ElevenLabs",
      configured: Boolean(process.env.ELEVENLABS_API_KEY),
      purpose: "Narration, dialogue, and timing",
    },
    {
      key: "trigger",
      label: "Trigger.dev",
      configured: Boolean(process.env.TRIGGER_SECRET_KEY && process.env.TRIGGER_PROJECT_REF),
      purpose: "Durable generation and rendering jobs",
    },
    {
      key: "stripe",
      label: "Stripe",
      configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      purpose: "Subscriptions and credit purchases",
    },
  ];
}

export function isFixtureMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true" || process.env.NODE_ENV !== "production";
}
