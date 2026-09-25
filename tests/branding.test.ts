import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brand } from "../src/config/brand";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));

describe("ETA branding", () => {
  it("uses the same name for visible branding and page metadata", () => {
    expect(brand.name).toBe("ETA");
    expect(brand.shortName).toBe("ETA");
  });

  it("keeps the SVG browser icon identical to the sidebar emblem", () => {
    expect(read("src/app/icon.svg")).toEqual(read("public/brand/eta-symbol.svg"));
  });

  it("ships a labeled, self-contained vector logo", () => {
    const logo = read("public/brand/eta-logo.svg").toString();
    expect(logo).toContain("<title>ETA — AI video studio</title>");
    expect(logo).toContain('viewBox="0 0 216 64"');
    expect(logo).not.toMatch(/<script|<image|href=/);
    expect(logo).toContain('transform="translate(84 3)"');
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
      expectedOffset += length;
    });
    expect(expectedOffset).toBe(ico.length);
  });

  it("ships a 180px Apple home-screen icon", () => {
    const png = read("src/app/apple-icon.png");
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });
});
