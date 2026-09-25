const fallbackPath = "/studio";
const redirectOrigin = "https://auth-redirect.invalid";

/** Only return same-site paths, including after URL normalization. */
export function safeAuthNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallbackPath;
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return fallbackPath;
  // Reject encoded path separators too; proxies/routers can decode these later.
  if (/%(?:2f|5c|25)/i.test(value.split(/[?#]/, 1)[0])) return fallbackPath;
  try {
    const url = new URL(value, redirectOrigin);
    if (url.origin !== redirectOrigin || url.pathname.startsWith("//")) return fallbackPath;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallbackPath;
  }
}

export function authCallbackUrl(origin: string, nextPath: string, provider?: "google") {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", safeAuthNextPath(nextPath));
  if (provider) url.searchParams.set("provider", provider);
  return url.toString();
}

export function authErrorMessage(error: unknown): string | null {
  switch (error) {
    case "workspace": return "Your account is signed in, but workspace setup could not finish. Sign in again to retry, or contact support if this continues.";
    case "confirmation": return "That confirmation link is invalid or expired. Please sign in again or request a new confirmation email.";
    case "oauth_cancelled": return "Google sign-in was cancelled. You can try again or continue with email.";
    case "oauth": return "Google sign-in could not finish. Please try again in the same browser or continue with email.";
    default: return null;
  }
}
