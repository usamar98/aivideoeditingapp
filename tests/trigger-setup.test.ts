import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({ task: <T,>(definition: T) => definition, logger: mocks }));
import { connectivityCheck } from "../src/trigger/connectivity-check";

// The SDK is mocked to exercise the handler without submitting a real job.
const definition = connectivityCheck as unknown as {
  id: string; maxDuration: number;
  run: (payload: { message?: string }) => Promise<{ ok: boolean; message: string }>;
};

describe("development connectivity task", () => {
  it("exports a short-running task with a deterministic success result", async () => {
    expect(definition.id).toBe("connectivity-check");
    expect(definition.maxDuration).toBe(30);
    expect(await definition.run({})).toEqual({ ok: true, message: "FrameFoundry development worker is connected." });
  });
  it("bounds the echoed message and never logs the payload", async () => {
    expect((await definition.run({ message: "x".repeat(1000) })).message).toHaveLength(200);
    expect(mocks.info).toHaveBeenCalledWith("Trigger.dev connectivity check completed");
  });
});
