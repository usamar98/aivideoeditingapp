import { logger, task } from "@trigger.dev/sdk";

// A small setup check: no database changes, AI provider calls, or app credits.
export const connectivityCheck = task({
  id: "connectivity-check",
  maxDuration: 30,
  retry: { maxAttempts: 1 },
  run: async (payload: { message?: string }) => {
    const message = typeof payload?.message === "string"
      ? payload.message.slice(0, 200)
      : "FrameFoundry development worker is connected.";
    logger.info("Trigger.dev connectivity check completed");
    return {
      ok: true,
      message,
      runtime: {
        node: process.versions.node,
        webSocketAvailable: typeof globalThis.WebSocket === "function",
      },
    };
  },
});
