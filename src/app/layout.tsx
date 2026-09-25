import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { brand } from "@/config/brand";
import { publicRobots } from "@/lib/seo/metadata";
import { identitySchema } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/marketing/json-ld";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: { default: `AI Video Generator for Faceless Videos & Cartoons | ${brand.name}`, template: `%s | ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  robots: publicRobots(),
  openGraph: { type: "website", title: `${brand.name} — AI video creation studio`, description: brand.description, siteName: brand.name, url: "/" },
  twitter: { card: "summary_large_image", title: brand.name, description: brand.description },
  verification: { ...(brand.googleSiteVerification ? { google: brand.googleSiteVerification } : {}), ...(brand.bingSiteVerification ? { other: { "msvalidate.01": brand.bingSiteVerification } } : {}) },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf7ef", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>
        <JsonLd data={identitySchema()} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
