import type { Metadata } from "next";
import { publicMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  ...publicMetadata({
    title: "Studio",
    description: "Create and manage your AI video projects, choose creative tools and return to your saved work in the Create AI Videos studio.",
    path: "/studio",
    indexable: false,
  }),
  robots: { index: false, follow: false, noarchive: true },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
