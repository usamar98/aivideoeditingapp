"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { cartoonStyles, type CartoonBrief } from "@/lib/cartoons/schema";

const examples = [
  { style: "3d", image: "/examples/cartoon-styles/cinematic-3d.png", detail: "Depth, soft light & expressive faces" },
  { style: "2d", image: "/examples/cartoon-styles/hand-drawn-2d.png", detail: "Drawn lines & storybook textures" },
  { style: "anime", image: "/examples/cartoon-styles/anime.png", detail: "Bold expressions & cel shading" },
  { style: "clay", image: "/examples/cartoon-styles/clay.png", detail: "Handmade textures & playful shapes" },
] as const;

export function CartoonStyleGallery({ value, onChange, disabled = false }: {
  value: CartoonBrief["style"];
  onChange: (style: CartoonBrief["style"]) => void;
  disabled?: boolean;
}) {
  return <div className="min-w-0" data-testid="cartoon-style-gallery">
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-sm font-semibold">Animation style</legend>
      <div className="mt-3 grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
        {examples.map((example) => {
          const selected = value === example.style;
          const label = cartoonStyles[example.style];
          return <button key={example.style} type="button" title={example.detail} aria-label={`Use ${label} style`} aria-pressed={selected} onClick={() => onChange(example.style)} data-style={example.style} className={`group min-w-0 overflow-hidden rounded-xl border bg-card text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60 ${selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50"}`}>
            <span className="relative block aspect-[1.85] overflow-hidden bg-accent">
              <Image src={example.image} alt={`AI-generated ${label} style example of a fox astronaut and a robot on the moon`} fill sizes="(min-width: 1024px) 160px, (min-width: 480px) 24vw, 45vw" className="object-cover" />
              {selected && <span aria-hidden className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"><Check className="size-3.5" /></span>}
            </span>
            <span className={`block px-2 py-2 text-xs font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{label}</span>
          </button>;
        })}
      </div>
      <p className="sr-only">AI-generated style references. Your characters and final results will vary.</p>
    </fieldset>
  </div>;
}
