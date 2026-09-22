import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { brand } from "@/config/brand";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: { default: `${brand.name} — AI cartoon series studio`, template: `%s | ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", title: `${brand.name} — AI cartoon series studio`, description: brand.description, siteName: brand.name, url: "/" },
  twitter: { card: "summary_large_image", title: brand.name, description: brand.description },
  icons: { icon: "/icon.svg" },
  verification: brand.googleSiteVerification ? { google: brand.googleSiteVerification } : undefined,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07120f", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark antialiased`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
