import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), exchange: vi.fn(), schema: vi.fn(), workspace: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "@/app/auth/callback/route";
import { beginGoogleSignIn } from "@/lib/auth/google";
import { authCallbackUrl, authErrorMessage, safeAuthNextPath } from "@/lib/auth/redirect";

const origin = "https://www.editingapp.live";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.workspace.mockResolvedValue({ data: "workspace-owned", error: null });
  mocks.schema.mockReturnValue({ rpc: mocks.workspace });
  mocks.createClient.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchange }, schema: mocks.schema });
});

describe("authentication return paths", () => {
  it.each([
    undefined, null, ["/studio"], "https://evil.test", "//evil.test", "/\\evil.test", "/\n/evil.test",
    "javascript:alert(1)", "/%5cevil.test", "/%2fevil.test", "/%255cevil.test", "/safe/..//evil.test",
  ])("rejects an unsafe next destination: %j", (input) => {
    expect(safeAuthNextPath(input)).toBe("/studio");
  });

  it("preserves local paths, queries, and fragments", () => {
    const path = "/studio/cartoon/new?idea=cat%20story#cast";
    expect(safeAuthNextPath(path)).toBe(path);
    const callback = new URL(authCallbackUrl(origin, path, "google"));
    expect(callback.origin + callback.pathname).toBe(`${origin}/auth/callback`);
    expect(callback.searchParams.get("next")).toBe(path);
    expect(callback.searchParams.get("provider")).toBe("google");
  });

  it("keeps email confirmation distinct from Google OAuth", () => {
    expect(new URL(authCallbackUrl(origin, "/studio")).searchParams.has("provider")).toBe(false);
    expect(authErrorMessage("confirmation")).toContain("confirmation link");
    expect(authErrorMessage("oauth_cancelled")).toContain("cancelled");
    expect(authErrorMessage("workspace")).not.toContain("email was confirmed");
    expect(authErrorMessage("<script>unsafe error</script>")).toBeNull();
  });
});

describe("Google OAuth initiation", () => {
  it("uses Supabase PKCE OAuth with a same-site callback and no YouTube/offline permissions", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" }, error: null });
    expect(await beginGoogleSignIn({ signInWithOAuth }, origin, "/studio/jobs")).toContain("/auth/v1/authorize");
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=%2Fstudio%2Fjobs&provider=google`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("sanitizes initiation return paths", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { url: "https://project.supabase.co/auth/v1/authorize" }, error: null });
    await beginGoogleSignIn({ signInWithOAuth }, origin, "//evil.test");
    expect(new URL(signInWithOAuth.mock.calls[0][0].options.redirectTo).searchParams.get("next")).toBe("/studio");
  });

  it.each([
    { data: { url: null }, error: null },
    { data: { url: null }, error: { message: "internal provider details" } },
  ])("does not navigate on a failed start", async (result) => {
    const signInWithOAuth = vi.fn().mockResolvedValue(result);
    await expect(beginGoogleSignIn({ signInWithOAuth }, origin, "/studio")).rejects.toThrow("Google sign-in could not start");
  });
});

describe("Google and email callback", () => {
  it("exchanges the code before ensuring the authenticated user's existing/new workspace", async () => {
    const response = await GET(new Request(`${origin}/auth/callback?code=one-use-code&provider=google&next=%2Fstudio%2Fjobs`));
    expect(response.headers.get("location")).toBe(`${origin}/studio/jobs`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.exchange).toHaveBeenCalledWith("one-use-code", undefined);
    expect(mocks.schema).toHaveBeenCalledWith("api");
    expect(mocks.workspace).toHaveBeenCalledWith("ensure_personal_workspace", { workspace_name: "My studio" });
    expect(mocks.exchange.mock.invocationCallOrder[0]).toBeLessThan(mocks.workspace.mock.invocationCallOrder[0]);
  });

  it("passes through the SDK's PKCE flow identifier", async () => {
    await GET(new Request(`${origin}/auth/callback?code=one-use-code&sb_flow_id=flow-identifier`));
    expect(mocks.exchange).toHaveBeenCalledWith("one-use-code", { flowId: "flow-identifier" });
  });

  it("still completes password-signup email confirmation", async () => {
    const response = await GET(new Request(`${origin}/auth/callback?code=email-code`));
    expect(response.headers.get("location")).toBe(`${origin}/studio`);
    expect(mocks.workspace).toHaveBeenCalledOnce();
  });

  it("blocks external redirects after a successful exchange", async () => {
    const url = new URL("/auth/callback", origin);
    url.searchParams.set("code", "one-use-code");
    url.searchParams.set("next", "/\\evil.test");
    expect((await GET(new Request(url))).headers.get("location")).toBe(`${origin}/studio`);
  });

  it.each([
    ["access_denied", "oauth_cancelled"], ["server_error", "oauth"],
  ])("handles provider error %s without exchanging a code or trusting the description", async (error, expected) => {
    const response = await GET(new Request(`${origin}/auth/callback?provider=google&code=ignored&error=${error}&error_description=private-detail&next=%2Fstudio%2Fjobs`));
    const target = new URL(response.headers.get("location")!);
    expect(target.searchParams.get("error")).toBe(expected);
    expect(target.searchParams.get("next")).toBe("/studio/jobs");
    expect(target.href).not.toContain("private-detail");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it.each(["", "?provider=google"])("handles missing authorization codes: %s", async (query) => {
    const target = new URL((await GET(new Request(`${origin}/auth/callback${query}`))).headers.get("location")!);
    expect(target.searchParams.get("error")).toBe(query ? "oauth" : "confirmation");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("handles missing Supabase configuration", async () => {
    mocks.createClient.mockResolvedValue(null);
    const response = await GET(new Request(`${origin}/auth/callback?provider=google&code=test`));
    expect(response.headers.get("location")).toContain("error=oauth");
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it("rejects expired/replayed codes without initializing a workspace", async () => {
    mocks.exchange.mockResolvedValue({ error: { message: "code already used" } });
    const response = await GET(new Request(`${origin}/auth/callback?provider=google&code=replayed`));
    expect(response.headers.get("location")).toContain("error=oauth");
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it("handles exchange transport errors without leaking internals", async () => {
    mocks.exchange.mockRejectedValue(new Error("private network details"));
    const response = await GET(new Request(`${origin}/auth/callback?provider=google&code=test`));
    expect(response.headers.get("location")).toContain("error=oauth");
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves the return path when workspace setup fails (throws=%s)", async (throws) => {
    if (throws) mocks.workspace.mockRejectedValue(new Error("private database detail"));
    else mocks.workspace.mockResolvedValue({ error: { message: "private database detail" } });
    const response = await GET(new Request(`${origin}/auth/callback?provider=google&code=test&next=%2Fstudio%2Fjobs`));
    const target = new URL(response.headers.get("location")!);
    expect(target.searchParams.get("error")).toBe("workspace");
    expect(target.searchParams.get("next")).toBe("/studio/jobs");
    expect(target.href).not.toContain("database");
  });
});
