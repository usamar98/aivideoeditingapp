import { z } from "zod";
import { FACEBOOK_SCOPES } from "./facebook-config";

// Meta can return target IDs as strings or JSON integers. Never round an unsafe ID.
const targetId = z.union([
  z.string().regex(/^\d{1,40}$/),
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(String),
]);
const debugSchema = z.object({ data: z.object({
  app_id: z.string(), user_id: z.string(), is_valid: z.boolean(),
  expires_at: z.number().int().nonnegative(), data_access_expires_at: z.number().int().nonnegative().optional(),
  scopes: z.array(z.string()).max(500),
  granular_scopes: z.array(z.object({
    scope: z.string(), target_ids: z.array(targetId).max(5000).nullish(),
  })).max(500).optional(),
}) });

export type FacebookPageTokenProbe = {
  attemptedTargets: number;
  tokensReturned: number;
  missingTokens: number;
  rejectedTargets: number;
  unavailableTargets: number;
  invalidResponses: number;
};

export type FacebookPageGrantInspection = {
  status: "verified" | "invalid" | "unavailable" | "malformed";
  scopeTargets: Record<typeof FACEBOOK_SCOPES[number], { selection: "all" | "selected" | "unknown"; count: number }>;
  commonTargets: number;
  inspectedTargets: number;
  readableTargets: number;
  rejectedTargets: number;
  unavailableTargets: number;
  pageTokenProbe: FacebookPageTokenProbe;
  truncated: boolean;
};

export function emptyFacebookPageGrantInspection(status: FacebookPageGrantInspection["status"]): FacebookPageGrantInspection {
  return {
    status,
    scopeTargets: Object.fromEntries(FACEBOOK_SCOPES.map((scope) => [scope, { selection: "unknown", count: 0 }])) as FacebookPageGrantInspection["scopeTargets"],
    commonTargets: 0, inspectedTargets: 0, readableTargets: 0, rejectedTargets: 0, unavailableTargets: 0,
    pageTokenProbe: { attemptedTargets: 0, tokensReturned: 0, missingTokens: 0, rejectedTargets: 0, unavailableTargets: 0, invalidResponses: 0 },
    truncated: false,
  };
}

// Diagnostic only: granular targets are not proof of a content task or a Page token.
// The IDs stay in request memory; only the fixed-label summary may be logged.
export function inspectFacebookPageGrants(payload: unknown, appId: string, userId: string, now = Date.now() / 1000) {
  const parsed = debugSchema.safeParse(payload);
  if (!parsed.success) return { summary: emptyFacebookPageGrantInspection("malformed"), targets: [] as string[] };
  const data = parsed.data.data;
  if (!data.is_valid || data.app_id !== appId || data.user_id !== userId ||
    (data.expires_at !== 0 && data.expires_at <= now) ||
    (data.data_access_expires_at !== undefined && data.data_access_expires_at !== 0 && data.data_access_expires_at <= now) ||
    FACEBOOK_SCOPES.some((scope) => !data.scopes.includes(scope))) {
    return { summary: emptyFacebookPageGrantInspection("invalid"), targets: [] as string[] };
  }
  const summary = emptyFacebookPageGrantInspection("verified");
  const selections = FACEBOOK_SCOPES.map((scope) => {
    const rows = data.granular_scopes?.filter((entry) => entry.scope === scope) ?? [];
    // Missing/duplicate entries are ambiguous, not a grant to every Page.
    if (rows.length !== 1) return null;
    const ids = rows[0].target_ids;
    if (ids == null) {
      summary.scopeTargets[scope] = { selection: "all", count: 0 };
      return "all" as const;
    }
    const targets = new Set(ids);
    summary.scopeTargets[scope] = { selection: "selected", count: targets.size };
    return targets;
  });
  const restricted = selections.filter((selection) => selection instanceof Set);
  const targets = selections.some((selection) => selection === null) || !restricted.length ? [] :
    [...restricted[0]].filter((id) => restricted.every((selection) => selection.has(id)));
  summary.commonTargets = targets.length;
  return { summary, targets };
}
