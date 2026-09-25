import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import { productUrlSchema } from "./schema";
export { imageMime } from "./images";

export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}
export function validateProductUrl(raw: string) {
  const url = new URL(productUrlSchema.parse(raw));
  if (!url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)
    || (ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))))
    throw new Error("This is not a public product page.");
  url.hash = "";
  return url;
}

// DNS is validated AND pinned to the TLS connection. Checking then using fetch
// would allow a second DNS lookup (DNS rebinding). No cookies, credentials or JS.
export async function fetchPublicProduct(raw: string, kind: "page" | "image") {
  const signal = AbortSignal.timeout(15_000);
  let url = validateProductUrl(raw);
  for (let redirect = 0; redirect <= 3; redirect++) {
    signal.throwIfAborted();
    const addresses = await Promise.race([lookup(url.hostname, { all: true }), new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Product import timed out.")), { once: true });
    })]);
    if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new Error("Private or reserved addresses cannot be imported.");
    const pinned = addresses[0];
    const response = await new Promise<{ status: number; location?: string; type: string; bytes: Buffer }>((resolve, reject) => {
      const req = request(url, { signal, agent: false, family: pinned.family, lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
        headers: { "User-Agent": "ETA-Product-Import/1.0", Accept: kind === "page" ? "text/html" : "image/png,image/jpeg,image/webp", "Accept-Encoding": "identity" } }, (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) { res.destroy(); resolve({ status, location: res.headers.location, type: "", bytes: Buffer.alloc(0) }); return; }
        const type = (res.headers["content-type"] || "").split(";")[0].toLowerCase();
        const allowed = kind === "page" ? ["text/html", "application/xhtml+xml"] : ["image/png", "image/jpeg", "image/webp"];
        if (status !== 200 || !allowed.includes(type) || (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
          res.destroy(); reject(new Error("This page cannot be imported. Upload product photos and enter the details instead.")); return;
        }
        const limit = kind === "page" ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
        if (Number(res.headers["content-length"]) > limit) { res.destroy(); reject(new Error("Product file exceeds the size limit.")); return; }
        const chunks: Buffer[] = []; let size = 0;
        res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > limit) res.destroy(new Error("Product file exceeds the size limit.")); else chunks.push(chunk); });
        res.on("error", reject); res.on("end", () => resolve({ status, type, bytes: Buffer.concat(chunks) }));
      });
      req.on("error", () => reject(new Error("Could not reach this public product page. Upload images instead."))); req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location || redirect === 3) throw new Error("Too many product-page redirects.");
      url = validateProductUrl(new URL(response.location, url).href); continue;
    }
    if (!response.bytes.length) throw new Error("The product page returned no content.");
    return { ...response, url: url.href };
  }
  throw new Error("Product import failed.");
}

export function parseProductPage(html: string, url: string) {
  const $ = load(html);
  const clean = (value: unknown, limit: number) => typeof value === "string" ? load(value).text().replace(/\s+/g, " ").trim().slice(0, limit) : "";
  let product: Record<string, unknown> = {};
  const visit = (value: unknown, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 8) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach((entry) => visit(entry, depth + 1)); return; }
    const row = value as Record<string, unknown>;
    if (row["@type"] === "Product" || (Array.isArray(row["@type"]) && row["@type"].includes("Product"))) { if (!product.name) product = row; }
    if (row["@graph"]) visit(row["@graph"], depth + 1);
  };
  $('script[type="application/ld+json"]').slice(0, 15).each((_, node) => { try { visit(JSON.parse($(node).text())); } catch { /* Invalid merchant JSON is not executable. */ } });
  const meta = (name: string) => $(`meta[property="${name}"],meta[name="${name}"]`).first().attr("content") || "";
  const rawImages = Array.isArray(product.image) ? product.image : product.image ? [product.image] : [];
  rawImages.push(meta("og:image"));
  const images = [...new Set(rawImages.flatMap((value) => {
    const candidate = typeof value === "string" ? value : value && typeof value === "object" ? (value as { url?: unknown }).url : null;
    try { return typeof candidate === "string" && candidate ? [validateProductUrl(new URL(candidate, url).href).href] : []; } catch { return []; }
  }))].slice(0, 4);
  return { productName: clean(product.name || meta("og:title") || $("title").text(), 80),
    description: clean(product.description || meta("og:description") || meta("description"), 1200), images };
}
