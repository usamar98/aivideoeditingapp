"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Scissors, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createShortsUpload, createShortsProject } from "@/app/studio/shorts/actions";
import { SHORTS_ANALYSIS_CREDITS, SHORTS_MAX_BYTES, SHORTS_RENDER_CREDITS, type ShortsBrief } from "@/lib/shorts/schema";
import { ShortsPreview } from "./shorts-preview";

export const shortsField = "mt-2 block w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
export function ShortsCreator({ demo, projects, initialError }: { demo: boolean; projects: { id: string; title: string; status: string }[]; initialError: string | null }) {
  const router = useRouter(), cancelUpload = useRef<(() => void) | null>(null), savedAsset = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition(), [file, setFile] = useState<File | null>(null), [error, setError] = useState(initialError || ""), [progress, setProgress] = useState(0), [phase, setPhase] = useState("");
  const [brief, setBrief] = useState({ title: "", context: "", language: "auto" as ShortsBrief["language"], targetSeconds: 30 as 30 | 45 | 60, clipCount: 3 });
  const [rights, setRights] = useState(false);
  useEffect(() => () => { cancelUpload.current?.(); }, []);
  function submit() {
    if (demo || !file) return;
    setError("");
    startTransition(async () => {
      try {
        if (!savedAsset.current) {
          const mime = file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "");
          if (!["video/mp4", "video/quicktime", "video/webm"].includes(mime) || file.size > SHORTS_MAX_BYTES || !file.size) throw new Error("Choose an MP4, MOV or WebM video up to 200 MB.");
          setPhase("Preparing private upload…");
          const result = await createShortsUpload({ mime, size: file.size });
          if (result.error || !result.token || !result.path || !result.assetId) throw new Error(result.error || "Could not prepare upload.");
          const tus = await import("tus-js-client"), base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
          if (base.hostname.endsWith(".supabase.co")) base.hostname = base.hostname.replace(".supabase.co", ".storage.supabase.co");
          await new Promise<void>((resolve, reject) => {
            let stopped = false;
            setUploading(true);
            const upload = new tus.Upload(file, { endpoint: `${base.origin}/storage/v1/upload/resumable`, headers: { "x-signature": result.token! }, chunkSize: 6 * 1024 * 1024,
              retryDelays: [0, 3000, 5000, 10000], uploadDataDuringCreation: true, removeFingerprintOnSuccess: true, storeFingerprintForResuming: false,
              metadata: { bucketName: "private-media", objectName: result.path!, contentType: mime, cacheControl: "3600" },
              onProgress: (bytes, total) => { setProgress(Math.round(bytes / total * 100)); setPhase("Uploading your video…"); },
              onError: () => reject(new Error("Upload interrupted. Retry on a stable connection.")), onSuccess: () => { if (!stopped) { cancelUpload.current = null; resolve(); } },
            });
            cancelUpload.current = () => {
              stopped = true;
              // Stop browser requests, without deleting any existing media.
              void upload.abort().finally(() => reject(new Error("Upload stopped. No processing credits were charged."))).catch(() => undefined);
            };
            upload.start();
          });
          setUploading(false);
          savedAsset.current = result.assetId;
        }
        setPhase("Saving project…");
        const saved = await createShortsProject({ ...brief, sourceAssetId: savedAsset.current, rightsConfirmed: rights });
        if (saved.error || !saved.id) throw new Error(saved.error || "Could not save project.");
        router.push(`/studio/shorts/${saved.id}`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create Shorts project."); }
      finally { cancelUpload.current = null; setUploading(false); setPhase(""); }
    });
  }
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <p className="eyebrow text-primary">Podcast & video → Shorts</p><h1 className="editorial mt-4 text-4xl leading-tight sm:text-6xl">Long conversations.<br /><span className="italic text-primary">Shorts worth sharing.</span></h1><p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">Find the insight, story or useful answer hiding in your recording. Review the cuts, frame your speakers and turn the original footage into captioned vertical videos.</p>
    {demo && <p className="mt-6 rounded-xl bg-accent/50 p-4 text-sm">Studio preview. No uploads or paid calls. <Link className="text-primary underline" href="/studio/shorts/demo">Try the sample clip editor</Link> or <Link className="text-primary underline" href="/login?next=/studio/shorts">sign in</Link>.</p>}
    <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"><form onSubmit={(e) => { e.preventDefault(); submit(); }} className="min-w-0 rounded-3xl border border-border bg-card p-6 sm:p-8"><fieldset disabled={pending} className="min-w-0 space-y-6">
      <h2 className="flex items-center gap-2 font-semibold"><UploadCloud className="size-5 text-primary" />Bring your recording</h2>
      <label className="block rounded-2xl border border-dashed border-primary/30 p-5 text-sm">Source video<input type="file" accept="video/mp4,video/quicktime,video/webm,.mov" disabled={demo} onChange={(e) => { setFile(e.target.files?.[0] || null); savedAsset.current = null; setProgress(0); }} className="mt-4 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:p-2 file:text-primary" /><span className="mt-3 block text-xs leading-6 text-muted-foreground">MP4, MOV or WebM · up to 200 MB / 1080p · 30 seconds–30 minutes · spoken audio required. Upload video podcasts, not audio-only files.</span></label>
      <label className="block text-xs font-semibold">Project name<input className={shortsField} required minLength={2} maxLength={100} value={brief.title} onChange={(e) => setBrief({ ...brief, title: e.target.value })} placeholder="e.g. A conversation about creative habits" /></label>
      <label className="block text-xs font-semibold">What should we look for? <span className="font-normal">(optional)</span><textarea className={shortsField} rows={3} maxLength={800} value={brief.context} onChange={(e) => setBrief({ ...brief, context: e.target.value })} placeholder="Useful tips for beginners, an interesting story, or a clear answer…" /></label>
      <div className="grid gap-4 sm:grid-cols-3"><label className="text-xs font-semibold">Spoken language<select className={shortsField} value={brief.language} onChange={(e) => setBrief({ ...brief, language: e.target.value as ShortsBrief["language"] })}>{Object.entries({ auto: "Auto detect", en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", hi: "Hindi", ur: "Urdu", ar: "Arabic" }).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="text-xs font-semibold">Target length<select className={shortsField} value={brief.targetSeconds} onChange={(e) => setBrief({ ...brief, targetSeconds: Number(e.target.value) as 30 | 45 | 60 })}>{[30, 45, 60].map((n) => <option key={n} value={n}>{n} seconds</option>)}</select></label><label className="text-xs font-semibold">Find up to<select className={shortsField} value={brief.clipCount} onChange={(e) => setBrief({ ...brief, clipCount: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} clips</option>)}</select></label></div>
      <label className="flex items-start gap-3 text-xs leading-6 text-muted-foreground"><input required type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1.5 accent-primary" />I have permission to process and republish this recording, including the speakers’ appearances and voices. I agree to send its audio and transcript to fal’s AI providers and will review the results.</label>
      <p className="text-xs leading-6 text-muted-foreground">Analysis: <strong>{SHORTS_ANALYSIS_CREDITS} credits</strong>. Export: <strong>{SHORTS_RENDER_CREDITS} credits per selected clip</strong>. Completed analysis remains charged if you decide not to export. Saving a project is free.</p>
      <Button className="w-full" size="lg" disabled={demo || pending || !file || !rights} type="submit">{pending ? <LoaderCircle className="animate-spin" /> : <Scissors />}{phase || "Save video & continue"}<ArrowRight /></Button>
      {pending && <div role="status" aria-live="polite"><progress className="h-2 w-full accent-primary" max={100} value={progress} /><p className="mt-2 text-xs text-muted-foreground">{phase} {progress}% — network interruptions retry automatically.</p></div>}
    </fieldset>{uploading && <Button type="button" variant="outline" className="mt-4" onClick={() => cancelUpload.current?.()}>Stop upload</Button>}{error && <p role="alert" className="mt-5 rounded-xl border border-destructive/30 p-3 text-sm">{error}</p>}</form>
    <aside className="space-y-5"><ShortsPreview /><div className="rounded-2xl border border-border bg-card p-6"><h2 className="font-semibold">Your original footage. Your final say.</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">No regenerated faces or synthetic voices. Edit start/end times, choose a caption style, and set speaker positions before exporting 720 × 1280 MP4s with separate SRT captions.</p><p className="mt-3 text-xs leading-6 text-muted-foreground">Face-follow is assisted framing, not guaranteed active-speaker recognition. Use manual crop or full-frame fit for difficult camera angles. No YouTube importing or automatic social posting in this release.</p></div></aside></div>
    {!!projects.length && <section className="mt-12"><h2 className="text-xl font-semibold">Your Shorts projects</h2><div className="mt-5 grid gap-4 sm:grid-cols-3">{projects.map((p) => <Link key={p.id} href={`/studio/shorts/${p.id}`} className="rounded-2xl border border-border bg-card p-5 hover:border-primary"><p className="text-xs capitalize text-primary">{p.status}</p><h3 className="mt-3 font-semibold">{p.title}</h3><p className="mt-5 text-xs">Open clip workspace →</p></Link>)}</div></section>}
  </main>;
}
