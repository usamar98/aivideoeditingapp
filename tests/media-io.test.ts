import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artifactStore, downloadProviderImage, readBoundedBody, streamToFile } from "../trigger/media-io";

const directories: string[] = [];
async function destination() {
  const directory = await mkdtemp(path.join(tmpdir(), "media-io-test-"));
  directories.push(directory);
  return path.join(directory, "media.bin");
}
const activeSignal = () => new AbortController().signal;
const body = (text: string) => new Response(text).body!;

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("bounded media streams", () => {
  it("streams media to disk and bounds JSON collected in memory", async () => {
    const file = await destination();
    await streamToFile(body("12345678"), file, 8, activeSignal());
    expect(await readFile(file, "utf8")).toBe("12345678");
    expect((await readBoundedBody(body('{"ok":true}'), 32, activeSignal())).toString()).toBe('{"ok":true}');
    await expect(readBoundedBody(body("123456789"), 8, activeSignal())).rejects.toThrow("size limit");
  });
  it("rejects empty and oversized transfers and removes partial files", async () => {
    for (const value of ["", "123456789"]) {
      const file = await destination();
      await expect(streamToFile(body(value), file, 8, activeSignal())).rejects.toThrow();
      await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });
  it("cancels an in-flight stream and removes its partial file", async () => {
    const file = await destination();
    const controller = new AbortController();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(source) { source.enqueue(new TextEncoder().encode("partial")); },
      cancel,
    });
    const transfer = streamToFile(stream, file, 100, controller.signal);
    const rejected = expect(transfer).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(cancel).toHaveBeenCalled();
    await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("propagates interrupted downloads rather than accepting a partial checkpoint", async () => {
    const file = await destination();
    const stream = new ReadableStream<Uint8Array>({
      start(source) { source.enqueue(new Uint8Array([1])); source.error(new Error("connection lost")); },
    });
    await expect(streamToFile(stream, file, 100, activeSignal())).rejects.toThrow("connection lost");
    await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function storage(fetcher: typeof fetch, checkpoint = vi.fn(async () => {})) {
  const client = createClient("https://storage-test.supabase.co", "test-key", {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false },
  });
  return artifactStore(client.storage.from("private-media"), "workspace/user/faceless/job", activeSignal(), checkpoint);
}

describe("artifact transfers using the installed Supabase SDK", () => {
  it("uses the streaming download builder and private artifact path", async () => {
    const file = await destination();
    const response = new Response("media");
    response.blob = vi.fn(() => { throw new Error("Must not buffer a Blob"); });
    const fetcher = vi.fn<typeof fetch>(async () => response);
    expect(await storage(fetcher).loadFile("clip-0.mp4", file, 100)).toBe(true);
    expect(await readFile(file, "utf8")).toBe("media");
    expect(fetcher.mock.calls[0][0]).toContain("/object/private-media/workspace/user/faceless/job/clip-0.mp4");
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(response.blob).not.toHaveBeenCalled();
  });
  it("treats only missing checkpoints as cache misses", async () => {
    const file = await destination();
    const missing = storage(async () => new Response(JSON.stringify({ message: "Object not found", statusCode: "404" }), { status: 404 }));
    expect(await missing.loadFile("clip.mp4", file, 100)).toBe(false);
    await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    const unavailable = storage(async () => new Response(JSON.stringify({ message: "Unavailable" }), { status: 503 }));
    await expect(unavailable.loadFile("clip.mp4", file, 100)).rejects.toThrow("stopping to avoid duplicate provider charges");
  });
  it("uploads from a file stream with a content length instead of a whole-video Buffer", async () => {
    const file = await destination();
    await writeFile(file, "video-bytes");
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.body).toBeInstanceOf(Readable);
      expect(new Headers(init?.headers).get("content-length")).toBe("11");
      expect(new Headers(init?.headers).get("content-type")).toBe("video/mp4");
      const chunks = [];
      for await (const chunk of init!.body as unknown as Readable) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe("video-bytes");
      return new Response(JSON.stringify({ Id: "artifact", Key: "path" }));
    });
    await storage(fetcher).saveFile("video.mp4", file, "video/mp4", 100);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("checks cancellation before touching checkpoint storage", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const checkpoint = vi.fn(async () => { throw new Error("Job stopped"); });
    const store = storage(fetcher, checkpoint);
    const file = await destination();
    await expect(store.loadFile("clip.mp4", file, 100)).rejects.toThrow("Job stopped");
    await expect(store.saveFile("clip.mp4", file, "video/mp4", 100)).rejects.toThrow("Job stopped");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("closes the file stream if an upload fails", async () => {
    const file = await destination();
    await writeFile(file, "video-bytes");
    let uploadBody: Readable | undefined;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      uploadBody = init?.body as unknown as Readable;
      return new Response(JSON.stringify({ message: "Unavailable" }), { status: 503 });
    });
    await expect(storage(fetcher).saveFile("video.mp4", file, "video/mp4", 100)).rejects.toThrow("persist");
    expect(uploadBody?.destroyed).toBe(true);
  });
  it("does not upload empty or oversized artifacts", async () => {
    const file = await destination();
    const fetcher = vi.fn<typeof fetch>();
    for (const value of ["", "too large"]) {
      await writeFile(file, value);
      await expect(storage(fetcher).saveFile("clip.mp4", file, "video/mp4", 4)).rejects.toThrow("size");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("provider image streaming", () => {
  it("retains the HTTPS fal.media allowlist", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const url of ["http://fal.media/image", "https://evilfal.media/image", "https://fal.media.evil.test/image"]) {
      await expect(downloadProviderImage(url, await destination(), activeSignal())).rejects.toThrow("host");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("streams valid images and disables redirects", async () => {
    const file = await destination();
    const fetcher = vi.fn(async () => new Response("image", { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetcher);
    await downloadProviderImage("https://v3.fal.media/image", file, activeSignal());
    expect(await readFile(file, "utf8")).toBe("image");
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
  });
  it("rejects non-image responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not an image")));
    await expect(downloadProviderImage("https://fal.media/image", await destination(), activeSignal())).rejects.toThrow("download failed");
  });
});
