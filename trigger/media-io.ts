import { createReadStream, createWriteStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDIA_LIMITS = {
  json: 1024 * 1024,
  voice: 8 * 1024 * 1024,
  image: 20 * 1024 * 1024,
  clip: 50 * 1024 * 1024,
  video: 100 * 1024 * 1024,
} as const;

function byteLimit(maxBytes: number) {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      callback(bytes > maxBytes ? new Error("Media exceeds size limit") : null, chunk);
    },
    flush(callback) {
      callback(bytes === 0 ? new Error("Media body is empty") : null);
    },
  });
}

function readable(body: ReadableStream<Uint8Array>) {
  return Readable.fromWeb(body as NodeReadableStream<Uint8Array>);
}

// Only small, explicitly bounded JSON responses are collected in memory.
export async function readBoundedBody(body: ReadableStream<Uint8Array>, maxBytes: number, signal: AbortSignal) {
  const chunks: Buffer[] = [];
  await pipeline(readable(body), byteLimit(maxBytes), new Writable({
    write(chunk: Buffer, _encoding, callback) { chunks.push(chunk); callback(); },
  }), { signal });
  return Buffer.concat(chunks);
}

export async function streamToFile(body: ReadableStream<Uint8Array>, destination: string, maxBytes: number, signal: AbortSignal) {
  try {
    await pipeline(readable(body), byteLimit(maxBytes), createWriteStream(destination), { signal });
  } catch (error) {
    // destination is a task-owned file under its mkdtemp directory.
    await rm(destination, { force: true });
    throw error;
  }
}

type Bucket = ReturnType<SupabaseClient["storage"]["from"]>;

export function artifactStore(bucket: Bucket, prefix: string, signal: AbortSignal, checkpoint: () => Promise<void>) {
  async function download(name: string, transferSignal: AbortSignal) {
    await checkpoint();
    const { data, error } = await bucket.download(`${prefix}/${name}`, {}, { signal: transferSignal }).asStream();
    if (error) {
      const missing = ("statusCode" in error && String(error.statusCode) === "404")
        || ("status" in error && error.status === 404)
        || /not found|does not exist/i.test(error.message);
      if (missing) return null;
      throw new Error("Checkpoint storage is unavailable; stopping to avoid duplicate provider charges.");
    }
    if (!data) throw new Error("Checkpoint storage returned no data");
    return data;
  }

  return {
    async load(name: string, maxBytes: number = MEDIA_LIMITS.json) {
      const transferSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
      const body = await download(name, transferSignal);
      return body ? readBoundedBody(body, maxBytes, transferSignal) : null;
    },
    async loadFile(name: string, destination: string, maxBytes: number) {
      const transferSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
      const body = await download(name, transferSignal);
      if (!body) return false;
      await streamToFile(body, destination, maxBytes, transferSignal);
      return true;
    },
    async saveFile(name: string, source: string, contentType: string, maxBytes: number) {
      await checkpoint();
      const { size } = await stat(source);
      if (size === 0 || size > maxBytes) throw new Error("Artifact size is outside supported limits");
      const body = createReadStream(source, { signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]) });
      try {
        const { error } = await bucket.upload(`${prefix}/${name}`, body, {
          contentType, upsert: true, duplex: "half", headers: { "Content-Length": String(size) },
        });
        if (error) throw new Error("Could not persist generation artifact");
      } finally {
        body.destroy();
      }
    },
  };
}

export async function downloadProviderImage(raw: string, destination: string, signal: AbortSignal) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !(url.hostname === "fal.media" || url.hostname.endsWith(".fal.media"))) {
    throw new Error("Unexpected image download host");
  }
  const transferSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
  const response = await fetch(url, { redirect: "error", signal: transferSignal });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
    await response.body?.cancel();
    throw new Error("Image download failed");
  }
  if (!response.body) throw new Error("Image body missing");
  await streamToFile(response.body, destination, MEDIA_LIMITS.image, transferSignal);
}
