import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false, noarchive: true },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
