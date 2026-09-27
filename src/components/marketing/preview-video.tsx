"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { watchPreviewVideo, type PreviewPlaybackMode } from "./preview-playback";

type PreviewVideoProps = {
  src?: string;
  sources?: readonly { src: string; type: string }[];
  poster?: string;
  label: string;
  describedBy?: string;
  className?: string;
  videoClassName?: string;
  width?: number;
  height?: number;
};

/** Silent marketing loops only. Editing/export players keep their native controls. */
export function PreviewVideo({ src, sources, poster, label, describedBy, className, videoClassName, width, height }: PreviewVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<PreviewPlaybackMode>("auto");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    return watchPreviewVideo(video, mode);
  }, [mode, src]);

  return <div className={cn("group relative isolate", className)} data-preview-video>
    <video ref={ref} src={src} loop muted playsInline preload="none" disablePictureInPicture disableRemotePlayback
      poster={poster} width={width} height={height} aria-label={label} aria-describedby={describedBy}
      className={cn("h-full w-full object-cover", videoClassName)}
      onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)}>
      {sources?.map((source) => <source key={source.src} src={source.src} type={source.type} />)}
      Your browser does not support this video preview.
    </video>
    <button type="button" onClick={() => setMode(playing ? "pause" : "play")}
      aria-label={`${playing ? "Pause" : "Play"} preview: ${label}`} aria-pressed={playing}
      title={playing ? "Pause preview" : "Play preview"}
      className="absolute bottom-3 right-3 z-10 flex size-11 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
      {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
    </button>
  </div>;
}
