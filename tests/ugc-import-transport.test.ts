import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:https", () => ({ request: network.request }));
import { fetchPublicProduct } from "@/lib/ugc/product-import";

type Reply = { status?: number; headers?: Record<string, string | undefined>; body?: string | Buffer };
function replies(...items: Reply[]) {
  for (const item of items) network.request.mockImplementationOnce((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      const response = Object.assign(new PassThrough(), { statusCode: item.status ?? 200, headers: { "content-type": "text/html", ...item.headers } });
      callback(response); response.end(item.body ?? "<title>Product</title>");
    };
    return request;
  });
}
beforeEach(() => { vi.resetAllMocks(); network.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]); });
describe("product import network boundary", () => {
  it("pins the checked public IP to the HTTPS connection without cookies", async () => {
    replies({});
    await expect(fetchPublicProduct("https://shop.example/product", "page")).resolves.toMatchObject({ status: 200 });
    expect(network.lookup).toHaveBeenCalledExactlyOnceWith("shop.example", { all: true });
    const options = network.request.mock.calls[0][1], callback = vi.fn();
    options.lookup("shop.example", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(options.agent).toBe(false); expect(options.family).toBe(4);
    expect(options.headers.Cookie).toBeUndefined(); expect(options.headers.Authorization).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("rejects mixed public and private DNS results before connecting", async () => {
    network.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    await expect(fetchPublicProduct("https://shop.example/product", "page")).rejects.toThrow(/Private/);
    expect(network.request).not.toHaveBeenCalled();
  });
  it("revalidates redirect DNS and refuses private redirect targets", async () => {
    network.lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]).mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
    replies({ status: 302, headers: { location: "https://another.example/product" } });
    await expect(fetchPublicProduct("https://shop.example/product", "page")).rejects.toThrow(/Private/);
    expect(network.request).toHaveBeenCalledTimes(1);
  });
  it("rejects HTTPS-to-HTTP redirects", async () => {
    replies({ status: 302, headers: { location: "http://another.example/product" } });
    await expect(fetchPublicProduct("https://shop.example/product", "page")).rejects.toThrow(/HTTPS/);
    expect(network.request).toHaveBeenCalledTimes(1);
  });
  it("limits even safe redirect chains to three redirects", async () => {
    replies(...Array.from({ length: 4 }, () => ({ status: 302, headers: { location: "/next" } })));
    await expect(fetchPublicProduct("https://shop.example/product", "page")).rejects.toThrow(/redirects/);
    expect(network.request).toHaveBeenCalledTimes(4);
  });
  it.each([
    { headers: { "content-length": "3000000" }, message: /size limit/ },
    { body: Buffer.alloc(2 * 1024 * 1024 + 1), message: /size limit/ },
    { headers: { "content-type": "application/json" }, message: /cannot be imported/ },
    { headers: { "content-encoding": "gzip" }, message: /cannot be imported/ },
  ])("bounds bodies and rejects unsupported responses ($message)", async ({ message, ...reply }) => {
    replies(reply);
    await expect(fetchPublicProduct("https://shop.example/product", "page")).rejects.toThrow(message);
  });
});
