import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_WEBHOOK_AGE_SECONDS = 300;

export function verifyPaddleWebhook(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Paddle webhook verification is unavailable.");
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(";").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "ts")?.[1];
  const signatures = parts.filter(([key]) => key === "h1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > MAX_WEBHOOK_AGE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);

  return signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  });
}
