"use client";

import { useId, type CSSProperties } from "react";
import { Gem } from "lucide-react";
import { cn } from "@/lib/utils";

type CreditOption = { value: number; credits: number };

export function CreditSelector({ name, options, value, disabled = false, onChange }: {
  name: string;
  options: readonly CreditOption[];
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[index];
  if (!selected) return null;

  return <fieldset disabled={disabled} className="min-w-0 disabled:opacity-60">
    <legend className="sr-only">{name} credit allowance</legend>
    <label htmlFor={`${id}-slider`} className="sr-only">{name} credit allowance slider</label>
    <input
      id={`${id}-slider`}
      type="range"
      min={0}
      max={options.length - 1}
      step={1}
      value={index}
      aria-valuetext={`${selected.credits.toLocaleString("en-US")} credits`}
      onChange={(event) => {
        const option = options[Number(event.target.value)];
        if (option) onChange(option.value);
      }}
      style={{ "--credit-progress": `${options.length > 1 ? index / (options.length - 1) * 100 : 0}%` } as CSSProperties}
      className="pricing-credit-range w-full cursor-pointer disabled:cursor-not-allowed"
    />
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {options.map((option) => <label key={option.value} className="min-w-0 cursor-pointer">
        <input
          type="radio"
          name={`${id}-credits`}
          value={option.value}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
          aria-label={`${name}: ${option.credits.toLocaleString("en-US")} credits`}
          className="peer sr-only"
        />
        <span className={cn("flex min-h-10 items-center justify-center gap-1 rounded-full border border-transparent px-1.5 text-xs tabular-nums text-muted-foreground transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-not-allowed", value === option.value && "border-primary/20 bg-accent font-semibold text-foreground")}>
          <Gem aria-hidden="true" className="size-3 shrink-0 text-primary" />
          {option.credits.toLocaleString("en-US")}
        </span>
      </label>)}
    </div>
  </fieldset>;
}
