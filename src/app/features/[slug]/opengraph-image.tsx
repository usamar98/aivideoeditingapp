import { ImageResponse } from "next/og";

import { brand } from "@/config/brand";
import { getFeatureData } from "@/lib/features/repository";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const feature = await getFeatureData(slug);
  const title = feature?.seo.heading || brand.description;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, color: "#182d4e", background: "#faf7ef" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, fontWeight: 700 }}><div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, background: "#2457d6", color: "#ffffff" }}>✦</div>{brand.name}</div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 950 }}><div style={{ fontSize: 18, textTransform: "uppercase", letterSpacing: 5, color: "#2457d6" }}>Your AI creative studio</div><div style={{ marginTop: 22, fontSize: 70, lineHeight: 1.05, fontWeight: 800, letterSpacing: -3 }}>{title}</div><div style={{ marginTop: 28, fontSize: 26, color: "#627087" }}>{feature?.seo.description || brand.description}</div></div>
    </div>,
    size,
  );
}
