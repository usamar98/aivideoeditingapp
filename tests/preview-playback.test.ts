import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchPreviewVideo } from "@/components/marketing/preview-playback";

let page: EventTarget & { hidden: boolean };
let preference: EventTarget & { matches: boolean };
let connection: EventTarget & { saveData: boolean };
let callbacks: IntersectionObserverCallback[];
let cleanups: (() => void)[];
let disconnect: ReturnType<typeof vi.fn>;
let player: { paused: boolean; muted: boolean; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> };

const video = () => player as unknown as HTMLVideoElement;
const intersect = (visible: boolean, index = callbacks.length - 1) => callbacks[index](
  [{ target: video(), isIntersecting: visible } as unknown as IntersectionObserverEntry], {} as IntersectionObserver,
);

beforeEach(() => {
  page = Object.assign(new EventTarget(), { hidden: false });
  preference = Object.assign(new EventTarget(), { matches: false });
  connection = Object.assign(new EventTarget(), { saveData: false });
  callbacks = [];
  cleanups = [];
  disconnect = vi.fn();
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", { matchMedia: () => preference });
  vi.stubGlobal("navigator", { connection });
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
    observe = vi.fn();
    disconnect = disconnect;
  });
  player = { paused: true, muted: false, play: vi.fn(async () => { player.paused = false; }), pause: vi.fn(() => { player.paused = true; }) };
});

afterEach(() => { cleanups.forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); });

describe("silent marketing preview playback", () => {
  it("starts muted on visibility and pauses off screen", async () => {
    cleanups.push(watchPreviewVideo(video(), "auto"));
    expect(player.play).not.toHaveBeenCalled();
    intersect(true);
    await vi.waitFor(() => expect(player.paused).toBe(false));
    expect(player.muted).toBe(true);
    intersect(false);
    expect(player.paused).toBe(true);
  });

  it("pauses in background tabs and resumes when visible again", async () => {
    cleanups.push(watchPreviewVideo(video(), "auto"));
    intersect(true);
    await vi.waitFor(() => expect(player.paused).toBe(false));
    page.hidden = true;
    page.dispatchEvent(new Event("visibilitychange"));
    expect(player.paused).toBe(true);
    page.hidden = false;
    page.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(player.paused).toBe(false));
  });

  it.each(["motion", "data"])("respects %s preferences and changes", async (setting) => {
    if (setting === "motion") preference.matches = true;
    else connection.saveData = true;
    cleanups.push(watchPreviewVideo(video(), "auto"));
    intersect(true);
    expect(player.play).not.toHaveBeenCalled();
    preference.matches = false;
    connection.saveData = false;
    (setting === "motion" ? preference : connection).dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(player.paused).toBe(false));
    if (setting === "motion") preference.matches = true;
    else connection.saveData = true;
    (setting === "motion" ? preference : connection).dispatchEvent(new Event("change"));
    expect(player.paused).toBe(true);
  });

  it("never restarts an explicitly paused preview on visibility changes", () => {
    cleanups.push(watchPreviewVideo(video(), "pause"));
    intersect(true);
    page.dispatchEvent(new Event("visibilitychange"));
    preference.dispatchEvent(new Event("change"));
    expect(player.play).not.toHaveBeenCalled();
  });

  it("allows a deliberate play request even when automatic motion is disabled", async () => {
    preference.matches = true;
    connection.saveData = true;
    cleanups.push(watchPreviewVideo(video(), "play"));
    intersect(true);
    await vi.waitFor(() => expect(player.paused).toBe(false));
    expect(player.muted).toBe(true);
  });

  it("handles browsers that block autoplay without an unhandled rejection", async () => {
    player.play.mockRejectedValue(new Error("NotAllowedError"));
    cleanups.push(watchPreviewVideo(video(), "auto"));
    intersect(true);
    await vi.waitFor(() => expect(player.play).toHaveBeenCalledOnce());
    expect(player.paused).toBe(true);
  });

  it("cleans up observers and preference/visibility listeners", async () => {
    const cleanup = watchPreviewVideo(video(), "auto");
    intersect(true);
    await vi.waitFor(() => expect(player.paused).toBe(false));
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(player.paused).toBe(true);
    player.play.mockClear();
    page.dispatchEvent(new Event("visibilitychange"));
    preference.dispatchEvent(new Event("change"));
    connection.dispatchEvent(new Event("change"));
    expect(player.play).not.toHaveBeenCalled();
  });

  it("does not let an old pending play promise pause a newly mounted controller", async () => {
    let resolveOld!: () => void;
    player.play.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveOld = resolve; }));
    const stopOld = watchPreviewVideo(video(), "auto");
    intersect(true);
    stopOld();
    cleanups.push(watchPreviewVideo(video(), "play"));
    intersect(true);
    await vi.waitFor(() => expect(player.paused).toBe(false));
    resolveOld();
    await Promise.resolve();
    expect(player.paused).toBe(false);
  });
});
