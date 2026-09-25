import { additionalFiles, aptGet, ffmpeg } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_buramjqzkflsxgozeeew",
  dirs: ["./src/trigger"],
  // Gemini's SDK needs native WebSocket; the default "node" image is Node 21.
  runtime: "node-22",
  maxDuration: 1800,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    extensions: [ffmpeg({ version: "7" }), aptGet({ packages: ["fonts-dejavu-core", "fonts-noto-core", "python3-opencv", "opencv-data"] }), additionalFiles({ files: ["./trigger/shorts-faces.py"] })],
  },
});
