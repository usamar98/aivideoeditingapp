import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Use the image renderer already shipped with our pinned Next.js installation.
const requireNext = createRequire(import.meta.resolve("next/package.json"));
const sharp = requireNext("sharp");
const root = new URL("../", import.meta.url);
const symbol = await readFile(new URL("public/brand/eta-symbol.svg", root), "utf8");
const wordmark = await readFile(new URL("public/brand/eta-wordmark.svg", root), "utf8");
const contents = (svg) => svg.replace(/<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>.*?<\/title>/s, "").trim();

// The same two master vectors produce the full lockup and every browser icon.
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="216" height="64" viewBox="0 0 216 64" fill="none">
  <title>ETA — AI video studio</title>
  <g>${contents(symbol)}</g>
  <g transform="translate(84 3)">${contents(wordmark)}</g>
  <text x="85" y="60" fill="#526686" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="600" letter-spacing="2.05">AI VIDEO STUDIO</text>
</svg>
`;

await writeFile(new URL("public/brand/eta-logo.svg", root), logo);
await sharp(Buffer.from(logo)).resize(864, 256).png().toFile(fileURLToPath(new URL("public/brand/eta-logo.png", root)));
await writeFile(new URL("src/app/icon.svg", root), symbol);
await sharp(Buffer.from(symbol)).resize(180, 180).png().toFile(fileURLToPath(new URL("src/app/apple-icon.png", root)));

// ICO embeds a directory of PNG frames for small tabs and high-DPI shortcuts.
const sizes = [16, 32, 48, 64, 256];
const frames = await Promise.all(sizes.map((size) => sharp(Buffer.from(symbol)).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] === 256 ? 0 : sizes[index];
  header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL("src/app/favicon.ico", root), Buffer.concat([header, ...frames]));
console.log("Generated ETA logo, SVG favicon, five-size ICO, and Apple touch icon.");
