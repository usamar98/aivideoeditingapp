import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Use the image renderer already shipped with our pinned Next.js installation.
const requireNext = createRequire(import.meta.resolve("next/package.json"));
const sharp = requireNext("sharp");
const root = new URL("../", import.meta.url);
// Approved CAV artwork is the checked-in master. Never regenerate from a retired icon.
const master = await readFile(new URL("public/brand/create-ai-videos-monogram.png", root));
const iconPng = (size) => sharp(master).resize(size, size).flatten({ background: "#2457e6" }).png({ compressionLevel: 9 });
// Embed a tab/retina-sized copy so SVGs are self-contained and need no extra request.
const embedded = (await iconPng(256).toBuffer()).toString("base64");
const symbol = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
  <title>Create AI Videos — CAV monogram</title>
  <image width="64" height="64" href="data:image/png;base64,${embedded}"/>
</svg>
`;
const wordmark = await readFile(new URL("public/brand/create-ai-videos-wordmark.svg", root), "utf8");
const contents = (svg) => svg.replace(/<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>.*?<\/title>/s, "").trim();

// The approved monogram and existing wordmark produce every website brand asset.
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="64" viewBox="0 0 330 64" fill="none">
  <title>Create AI Videos — AI video studio</title>
  <g>${contents(symbol)}</g>
  <g transform="translate(84 0)">${contents(wordmark)}</g>
</svg>
`;

await writeFile(new URL("public/brand/create-ai-videos-logo.svg", root), logo);
await writeFile(new URL("public/brand/create-ai-videos-symbol.svg", root), symbol);
await sharp(Buffer.from(logo)).resize(1320, 256).png().toFile(fileURLToPath(new URL("public/brand/create-ai-videos-logo.png", root)));
await writeFile(new URL("src/app/icon.svg", root), symbol);
await iconPng(180).toFile(fileURLToPath(new URL("src/app/apple-icon.png", root)));
await iconPng(120).toFile(fileURLToPath(new URL("public/brand/create-ai-videos-oauth-120.png", root)));
await Promise.all([192, 512, 1024].map((size) => iconPng(size).toFile(fileURLToPath(new URL(`public/brand/create-ai-videos-icon-${size}.png`, root)))));

// Compatibility URLs for saved links and previously cached social previews.
// They show the new artwork; no retired E/ETA artwork remains publicly served.
await writeFile(new URL("public/brand/eta-symbol.svg", root), symbol);
await writeFile(new URL("public/brand/eta-wordmark.svg", root), wordmark);
await writeFile(new URL("public/brand/eta-logo.svg", root), logo);
await sharp(Buffer.from(logo)).resize(1320, 256).png().toFile(fileURLToPath(new URL("public/brand/eta-logo.png", root)));

// ICO embeds a directory of PNG frames for small tabs and high-DPI shortcuts.
const sizes = [16, 32, 48, 64, 256];
// Turbopack's ICO decoder requires RGBA PNG frames, even for opaque artwork.
const frames = await Promise.all(sizes.map((size) => iconPng(size).ensureAlpha().toBuffer()));
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
console.log("Generated Create AI Videos logo, SVG favicon, five-size ICO, and Apple touch icon.");
