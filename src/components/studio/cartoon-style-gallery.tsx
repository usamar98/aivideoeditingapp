"use client";

import Image from "next/image";
import { Check, Palette } from "lucide-react";
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
  return <aside aria-label="Cartoon style examples" className="min-w-0 self-start xl:sticky xl:top-6 xl:col-start-1 xl:row-start-1 xl:row-span-3" data-testid="cartoon-style-gallery">
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="flex items-center gap-2 text-sm font-semibold"><Palette aria-hidden className="size-4 text-primary" /> Pick your look</legend>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Same idea. Four different worlds.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-1">
        {examples.map((example) => {
          const selected = value === example.style;
          const label = cartoonStyles[example.style];
          return <button key={example.style} type="button" title={example.detail} aria-label={`Use ${label} style`} aria-pressed={selected} onClick={() => onChange(example.style)} data-style={example.style} className={`group min-w-0 overflow-hidden rounded-2xl border bg-card text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60 ${selected ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary/50"}`}>
            <span className="relative block aspect-[3/2] overflow-hidden bg-accent">
              <Image src={example.image} alt={`AI-generated ${label} style example of a fox astronaut and a robot on the moon`} fill sizes="(min-width: 1536px) 216px, (min-width: 1280px) 184px, (min-width: 640px) 25vw, 50vw" className="object-cover" />
              {selected && <span aria-hidden className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"><Check className="size-3.5" /></span>}
            </span>
            <span className={`block px-3 py-2.5 text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{label}</span>
          </button>;
        })}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">AI-generated style references. Your characters and final results will vary.</p>
    </fieldset>
  </aside>;
}
