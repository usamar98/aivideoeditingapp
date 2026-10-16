import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brand } from "../src/config/brand";
import { brandAsset } from "../src/config/brand-assets";
import { createRequire } from "node:module";

const sharp = createRequire(import.meta.resolve("next/package.json"))("sharp");

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));

describe("Create AI Videos branding", () => {
  it("uses the same name for visible branding and page metadata", () => {
    expect(brand.name).toBe("Create AI Videos");
    expect(brand.shortName).toBe("Create AI");
  });

  it("keeps the SVG browser icon identical to the sidebar emblem", () => {
    expect(read("src/app/icon.svg")).toEqual(read("public/brand/create-ai-videos-symbol.svg"));
  });

  it("ships a labeled, self-contained logo using the approved CAV artwork", () => {
    const logo = read("public/brand/create-ai-videos-logo.svg").toString();
    expect(logo).toContain("<title>Create AI Videos — AI video studio</title>");
    expect(logo).toContain('viewBox="0 0 330 64"');
    expect(logo).not.toMatch(/<script|href="https?:|href="\//);
    expect(logo).toContain('<image width="64" height="64" href="data:image/png;base64,');
    expect(logo).toContain('transform="translate(84 0)"');
  });

  it("embeds the approved master rather than the retired C/play icon", async () => {
    const symbol = read("public/brand/create-ai-videos-symbol.svg").toString();
    const image = symbol.match(/href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/);
    expect(image).not.toBeNull();
    const expected = await sharp(read("public/brand/create-ai-videos-monogram.png"))
      .resize(256, 256).flatten({ background: "#2457e6" }).png({ compressionLevel: 9 }).toBuffer();
    expect(Buffer.from(image![1], "base64")).toEqual(expected);
  });

  it("versions website and installed-app artwork to invalidate old cached logos", () => {
    expect(brandAsset("create-ai-videos-symbol.svg")).toBe("/brand/create-ai-videos-symbol.svg?v=cav-20261016");
    expect(read("src/components/studio/brand-mark.tsx").toString()).toContain("src={brandAsset(");
  });

  it("provides an opaque 120px consent-screen PNG under 1MB", async () => {
    const png = read("public/brand/create-ai-videos-oauth-120.png");
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(120);
    expect(meta.hasAlpha).toBe(false);
    expect(png.length).toBeLessThan(1_000_000);
  });

  it("includes valid favicon frames for tabs and high-DPI shortcuts", () => {
    const ico = read("src/app/favicon.ico");
    const sizes = [16, 32, 48, 64, 256];
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(sizes.length);
    let expectedOffset = 6 + sizes.length * 16;
    sizes.forEach((size, index) => {
      const entry = 6 + index * 16;
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(ico[entry] || 256).toBe(size);
      expect(ico[entry + 1] || 256).toBe(size);
      expect(offset).toBe(expectedOffset);
      const png = ico.subarray(offset, offset + length);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
      // ICO PNG frames must be 8-bit RGBA for Next.js/Turbopack decoding.
      expect(png[24]).toBe(8);
      expect(png[25]).toBe(6);
      expectedOffset += length;
    });
    expect(expectedOffset).toBe(ico.length);
  });

  it("ships a 180px Apple home-screen icon", () => {
    const png = read("src/app/apple-icon.png");
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });

  it.each([192, 512, 1024])("ships a %ipx icon for app shortcuts and provider branding", (size) => {
    const png = read(`public/brand/create-ai-videos-icon-${size}.png`);
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  });

  it("keeps previously shared asset URLs on the new artwork", () => {
    for (const file of ["symbol.svg", "wordmark.svg", "logo.svg", "logo.png"]) {
      expect(read(`public/brand/eta-${file}`)).toEqual(read(`public/brand/create-ai-videos-${file}`));
    }
  });
});
