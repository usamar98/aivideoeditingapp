import Link from "next/link";

export function SocialPlatformTabs({ active }: { active: "youtube" | "facebook" }) {
  return <nav aria-label="Publishing platform" className="mx-auto flex max-w-6xl gap-2 px-5 pt-6 sm:px-8">
    {([{ id: "youtube", href: "/studio/social", label: "YouTube" }, { id: "facebook", href: "/studio/social/facebook", label: "Facebook Pages" }] as const).map((item) =>
      <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-medium ${active === item.id ? "border-primary bg-primary text-white" : "border-border bg-card hover:bg-accent"}`}>{item.label}</Link>)}
  </nav>;
}
