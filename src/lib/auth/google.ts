import type { SupabaseClient } from "@supabase/supabase-js";

import { authCallbackUrl } from "@/lib/auth/redirect";

export async function beginGoogleSignIn(
  client: Pick<SupabaseClient["auth"], "signInWithOAuth">,
  origin: string,
  nextPath: string,
) {
  const { data, error } = await client.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authCallbackUrl(origin, nextPath, "google"),
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) throw new Error("Google sign-in could not start. Please try again or continue with email.");
  return data.url;
}
