export type PreviewPlaybackMode = "auto" | "play" | "pause";

const playbackOwners = new WeakMap<HTMLVideoElement, symbol>();

/** Observe playback without downloading/decoding off-screen marketing videos. */
export function watchPreviewVideo(video: HTMLVideoElement, mode: PreviewPlaybackMode) {
  const owner = Symbol("preview playback");
  playbackOwners.set(video, owner);
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
  let visible = false;
  let disposed = false;
  let pending = false;
  let retryAfterPending = false;
  const shouldPlay = () => !disposed && visible && !document.hidden && mode !== "pause"
    && (mode === "play" || (!preference.matches && !connection?.saveData));

  function synchronize() {
    if (!shouldPlay()) { video.pause(); return; }
    if (!video.paused) return;
    if (pending) { retryAfterPending = true; return; }
    video.muted = true;
    pending = true;
    void video.play().then(() => {
      // A newer effect must not be paused by an older pending play() promise.
      if (playbackOwners.get(video) === owner && !shouldPlay()) video.pause();
    }).catch(() => { /* The poster and accessible play action remain if autoplay is blocked. */ })
      .finally(() => {
        pending = false;
        // A tab can become visible again before a canceled play() settles.
        if (retryAfterPending) {
          retryAfterPending = false;
          if (playbackOwners.get(video) === owner && shouldPlay()) synchronize();
        }
      });
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    synchronize();
  }, { threshold: 0.05 });
  observer.observe(video);
  document.addEventListener("visibilitychange", synchronize);
  preference.addEventListener("change", synchronize);
  connection?.addEventListener("change", synchronize);
  return () => {
    disposed = true;
    observer.disconnect();
    document.removeEventListener("visibilitychange", synchronize);
    preference.removeEventListener("change", synchronize);
    connection?.removeEventListener("change", synchronize);
    video.pause();
  };
}
