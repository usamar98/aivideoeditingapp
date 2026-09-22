import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; src/proxy.ts refreshes sessions.
        }
      },
    },
  });
}

export async function getViewer() {
  const client = await createClient();
  if (!client) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" || process.env.NODE_ENV !== "production") {
      return { id: "demo-user", email: "creator@demo.local", fixture: true } as const;
    }
    return null;
  }

  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
    fixture: false,
  } as const;
}

export async function canManageFeatures() {
  const viewer = await getViewer();
  if (!viewer) return false;
  if (viewer.fixture) return true;
  const client = await createClient();
  if (!client) return false;
  const { data, error } = await client.from("profiles").select("is_admin").eq("id", viewer.id).single();
  return !error && data?.is_admin === true;
}
