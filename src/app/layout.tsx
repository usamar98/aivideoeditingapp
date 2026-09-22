import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { brand } from "@/config/brand";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: { default: `${brand.name} — Your AI video creation studio`, template: `%s | ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", title: `${brand.name} — AI video creation studio`, description: brand.description, siteName: brand.name, url: "/" },
  twitter: { card: "summary_large_image", title: brand.name, description: brand.description },
  icons: { icon: "/icon.svg" },
  verification: brand.googleSiteVerification ? { google: brand.googleSiteVerification } : undefined,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf7ef", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
