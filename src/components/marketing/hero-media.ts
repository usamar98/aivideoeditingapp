import type { SocialPlatform } from "./social-platform-icon";

type HeroMedia = {
  id: string;
  label: string;
  detail: string;
  platform: SocialPlatform;
} & ({ kind: "image"; src: string; position?: string } | { kind: "video"; name: string });

/** Inspiration only: stock clips are not ETA exports or working clone demos. */
export const heroMediaRows: readonly (readonly HeroMedia[])[] = [
  [
    { id: "space", kind: "video", name: "hero-space", label: "Faceless stories", detail: "A universe of ideas", platform: "YouTube" },
    { id: "presenter", kind: "image", src: "/examples/presenter-product.webp", position: "22% center", label: "AI UGC", detail: "A fresh face for your ideas", platform: "Instagram" },
    { id: "sloth", kind: "video", name: "hero-cartoon", label: "Cartoon clips", detail: "Little characters. Big stories.", platform: "TikTok" },
    { id: "astronaut", kind: "image", src: "/examples/faceless-space.webp", label: "AI images", detail: "Beyond the everyday", platform: "Facebook" },
    { id: "portrait", kind: "video", name: "ai-portrait", label: "Digital clone · Soon", detail: "AI portrait inspiration only", platform: "Instagram" },
    { id: "characters", kind: "image", src: "/examples/cartoon-forest.webp", label: "Character worlds", detail: "Meet your next story", platform: "YouTube" },
  ],
  [
    { id: "forest", kind: "video", name: "fantasy-forest", label: "Dream in motion", detail: "A little cinematic magic", platform: "Facebook" },
    { id: "product", kind: "image", src: "/examples/presenter-product.webp", position: "82% center", label: "Product-ad ideas", detail: "Put your product in the frame", platform: "Instagram" },
    { id: "anime", kind: "video", name: "hero-anime", label: "Animated Shorts", detail: "Small screen. Big atmosphere.", platform: "TikTok" },
    { id: "cinematic", kind: "image", src: "/examples/faceless-space.webp", position: "65% center", label: "Visual storytelling", detail: "Start somewhere unexpected", platform: "YouTube" },
    { id: "beauty", kind: "video", name: "hero-ugc", label: "AI ad inspiration", detail: "Beauty, reimagined", platform: "Instagram" },
    { id: "fox", kind: "image", src: "/examples/cartoon-forest.webp", position: "40% center", label: "Cartoon inspiration", detail: "Make room for wonder", platform: "Facebook" },
  ],
];

export const heroStockCredits = [
  { name: "FREE24h · Space", href: "https://pixabay.com/videos/ai-generated-space-universe-galaxy-204371/" },
  { name: "Zeprexa · Cartoon", href: "https://pixabay.com/videos/ai-generated-sloth-lazy-funny-cute-230932/" },
  { name: "kalsstockmedia · Anime", href: "https://pixabay.com/videos/ai-generated-girl-cartoon-character-264168/" },
  { name: "Mangkubil · Beauty", href: "https://pixabay.com/videos/beauty-beauty-product-cosmetics-339378/" },
  { name: "michellemorseu · Forest", href: "https://pixabay.com/videos/fantasy-nature-dream-ai-generated-203486/" },
  { name: "freestock_video · Portrait", href: "https://pixabay.com/videos/ai-generated-woman-beauty-portrait-294774/" },
] as const;
