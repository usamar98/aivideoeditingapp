import Link from "next/link";
import { BrandMark } from "@/components/studio/brand-mark";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";

export function SiteHeader() {
  return <header className="mx-auto flex min-h-24 max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-2 px-6 py-4 lg:px-10">
    <Link href="/" aria-label="ETA home"><BrandMark /></Link>
    <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap gap-x-6 text-sm sm:order-none sm:w-auto"><Link className="py-2" href="/features">Features</Link><Link className="py-2" href="/pricing">Pricing</Link><Link className="py-2" href="/guides">Guides</Link></nav>
    <Button asChild className="rounded-full"><Link href="/studio">Open studio</Link></Button>
  </header>;
}

export function SiteFooter() {
  return <footer className="mx-auto mt-8 flex max-w-7xl flex-wrap items-center justify-between gap-6 border-t border-border px-6 py-8 text-sm lg:px-10">
    <Link href="/" aria-label="ETA home"><BrandMark /></Link>
    <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3"><Link href="/features">Features</Link><Link href="/pricing">Pricing</Link><Link href="/guides">Guides</Link><Link href="/about">About ETA</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></nav>
    <a className="break-all text-muted-foreground" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
  </footer>;
}

export function MarketingPage({ title, description, eyebrow, children }: { title: string; description: string; eyebrow: string; children: React.ReactNode }) {
  return <><SiteHeader /><main id="main-content" className="mx-auto max-w-6xl px-6 pb-14 pt-12 sm:px-8"><p className="eyebrow text-primary">{eyebrow}</p><h1 className="editorial mt-4 max-w-4xl text-4xl tracking-tight sm:text-5xl">{title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{description}</p><div className="mt-12 space-y-12">{children}</div></main><SiteFooter /></>;
}
