import { cn } from "@/lib/utils";

export const socialPlatforms = ["TikTok", "Instagram", "Facebook", "YouTube"] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];

/** Decorative platform identifiers, not endorsements or connected accounts. */
export function SocialPlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-2xl text-white", platform === "TikTok" ? "bg-[#151515]" : platform === "Instagram" ? "bg-gradient-to-tr from-[#ffc45d] via-[#ea397d] to-[#7a38db]" : platform === "Facebook" ? "bg-[#1877f2]" : "bg-[#ff0033]", className)}>
    <svg viewBox="0 0 24 24" fill="none" className="size-[60%]">
      {platform === "Instagram" ? <g stroke="currentColor" strokeWidth="1.9"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.7" r="1" fill="currentColor" stroke="none" /></g> : platform === "YouTube" ? <><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" /><path d="m10 9 6 3-6 3Z" fill="#ff0033" /></> : platform === "Facebook" ? <path d="M14 22v-9h3l.5-4H14V6.8c0-1.1.4-1.8 1.9-1.8H18V1.4A26 26 0 0 0 14.9 1C11.8 1 10 2.9 10 6.3V9H7v4h3v9Z" fill="currentColor" /> : <>
        <path d="M14 3h3c.4 2.3 1.8 3.7 4 4v3a10 10 0 0 1-4-1.3V16a6 6 0 1 1-6-6h1v3h-1a3 3 0 1 0 3 3Z" fill="#25f4ee" transform="translate(-.7 .5)" />
        <path d="M14 3h3c.4 2.3 1.8 3.7 4 4v3a10 10 0 0 1-4-1.3V16a6 6 0 1 1-6-6h1v3h-1a3 3 0 1 0 3 3Z" fill="#fe2c55" transform="translate(.7 -.4)" />
        <path d="M14 3h3c.4 2.3 1.8 3.7 4 4v3a10 10 0 0 1-4-1.3V16a6 6 0 1 1-6-6h1v3h-1a3 3 0 1 0 3 3Z" fill="currentColor" />
      </>}
    </svg>
  </span>;
}
