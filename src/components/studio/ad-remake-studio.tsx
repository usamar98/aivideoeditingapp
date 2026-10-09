"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createAdRemakeUpload, createAdRemakeProject } from "@/app/studio/ad-remake/actions";
import { adRemakeBriefSchema, adRemakeCredits, adRemakeModels, adRemakeUploadSchema, validateAdRemakeSource, type AdRemakeBrief } from "@/lib/ad-remake/schema";

const field = "mt-2 block w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-primary/35";
type LocalFile = { file: File; url: string };
const mimeOf = (file: File) => file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : file.name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "");

export function AdRemakeStudio({ demo, projects, initialError }: { demo: boolean; projects: { id: string; title: string; status: string }[]; initialError: string | null }) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [source, setSource] = useState<LocalFile | null>(null), [photos, setPhotos] = useState<LocalFile[]>([]);
  const [info, setInfo] = useState<{ seconds: number; width: number; height: number } | null>(null);
  const [details, setDetails] = useState({ title: "", productName: "", instructions: "", model: "standard" as AdRemakeBrief["model"], keepAudio: false, cta: "", brandColor: "#183f3e" });
  const [rights, setRights] = useState(false), [error, setError] = useState(initialError), [phase, setPhase] = useState(""), [progress, setProgress] = useState(0);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const urls = useRef<string[]>([]), uploaded = useRef(new Map<File, string>()), stopUpload = useRef<(() => void) | null>(null);
  useEffect(() => () => { stopUpload.current?.(); urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  function choose(files: File[], kind: "video" | "image") {
    if (!files.length) return;
    if (kind === "image" && files.length > 4) { setError("Choose 1–4 images of the same product."); return; }
    for (const file of files) {
      const valid = adRemakeUploadSchema.safeParse({ kind, mime: mimeOf(file), size: file.size });
      if (!valid.success) { setError(kind === "video" ? "Use an MP4 or MOV up to 100 MB." : "Use PNG, JPEG or WebP images up to 8 MB each."); return; }
    }
    const local = files.map(file => { const url = URL.createObjectURL(file); urls.current.push(url); return { file, url }; });
    if (kind === "video") { if (source) URL.revokeObjectURL(source.url); setSource(local[0]); setInfo(null); }
    else { photos.forEach(photo => URL.revokeObjectURL(photo.url)); setPhotos(local); }
    setError(null); setRights(false);
  }
  async function upload(file: File, kind: "video" | "image") {
    const saved = uploaded.current.get(file); if (saved) return saved;
    const mime = mimeOf(file), prepared = await createAdRemakeUpload({ kind, mime, size: file.size });
    if (prepared.error || !prepared.assetId || !prepared.path || !prepared.token) throw new Error(prepared.error || "Could not prepare upload.");
    if (kind === "video") {
      const tus = await import("tus-js-client"), base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
      if (base.hostname.endsWith(".supabase.co")) base.hostname = base.hostname.replace(".supabase.co", ".storage.supabase.co");
      setUploadingVideo(true);
      try { await new Promise<void>((resolve, reject) => {
        const request = new tus.Upload(file, { endpoint: `${base.origin}/storage/v1/upload/resumable`, headers: { "x-signature": prepared.token! }, chunkSize: 6 * 1024 * 1024,
          retryDelays: [0, 3000, 5000, 10000], uploadDataDuringCreation: true, removeFingerprintOnSuccess: true, storeFingerprintForResuming: false,
          metadata: { bucketName: "private-media", objectName: prepared.path!, contentType: mime, cacheControl: "3600" },
          onProgress: (bytes, total) => setProgress(Math.round(bytes / total * 100)),
          onError: () => reject(new Error("Video upload interrupted. Please retry.")), onSuccess: () => { stopUpload.current = null; resolve(); },
        });
        stopUpload.current = () => { stopUpload.current = null; void request.abort().finally(() => reject(new Error("Upload stopped. No credits were charged."))).catch(() => undefined); };
        request.start();
      }); } finally { setUploadingVideo(false); }
    } else {
      const db = createClient(); if (!db) throw new Error("Storage is not connected.");
      if ((await db.storage.from("private-media").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: mime })).error) throw new Error("Product image upload failed. Please retry.");
    }
    uploaded.current.set(file, prepared.assetId); return prepared.assetId;
  }
  function save() {
    if (!source || !info) { setError("Choose a playable reference clip first."); return; }
    const seconds = Math.ceil(info.seconds);
    try { validateAdRemakeSource(info, seconds); } catch (cause) { setError((cause as Error).message); return; }
    // Validate the entire brief before sending any files. IDs are assigned after upload.
    const valid = adRemakeBriefSchema.safeParse({ ...details, seconds, sourceAssetId: crypto.randomUUID(), productAssetIds: photos.map(() => crypto.randomUUID()), rightsConfirmed: rights });
    if (!valid.success) { setError(valid.error.issues[0]?.message || "Check your remake details."); return; }
    if (demo) { setError("Preview files stay on this device. Sign in to save and render."); return; }
    startTransition(async () => {
      setError(null); setProgress(0);
      try {
        setPhase("Uploading your private reference…"); const sourceAssetId = await upload(source.file, "video");
        const productAssetIds: string[] = [];
        for (const [i, photo] of photos.entries()) { setPhase(`Uploading product image ${i + 1} of ${photos.length}…`); productAssetIds.push(await upload(photo.file, "image")); }
        setPhase("Saving your brief…");
        const result = await createAdRemakeProject({ ...valid.data, sourceAssetId, productAssetIds });
        if (result.error || !result.id) throw new Error(result.error || "Could not save remake.");
        router.push(`/studio/ad-remake/${result.id}`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save remake."); }
      finally { setPhase(""); stopUpload.current = null; }
    });
  }
  const seconds = info ? Math.ceil(info.seconds) : null, cost = seconds ? adRemakeCredits({ ...details, seconds } as AdRemakeBrief) : null;
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <header className="max-w-2xl"><p className="eyebrow text-primary">Ad Remake / Reference to product video</p><h1 className="editorial mt-3 text-4xl sm:text-5xl">A familiar rhythm.<br/><span className="italic text-primary">Your product in the frame.</span></h1><p className="mt-5 text-sm leading-7 text-muted-foreground">Use an ad you own or have permission to adapt. Bring your product photos, describe the changes, and review a new AI-edited version before sharing.</p></header>
    {demo ? <p className="mt-6 rounded-xl bg-accent p-4 text-sm">Studio preview · Files stay on this device. No uploads, generation or charges. <Link className="text-primary underline" href="/login?next=/studio/ad-remake">Sign in to create.</Link></p> : null}
    <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form className="min-w-0 rounded-3xl border border-border bg-card p-5 sm:p-8" onSubmit={e => { e.preventDefault(); save(); }}><fieldset disabled={pending} className="space-y-6">
        <section><p className="eyebrow text-primary">01 / The reference</p><label className="mt-4 block text-sm font-medium">Authorized reference ad<input type="file" accept="video/mp4,video/quicktime,.mov" className={field} onChange={e => choose(Array.from(e.target.files || []), "video")}/></label><p className="mt-2 text-xs leading-6 text-muted-foreground">MP4 / MOV · 3–15 seconds · max 100 MB · each side 720–3840 px. No link imports.</p>
          {source ? <video key={source.url} src={source.url} controls playsInline preload="metadata" className="mt-4 max-h-80 w-full rounded-xl bg-[#10202b]" aria-label="Your original reference ad" onLoadedMetadata={e => { const v = e.currentTarget; setInfo({ seconds: v.duration, width: v.videoWidth, height: v.videoHeight }); }} onError={() => { setInfo(null); setError("This browser cannot read the video. Try an H.264 MP4 export."); }}/> : null}
        </section>
        <section><p className="eyebrow text-primary">02 / Your product</p><label className="mt-4 block text-sm font-medium">Product images<input type="file" multiple accept="image/jpeg,image/png,image/webp" className={field} onChange={e => choose(Array.from(e.target.files || []), "image")}/></label><p className="mt-2 text-xs leading-6 text-muted-foreground">1–4 views of the same product · max 8 MB each · at least 100 px per side, max 20 megapixels. First image: clear front view.</p><div className="mt-4 grid grid-cols-4 gap-2">{photos.map((photo, i) => <div key={photo.url} className="relative aspect-square overflow-hidden rounded-xl bg-accent"><Image src={photo.url} alt={`Product reference ${i + 1}`} fill unoptimized className="object-contain"/></div>)}</div></section>
        <label className="block text-sm font-medium">Project name<input required minLength={2} maxLength={80} className={field} value={details.title} onChange={e => setDetails({ ...details, title: e.target.value })} placeholder="My product launch remake"/></label>
        <label className="block text-sm font-medium">Product name<input required minLength={2} maxLength={80} className={field} value={details.productName} onChange={e => setDetails({ ...details, productName: e.target.value })} placeholder="Your product or brand"/></label>
        <label className="block text-sm font-medium">What should change?<textarea required minLength={20} maxLength={1500} rows={4} className={field} value={details.instructions} onChange={e => setDetails({ ...details, instructions: e.target.value })} placeholder="Replace the bottle with my product, use a warm beige setting, and keep the slow camera move. Remove the old logo and text."/></label>
        <div className="grid gap-4 sm:grid-cols-[1fr_100px]"><label className="text-sm font-medium">Exact closing CTA <span className="text-xs font-normal">(optional)</span><input maxLength={60} className={field} value={details.cta} onChange={e => setDetails({ ...details, cta: e.target.value })} placeholder="Explore the collection"/></label><label className="text-sm font-medium">CTA color<input type="color" className={`${field} h-12 p-1`} value={details.brandColor} onChange={e => setDetails({ ...details, brandColor: e.target.value })}/></label></div>
        <fieldset><legend className="text-sm font-medium">03 / Choose the renderer</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(adRemakeModels).map(([id, model]) => <label key={id} className={`cursor-pointer rounded-xl border p-4 ${details.model === id ? "border-primary bg-primary/5" : "border-border"}`}><input type="radio" name="model" value={id} checked={details.model === id} onChange={() => setDetails({ ...details, model: id as AdRemakeBrief["model"] })} className="mr-2 accent-primary"/><span className="text-sm font-semibold">{model.name}</span><span className="mt-2 block text-xs text-muted-foreground">{model.creditsPerSecond} credits / second</span></label>)}</div></fieldset>
        <label className="flex gap-3 text-xs leading-6"><input type="checkbox" checked={details.keepAudio} onChange={e => setDetails({ ...details, keepAudio: e.target.checked })} className="mt-1 size-4 shrink-0 accent-primary"/>Keep the original clip’s audio. I have permission to reuse all voices, music and claims in it. No new voiceover is generated.</label>
        <label className="flex gap-3 text-xs leading-6"><input required type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} className="mt-1 size-4 shrink-0 accent-primary"/>I own or am authorized to adapt this video, product images and any likenesses. I authorize processing by fal’s model providers and will check the output for accuracy and rights. No impersonation or invented endorsements.</label>
        <Button type="submit" className="w-full" size="lg" disabled={pending || !source || !photos.length || !rights}>{pending ? <LoaderCircle className="animate-spin"/> : <Repeat2/>}{phase || "Save brief & review"}<ArrowRight/></Button>
        {pending ? <p role="status" className="text-xs leading-6">{phase} {phase.startsWith("Uploading your") ? `${progress}%` : ""} · Saving does not spend credits.</p> : null}
      </fieldset>{uploadingVideo ? <Button type="button" variant="outline" className="mt-3" onClick={() => stopUpload.current?.()}>Stop video upload</Button> : null}{error ? <p role="alert" className="mt-5 rounded-xl border border-destructive/30 p-4 text-sm">{error}</p> : null}</form>
      <aside className="space-y-5"><section className="rounded-2xl bg-[#183f3e] p-6 text-[#f4eedf]"><Repeat2 className="size-7"/><h2 className="editorial mt-5 text-2xl">Reference → remake → review</h2><p className="mt-4 text-sm leading-7">Kling O3 edits your reference footage using your product images and instructions. An exact CTA is added separately in the last two seconds.</p><p className="mt-5 border-t border-white/20 pt-4 text-sm">{seconds ? `${seconds}s billed duration` : "Choose a clip to calculate credits"}{cost ? <strong className="mt-2 block text-xl">{cost} credits to render</strong> : null}</p><p className="mt-3 text-xs leading-6">Seconds are rounded up. Saving is free; credits are reserved only after review. Failed or cancelled renders return reserved credits.</p></section><section className="rounded-2xl border border-border bg-card p-6"><h2 className="font-semibold">Your final say</h2><p className="mt-3 text-xs leading-6 text-muted-foreground">Aspect ratio is preserved, with export capped at a 1920 px longest side. Product details, logos, text and motion can vary. Compare the remake with your originals before publishing.</p><p className="mt-3 text-xs leading-6 text-muted-foreground">Private MP4 export with a visible AI-edited disclosure. Audio off by default. No automatic posting, promised performance or unlimited-length generation.</p></section></aside>
    </div>
    {projects.length ? <section className="mt-12"><h2 className="text-xl font-semibold">Your ad remakes</h2><div className="mt-5 grid gap-4 sm:grid-cols-3">{projects.map(p => <Link key={p.id} href={`/studio/ad-remake/${p.id}`} className="rounded-2xl border border-border bg-card p-5 hover:border-primary"><p className="text-xs capitalize text-primary">{p.status}</p><h3 className="mt-3 font-semibold">{p.title}</h3><p className="mt-5 text-xs">Open review →</p></Link>)}</div></section> : null}
  </main>;
}
