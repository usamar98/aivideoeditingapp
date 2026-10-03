import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { CartoonStyleGallery } from "@/components/studio/cartoon-style-gallery";
import { cartoonStyles, cartoonBriefSchema } from "@/lib/cartoons/schema";
import { cartoonDemo } from "@/lib/cartoons/demo";
import { cartoonPlannerPrompt, cartoonVideoInput } from "@/lib/cartoons/prompts";

describe("cartoon style examples", () => {
  it.each(Object.keys(cartoonStyles) as (keyof typeof cartoonStyles)[])("shows only %s as selected and keeps all existing styles available", (value) => {
    const onChange = vi.fn();
    const $ = load(renderToStaticMarkup(createElement(CartoonStyleGallery, { value, onChange })));
    expect($("button").length).toBe(4);
    expect($("button[aria-pressed='true']").length).toBe(1);
    expect($("button[aria-pressed='true']").attr("data-style")).toBe(value);
    expect($("button[type='button']").length).toBe(4);
    expect($("button").map((_, el) => $(el).attr("data-style")).get()).toEqual(Object.keys(cartoonStyles));
    expect(onChange).not.toHaveBeenCalled();
    expect($("img[alt^='AI-generated']").length).toBe(4);
    expect($("img[sizes][srcset]").length).toBe(4);
    expect($.text()).toContain("Your characters and final results will vary");
  });

  it("disables all style changes while a project is being saved", () => {
    const $ = load(renderToStaticMarkup(createElement(CartoonStyleGallery, { value: "3d", onChange: vi.fn(), disabled: true })));
    expect($("fieldset[disabled] button").length).toBe(4);
  });

  it.each(["cinematic-3d", "hand-drawn-2d", "anime", "clay"])("ships the local %s illustration", (name) => {
    const image = readFileSync(join(process.cwd(), "public", "examples", "cartoon-styles", `${name}.png`));
    expect(image.subarray(1, 4).toString()).toBe("PNG");
    expect(image.length).toBeGreaterThan(10_000);
  });

  it.each(Object.keys(cartoonStyles) as (keyof typeof cartoonStyles)[])("carries the %s selection through planning and rendering", (style) => {
    const brief = cartoonBriefSchema.parse({ ...cartoonDemo.brief, style });
    const story = cartoonDemo.storyboard!;
    expect(cartoonPlannerPrompt(brief)).toContain(cartoonStyles[style]);
    expect(cartoonVideoInput(story.scenes[0], story, brief, "frame", ["nova", "bolt"], "owner").input.prompt).toContain(cartoonStyles[style]);
  });
});
