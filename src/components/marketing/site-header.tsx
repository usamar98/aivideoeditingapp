"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { BrandMark } from "@/components/studio/brand-mark";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { headerIsScrolled, headerServerSnapshot, subscribeHeaderScroll } from "./header-scroll";
import styles from "./site-header.module.css";

export function SiteHeader({ home = false }: { home?: boolean }) {
  const scrolled = useSyncExternalStore(subscribeHeaderScroll, headerIsScrolled, headerServerSnapshot);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const links = [
    { href: "/features", label: home ? "Creative tools" : "Features" },
    ...(home ? [{ href: "#how-it-works", label: "How it works" }] : []),
    { href: "/pricing", label: "Pricing" },
    { href: "/guides", label: "Guides" },
  ];

  useEffect(() => {
    if (!menuOpen) return;
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !surface.current?.contains(event.target)) setMenuOpen(false);
    }
    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggle.current?.focus();
    }
    const desktop = window.matchMedia("(min-width: 1024px)");
    const dismissOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    desktop.addEventListener("change", dismissOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
      desktop.removeEventListener("change", dismissOnDesktop);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return <div className={styles.space}>
    <header className={styles.header} data-site-header data-scrolled={scrolled}>
      <div ref={surface} className={styles.surface} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
      }}>
        <Link href="/" aria-label={`${brand.name} home`} className={styles.brand} onClick={closeMenu}><BrandMark /></Link>
        <nav aria-label="Main navigation" className={styles.navigation}>
          {links.map((link) => <Link key={link.href} href={link.href} className={styles.navLink}>{link.label}</Link>)}
        </nav>
        <div className={styles.actions}>
          <Link href="/login" className={styles.login} onClick={closeMenu}>Log in</Link>
          <Button asChild className={styles.studio}><Link href="/studio" onClick={closeMenu}><span className={styles.openLabel}>Open </span>studio <ArrowRight aria-hidden="true" /></Link></Button>
          <button ref={toggle} type="button" className={styles.toggle} aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
          </button>
        </div>
        <nav id={menuId} aria-label="Mobile navigation" className={styles.mobileMenu} hidden={!menuOpen}>
          <p className={styles.menuEyebrow}>Your next story starts here</p>
          {links.map((link) => <Link key={link.href} href={link.href} className={styles.mobileLink} onClick={closeMenu}>{link.label}<ArrowRight aria-hidden="true" size={16} /></Link>)}
          <Link href="/login" className={styles.mobileLink} onClick={closeMenu}>Log in<ArrowRight aria-hidden="true" size={16} /></Link>
        </nav>
      </div>
    </header>
  </div>;
}
