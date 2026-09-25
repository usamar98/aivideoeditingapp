import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({
  task: <T,>(definition: T) => definition,
  defineConfig: <T,>(config: T) => config,
  logger: mocks,
}));
vi.mock("@trigger.dev/build/extensions/core", () => ({
  aptGet: vi.fn(),
  ffmpeg: vi.fn(),
  additionalFiles: vi.fn(),
}));
import { connectivityCheck } from "../src/trigger/connectivity-check";
import triggerConfig from "../trigger.config";

// The SDK is mocked to exercise the handler without submitting a real job.
const definition = connectivityCheck as unknown as {
  id: string; maxDuration: number;
  run: (payload: { message?: string }) => Promise<{
    ok: boolean;
    message: string;
    runtime: { node: string; webSocketAvailable: boolean };
  }>;
};

afterEach(() => vi.unstubAllGlobals());

describe("Trigger.dev runtime configuration", () => {
  it("pins the worker to Node 22 for Gemini native WebSocket support", () => {
    expect(triggerConfig.runtime).toBe("node-22");
  });
});

describe("worker connectivity task", () => {
  it("exports a short-running task with a deterministic success result", async () => {
    expect(definition.id).toBe("connectivity-check");
    expect(definition.maxDuration).toBe(30);
    expect(await definition.run({})).toEqual({
      ok: true,
      message: "FrameFoundry development worker is connected.",
      runtime: {
        node: process.versions.node,
        webSocketAvailable: typeof globalThis.WebSocket === "function",
      },
    });
  });
  it("bounds the echoed message and never logs the payload", async () => {
    expect((await definition.run({ message: "x".repeat(1000) })).message).toHaveLength(200);
    expect(mocks.info).toHaveBeenCalledWith("Trigger.dev connectivity check completed");
  });
  it("reports missing WebSocket support without calling an AI provider", async () => {
    vi.stubGlobal("WebSocket", undefined);
    expect((await definition.run({})).runtime.webSocketAvailable).toBe(false);
  });
  it("reports an available WebSocket constructor", async () => {
    vi.stubGlobal("WebSocket", class WebSocket {});
    expect((await definition.run({})).runtime.webSocketAvailable).toBe(true);
  });
});
