import { describe, expect, it } from "vitest";

import { mayRetry, nextGenerationAction } from "@/lib/generation/reconcile";

describe("durable generation recovery", () => {
  it("reconciles a known provider request before resubmitting", () => {
    expect(nextGenerationAction({ id: "g", status: "processing", providerRequestId: "provider-123", attemptCount: 1, lastError: null })).toBe("check_provider");
  });

  it("bounds retries", () => {
    expect(mayRetry({ id: "g", status: "failed", providerRequestId: null, attemptCount: 2, lastError: "timeout" }, 3)).toBe(true);
    expect(mayRetry({ id: "g", status: "failed", providerRequestId: null, attemptCount: 3, lastError: "timeout" }, 3)).toBe(false);
  });
});
