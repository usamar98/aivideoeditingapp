import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadPart } from "@/lib/social/youtube";

// Exercise Node's real fetch redirect handling; a mocked Response bypassed the
// production failure where redirect: "error" rejects HTTP 308 before our parser.
const nativeFetch = globalThis.fetch;
const session = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test";
type Reply = { status: number; headers?: Record<string, string>; body?: string };
let replies: Reply[] = [];
let received: { headers: IncomingHttpHeaders; bytes: number }[] = [];
let endpoint: string;
const server = createServer(async (request, response) => {
  let bytes = 0;
  for await (const chunk of request) bytes += Buffer.byteLength(chunk);
  received.push({ headers: request.headers, bytes });
  const reply = replies.shift() || { status: 500 };
  response.writeHead(reply.status, reply.headers);
  response.end(reply.body);
});

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/upload`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => {
  replies = []; received = [];
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, options?: RequestInit) => {
    expect(String(input)).toBe(session);
    // Only the destination is replaced. Real fetch receives the exact production
    // method, body, headers and redirect policy. No external requests are made.
    return nativeFetch(endpoint, options);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("YouTube resumable uploads over real HTTP", () => {
  it.each([false, true])("reads an empty 308 checkpoint (Location present: %s) without following it", async location => {
    replies.push({ status: 308, headers: location ? { location: `${endpoint}/must-not-follow` } : {} });
    await expect(uploadPart("test-access", session, 8, 0)).resolves.toEqual({ offset: 0, videoId: null });
    expect(received).toHaveLength(1);
    expect(received[0].bytes).toBe(0);
    expect(received[0].headers["content-range"]).toBe("bytes */8");
    expect(globalThis.fetch).toHaveBeenCalledWith(session, expect.objectContaining({ redirect: "manual", cache: "no-store" }));
  });

  it("handles a partial chunk, reconciles its saved checkpoint, and completes without duplicate bytes", async () => {
    replies.push(
      { status: 308, headers: { range: "bytes=0-3" } },
      { status: 308, headers: { range: "bytes=0-3" } },
      { status: 201, headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "abcdefghijk" }) },
    );
    await expect(uploadPart("test-access", session, 8, 0, new Uint8Array([1, 2, 3, 4]))).resolves.toEqual({ offset: 4, videoId: null });
    await expect(uploadPart("test-access", session, 8, 0)).resolves.toEqual({ offset: 4, videoId: null });
    await expect(uploadPart("test-access", session, 8, 4, new Uint8Array([5, 6, 7, 8]))).resolves.toEqual({ offset: 8, videoId: "abcdefghijk" });
    expect(received.map(request => request.bytes)).toEqual([4, 0, 4]);
    expect(received.map(request => request.headers["content-range"])).toEqual(["bytes 0-3/8", "bytes */8", "bytes 4-7/8"]);
  });

  it.each([301, 302, 303, 307])("rejects HTTP %i without forwarding credentials or video bytes", async status => {
    replies.push({ status, headers: { location: `${endpoint}/must-not-follow` } });
    await expect(uploadPart("test-access", session, 8, 0)).rejects.toMatchObject({ code: "rejected" });
    expect(received).toHaveLength(1);
  });
});
