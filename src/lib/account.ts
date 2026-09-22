import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireAccount() {
  const db = await createClient();
  const admin = createAdminClient();
  if (!db || !admin) throw new Error("Connect Supabase to use your account. Demo data cannot be billed or saved to an account.");
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error("Please sign in to continue.");
  const { data: workspaceId, error: workspaceError } = await db.schema("api").rpc("ensure_personal_workspace", { workspace_name: "My studio" });
  if (workspaceError || !workspaceId) throw new Error("Workspace setup is unavailable. Apply the database migrations first.");
  return { db, admin, user, workspaceId: String(workspaceId) };
}

export function publicError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
