import { FACEBOOK_SCOPES } from "./facebook-config";

export const FACEBOOK_CONTENT_TASKS = ["CREATE_CONTENT", "MANAGE", "PROFILE_PLUS_CREATE_CONTENT", "PROFILE_PLUS_FULL_CONTROL"] as const;
// Diagnostic labels only. This list must not grant publishing access to additional roles.
const DIAGNOSTIC_TASKS = [...FACEBOOK_CONTENT_TASKS, "ADVERTISE", "ANALYZE", "MODERATE", "MESSAGING", "PROFILE_PLUS_MANAGE", "PROFILE_PLUS_FACEBOOK_ACCESS", "PROFILE_PLUS_ADVERTISE", "PROFILE_PLUS_ANALYZE", "PROFILE_PLUS_MODERATE", "PROFILE_PLUS_MESSAGING"] as const;
const PERMISSION_STATUSES = ["granted", "declined", "expired", "missing", "other"] as const;
type PermissionStatus = typeof PERMISSION_STATUSES[number];
type DiagnosticTask = typeof DIAGNOSTIC_TASKS[number];

export type FacebookGrantDiagnostics = {
  permissions: Record<typeof FACEBOOK_SCOPES[number], PermissionStatus>;
  returnedPages: number;
  eligiblePages: number;
  pagesWithoutTasks: number;
  unrecognizedTasks: number;
  taskCounts: Partial<Record<DiagnosticTask, number>>;
};
export type FacebookGrantFailure = "permissions_missing" | "pages_not_returned" | "page_content_access_missing";
export type FacebookOAuthStage = "configuration" | "validate_state" | "authenticate" | "consume_state" | "authorization" | "exchange_code" | "page_discovery" | "save_grant" | "complete";

export const FACEBOOK_OAUTH_NOTICES = {
  choose_page: "Choose the Page you want Create AI Videos to publish to. Nothing has been posted.",
  denied: "Facebook connection cancelled. Nothing was posted.",
  permissions_missing: "Facebook did not grant all required Page permissions. Review Page listing, Page read access and Page publishing permissions, then reconnect.",
  pages_not_returned: "Facebook returned no Pages to the app's API. If you selected a Page during login, contact support with the reference below so we can investigate Page discovery.",
  page_content_access_missing: "Facebook returned Pages, but none included a publishing task recognized by this app. Check your Page content access. If you can already publish to the Page, contact support with the reference below.",
  // Retain old bookmarked callback URLs without presenting the old, ambiguous explanation.
  no_pages: "No publishable Page was found. Reconnect to get a detailed connection result, or contact support.",
  connection_failed: "Facebook could not connect. Try connecting again. If this continues, contact support with the reference below.",
} as const;
export type FacebookOAuthOutcome = keyof typeof FACEBOOK_OAUTH_NOTICES;
const REFERENCE_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export function facebookOAuthNotice(outcome?: string, reference?: string) {
  if (!outcome || !Object.hasOwn(FACEBOOK_OAUTH_NOTICES, outcome)) return null;
  const notice = FACEBOOK_OAUTH_NOTICES[outcome as FacebookOAuthOutcome];
  return outcome !== "choose_page" && outcome !== "denied" && reference && REFERENCE_PATTERN.test(reference)
    ? `${notice} Support reference: ${reference}.`
    : notice;
}

export function facebookGrantDiagnostics(permissions: { permission: string; status: string }[]): FacebookGrantDiagnostics {
  const statuses = Object.fromEntries(FACEBOOK_SCOPES.map((scope) => {
    const status = permissions.find((permission) => permission.permission === scope)?.status ?? "missing";
    return [scope, PERMISSION_STATUSES.includes(status as PermissionStatus) ? status : "other"];
  })) as FacebookGrantDiagnostics["permissions"];
  return { permissions: statuses, returnedPages: 0, eligiblePages: 0, pagesWithoutTasks: 0, unrecognizedTasks: 0, taskCounts: {} };
}

export function recordFacebookPageTasks(diagnostics: FacebookGrantDiagnostics, tasks: string[], eligible: boolean) {
  diagnostics.returnedPages++;
  if (eligible) diagnostics.eligiblePages++;
  if (!tasks.length) diagnostics.pagesWithoutTasks++;
  for (const task of new Set(tasks)) {
    if (DIAGNOSTIC_TASKS.includes(task as DiagnosticTask)) {
      const known = task as DiagnosticTask;
      diagnostics.taskCounts[known] = (diagnostics.taskCounts[known] ?? 0) + 1;
    } else diagnostics.unrecognizedTasks++;
  }
}

const safeCount = (value: number) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function logFacebookOAuthResult(reference: string, outcome: FacebookOAuthOutcome, stage: FacebookOAuthStage, diagnostics?: FacebookGrantDiagnostics) {
  // Never spread provider objects or log error messages, URLs, codes, state, IDs, names or tokens.
  // Project onto fixed labels/counts again at the logging boundary, including for future callers.
  const summary = diagnostics ? {
    permissions: Object.fromEntries(FACEBOOK_SCOPES.map((scope) => [scope,
      PERMISSION_STATUSES.includes(diagnostics.permissions[scope]) ? diagnostics.permissions[scope] : "other"])),
    returnedPages: safeCount(diagnostics.returnedPages),
    eligiblePages: safeCount(diagnostics.eligiblePages),
    pagesWithoutTasks: safeCount(diagnostics.pagesWithoutTasks),
    unrecognizedTasks: safeCount(diagnostics.unrecognizedTasks),
    taskCounts: Object.fromEntries(DIAGNOSTIC_TASKS.filter((task) => diagnostics.taskCounts[task] !== undefined)
      .map((task) => [task, safeCount(diagnostics.taskCounts[task]!)])),
  } : undefined;
  const entry = JSON.stringify({ event: "facebook.oauth", reference, outcome, stage, diagnostics: summary });
  if (outcome === "choose_page" || outcome === "denied") console.info(entry);
  else console.warn(entry);
}
