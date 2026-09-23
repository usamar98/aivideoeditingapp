import { loadEnvFile } from "node:process";
import { setTimeout } from "node:timers/promises";
import { configure, runs, tasks } from "@trigger.dev/sdk";

class SetupCheckError extends Error {}

try {
  loadEnvFile(".env");
  const secretKey = process.env.TRIGGER_SECRET_KEY?.trim();
  if (!secretKey?.startsWith("tr_dev_")) {
    throw new SetupCheckError("Save this project's Development TRIGGER_SECRET_KEY in .env first. Production keys are not accepted by this check.");
  }
  configure({ secretKey });
  const options = { timeoutInMs: 10000, retry: { maxAttempts: 1 } };
  const handle = await tasks.trigger("connectivity-check", {
    message: "FrameFoundry development setup verified.",
  }, { ttl: "2m", tags: ["setup-verification"] }, options);
  console.log(`Submitted connectivity-check: ${handle.id}`);
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const run = await runs.retrieve(handle.id, options);
    if (run.isCompleted) {
      if (!run.isSuccess) throw new SetupCheckError(`Development check ended with ${run.status}. Inspect this run in Trigger.dev.`);
      if (!run.output?.ok) throw new SetupCheckError("Task completed but did not return the expected result.");
      console.log(JSON.stringify({ runId: run.id, status: run.status, output: run.output }, null, 2));
      process.exit(0);
    }
    await setTimeout(2000);
  }
  throw new SetupCheckError("The check did not finish within 90 seconds. Keep the Trigger.dev dev process running and inspect the submitted run in the dashboard.");
} catch (error) {
  // Do not print SDK errors: they can include request credentials or headers.
  const message = error instanceof SetupCheckError
    ? error.message
    : "Trigger.dev rejected the check. Verify the Development key, its trigger/read permissions, and the dev worker connection.";
  console.error(message);
  process.exitCode = 1;
}
