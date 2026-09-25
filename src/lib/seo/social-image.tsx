import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function socialImage(title: string, description: string) {
  const logo = await readFile(join(process.cwd(), "public/brand/eta-logo.png"), "base64");
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#faf7ef", color: "#082d55" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Satori renders embedded assets directly; next/image is not supported here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${logo}`} alt="ETA" width={216} height={64} />
        <div style={{ display: "flex", border: "1px solid #ccd5e3", borderRadius: 28, padding: "12px 24px", color: "#2457d6", fontSize: 20 }}>YOUR AI VIDEO STUDIO</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", fontSize: 62, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1, maxWidth: 1030 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 25, lineHeight: 1.45, color: "#4a6480", maxWidth: 1000 }}>{description}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #2457d6", paddingTop: 20, fontSize: 18 }}><span>IDEA → STORY → VIDEO</span><span>editingapp.live</span></div>
    </div>,
    { width: 1200, height: 630 },
  );
}
