import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getViewer: mocks.viewer }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/studio/anime-studio", () => ({ AnimeStudio: () => createElement("div", { "data-testid": "static-anime" }, "Static Anime Studio") }));

import AnimePage, { metadata } from "@/app/studio/anime/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
});

describe("Anime Studio route boundary", () => {
  it("shows only the static prototype in explicit preview without loading an account", async () => {
    const html = renderToStaticMarkup(await AnimePage({ searchParams: Promise.resolve({ preview: "1" }) }));
    expect(html).toContain("Static Anime Studio");
    expect(mocks.viewer).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("requires the existing sign-in check for the normal workspace route", async () => {
    mocks.viewer.mockResolvedValue(null);
    await expect(AnimePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/login?next=/studio/anime");
    expect(mocks.viewer).toHaveBeenCalledOnce();
  });

  it("renders the same static UI for a signed-in viewer without passing account details to the client", async () => {
    mocks.viewer.mockResolvedValue({ id: "test-owner", email: "private@example.test", fixture: false });
    const html = renderToStaticMarkup(await AnimePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Static Anime Studio");
    expect(html).not.toContain("test-owner");
    expect(html).not.toContain("private@example.test");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps the prototype excluded from indexing", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false, noarchive: true });
  });
});
