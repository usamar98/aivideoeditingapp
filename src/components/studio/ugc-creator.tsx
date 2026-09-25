"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ImagePlus, Link2, LoaderCircle, Megaphone, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createUgcUpload, createUgcProject, importUgcProduct } from "@/app/studio/ugc/actions";
import { ugcPresenters, UGC_PLAN_CREDITS, ugcRenderCredits, type UgcBrief } from "@/lib/ugc/schema";
import { UgcPreview } from "./ugc-preview";

export const ugcField = "mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-normal leading-6 outline-none focus:ring-2 focus:ring-primary/35";
type Photo = { id: string; assetId?: string; url?: string; file?: File; name: string };
export function UgcCreator({ demo, projects, initialError }: { demo: boolean; projects: { id: string; title: string; status: string }[]; initialError: string | null }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState(""); const [error, setError] = useState(initialError || ""); const [notice, setNotice] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [productUrl, setProductUrl] = useState("");
  const [brief, setBrief] = useState({ productName: "", description: "", audience: "", benefits: "", offer: "", cta: "Shop now", presenter: "warm" as UgcBrief["presenter"], duration: 15 as 15 | 30, aspectRatio: "9:16" as UgcBrief["aspectRatio"], captions: true, brandColor: "#2457D6" });
  const [rights, setRights] = useState(false);
  function addFiles(files: FileList | null) {
    if (!files) return; const list = Array.from(files);
    if (list.length + photos.length > 4) { setError("Use up to four product photos."); return; }
    if (list.some((f) => !["image/png", "image/jpeg", "image/webp"].includes(f.type) || !f.size || f.size > 8 * 1024 * 1024)) { setError("Choose PNG, JPG or WebP photos up to 8 MB each."); return; }
    setPhotos((current) => [...current, ...list.map((file) => ({ id: crypto.randomUUID(), file, name: file.name }))]); setError("");
  }
  function importLink() {
    if (demo) return; setError(""); setNotice("");
    startTransition(async () => {
      setPhase("Reading the product page…");
      try {
        const result = await importUgcProduct(productUrl);
        if (result.error || !result.images) throw new Error(result.error || "Could not import product.");
        setBrief((value) => ({ ...value, productName: result.productName || value.productName, description: result.description || value.description }));
        setProductUrl(result.productUrl || productUrl);
        setPhotos((current) => [...current, ...result.images.map((image, index) => ({ id: image.assetId, assetId: image.assetId, url: image.url, name: `Imported product photo ${index + 1}` }))].slice(0, 4));
        setNotice(result.warning || "Review the imported details.");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed. Upload photos instead."); }
      finally { setPhase(""); }
    });
  }
  function create() {
    if (demo) return; setError("");
    startTransition(async () => {
      try {
        const ids: string[] = [];
        for (const [index, photo] of photos.entries()) {
          if (photo.assetId) { ids.push(photo.assetId); continue; }
          if (!photo.file) throw new Error("A photo is missing.");
          setPhase(`Uploading photo ${index + 1}…`);
          const prepared = await createUgcUpload({ mime: photo.file.type, size: photo.file.size });
          if (prepared.error || !prepared.assetId || !prepared.path || !prepared.token) throw new Error(prepared.error || "Upload unavailable.");
          const db = createClient(); if (!db) throw new Error("Storage is not connected.");
          const uploaded = await db.storage.from("private-media").uploadToSignedUrl(prepared.path, prepared.token, photo.file, { contentType: photo.file.type });
          if (uploaded.error) throw new Error("Photo upload failed. Please retry.");
          ids.push(prepared.assetId);
          setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, assetId: prepared.assetId } : item));
        }
        setPhase("Saving your campaign brief…");
        const result = await createUgcProject({ ...brief, productUrl, productAssetIds: ids, rightsConfirmed: rights });
        if (result.error || !result.id) throw new Error(result.error || "Project could not be saved.");
        router.push(`/studio/ugc/${result.id}`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your ad."); }
      finally { setPhase(""); }
    });
  }
  return <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
    <div className="mb-9 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-primary">UGC & product ads / creative studio</p><h1 className="editorial mt-4 text-4xl leading-tight sm:text-6xl">Your product.<br /><span className="italic text-primary">A new way to tell it.</span></h1><p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">Turn a product link or photos into presenter-led ads. Shape three opening hooks, review every word, then create the versions you want to test.</p></div><span className="rounded-full border border-primary/20 bg-accent/40 px-4 py-2 text-xs text-primary">Product → Presenter & hooks → Ad variants</span></div>
    {demo && <p className="mb-6 rounded-xl border border-primary/20 bg-accent/40 p-4 text-sm">Studio preview. Uploads, imports and paid generation are disabled. <Link href="/studio/ugc/demo" className="font-semibold text-primary underline">Try the sample hook editor</Link> or <Link href="/login?next=/studio/ugc" className="text-primary underline">sign in to create</Link>.</p>}
    <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
      <form onSubmit={(event) => { event.preventDefault(); create(); }} className="rounded-3xl border border-border bg-card p-5 sm:p-8">
        <fieldset disabled={pending} className="min-w-0 space-y-7">
          <section><h2 className="flex items-center gap-2 text-base font-semibold"><Link2 className="size-4 text-primary" />01 / Bring your product</h2><label className="mt-5 block text-xs font-semibold">Product page <span className="font-normal text-muted-foreground">· optional</span><div className="flex flex-wrap items-center gap-2"><input type="url" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://your-store.com/products/your-product" className={`${ugcField} min-w-[180px] flex-1`} maxLength={2048} /><Button type="button" variant="outline" className="mt-2" disabled={demo || !productUrl || pending || photos.length >= 4} onClick={importLink}>Import product</Button></div></label><p className="mt-2 text-xs leading-5 text-muted-foreground">We read public page details and photos. Protected or JavaScript-only shops may need a manual upload. No prices or claims are assumed.</p></section>
          <div className="rounded-2xl border border-dashed border-primary/25 p-4"><label className="block text-sm font-medium"><ImagePlus className="mr-2 inline size-4 text-primary" />Product photos · 1–4 images<input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={demo || photos.length >= 4} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} className="mt-3 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-primary" /></label><p className="mt-2 text-xs text-muted-foreground">PNG/JPG/WebP · 8 MB each · no larger than 20 megapixels. Original photos stay visible in the ad.</p>{photos.map((photo) => <div key={photo.id} className="mt-3 flex items-center gap-3 rounded-xl bg-background p-3">{photo.url ? <Image src={photo.url} width={48} height={48} unoptimized alt={photo.name} className="size-12 rounded-lg object-contain" /> : <ImagePlus className="size-5 shrink-0 text-primary" />}<span className="min-w-0 flex-1 truncate text-xs">{photo.name}</span><button type="button" aria-label={`Remove ${photo.name}`} onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}><X className="size-4" /></button></div>)}</div>
          {notice && <p role="status" className="rounded-xl bg-accent/50 p-3 text-xs leading-6">{notice}</p>}
          <section className="space-y-4"><h2 className="text-base font-semibold">02 / Get the facts right</h2><label className="block text-xs font-semibold">Product name<input required minLength={2} maxLength={80} value={brief.productName} onChange={(e) => setBrief({ ...brief, productName: e.target.value })} className={ugcField} /></label><label className="block text-xs font-semibold">What is it?<textarea required minLength={20} maxLength={1200} rows={3} value={brief.description} onChange={(e) => setBrief({ ...brief, description: e.target.value })} className={ugcField} placeholder="Describe what your product does, using accurate, verifiable facts." /></label><label className="block text-xs font-semibold">Who is this ad for?<input required minLength={3} maxLength={200} value={brief.audience} onChange={(e) => setBrief({ ...brief, audience: e.target.value })} className={ugcField} placeholder="e.g. Commuters who bring coffee from home" /></label><label className="block text-xs font-semibold">Approved benefits & selling points<textarea required minLength={10} maxLength={800} rows={3} value={brief.benefits} onChange={(e) => setBrief({ ...brief, benefits: e.target.value })} className={ugcField} placeholder="Only claims you can support. AI should not invent customer experience or guarantees." /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold">Offer <span className="font-normal">· optional</span><input maxLength={150} value={brief.offer} onChange={(e) => setBrief({ ...brief, offer: e.target.value })} placeholder="e.g. Free delivery this week" className={ugcField} /></label><label className="text-xs font-semibold">Call to action<input required minLength={3} maxLength={70} value={brief.cta} onChange={(e) => setBrief({ ...brief, cta: e.target.value })} className={ugcField} /></label></div></section>
          <section><h2 className="text-base font-semibold">03 / Set the creative direction</h2><div className="mt-4 grid grid-cols-2 gap-2">{Object.entries(ugcPresenters).map(([id, presenter]) => <button key={id} type="button" aria-pressed={brief.presenter === id} onClick={() => setBrief({ ...brief, presenter: id as UgcBrief["presenter"] })} className={`rounded-xl border px-3 py-4 text-left text-xs ${brief.presenter === id ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-accent"}`}>{presenter.name}</button>)}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">A new fictional adult presenter, generated for your project. English speech uses the configured studio voice; this is not voice cloning.</p><div className="mt-5 grid grid-cols-2 gap-4"><label className="text-xs font-semibold">Ad length<select className={ugcField} value={brief.duration} onChange={(e) => setBrief({ ...brief, duration: Number(e.target.value) as 15 | 30 })}><option value={15}>15 seconds</option><option value={30}>30 seconds</option></select></label><label className="text-xs font-semibold">Canvas<select className={ugcField} value={brief.aspectRatio} onChange={(e) => setBrief({ ...brief, aspectRatio: e.target.value as UgcBrief["aspectRatio"] })}><option value="9:16">Vertical · 9:16</option><option value="1:1">Square · 1:1</option><option value="16:9">Landscape · 16:9</option></select></label></div><div className="mt-5 flex flex-wrap items-center gap-6"><label className="flex items-center gap-3 text-xs">Brand accent<input aria-label="Brand accent color" type="color" value={brief.brandColor} onChange={(e) => setBrief({ ...brief, brandColor: e.target.value })} className="h-9 w-12 rounded border border-border bg-background" /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={brief.captions} onChange={(e) => setBrief({ ...brief, captions: e.target.checked })} className="accent-primary" />Burn in captions</label></div></section>
          <label className="flex items-start gap-3 text-xs leading-6 text-muted-foreground"><input required type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1.5 accent-primary" />I own or have permission to use these product assets. I have verified the claims and agree to send these inputs to the AI providers. I will not present the AI spokesperson as a real customer or endorsement.</label>
          <div className="border-t border-border pt-5"><p className="mb-4 text-xs leading-6 text-muted-foreground">Presenter + three hooks: <strong className="text-foreground">{UGC_PLAN_CREDITS} credits</strong>. Each {brief.duration}s ad: <strong className="text-foreground">{ugcRenderCredits(brief.duration, 1)} credits</strong>. Choose variants after reviewing the plan.</p><Button type="submit" size="lg" disabled={demo || pending || !rights || !photos.length} className="w-full rounded-xl">{pending ? <LoaderCircle className="animate-spin" /> : <Megaphone />}{phase || "Save brief & continue"}<ArrowRight /></Button><p className="mt-3 text-center text-xs text-muted-foreground">Saving is free. No generation starts until you confirm.</p></div>
        </fieldset>{error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 p-3 text-sm">{error}</p>}
      </form>
      <aside className="space-y-5 lg:sticky lg:top-6"><div className="overflow-hidden rounded-3xl border border-border bg-card"><UgcPreview /><div className="p-6"><p className="eyebrow text-primary">Designed for creative testing</p><h2 className="editorial mt-3 text-3xl">Find your opening.</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">A question. A benefit. A little curiosity. Compare three openings with the same presenter, body and CTA, so you can test what connects with your audience.</p><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">{["AI presenter", "Product visuals", "MP4 + SRT"].map((label) => <span key={label} className="rounded-xl bg-accent/50 px-2 py-3">{label}</span>)}</div></div></div><p className="flex gap-3 px-2 text-xs leading-6 text-muted-foreground"><ShieldCheck className="mt-1 size-5 shrink-0 text-primary" />Private projects. Visible AI-presenter disclosure. Review generated faces, speech and claims before publishing. No automatic ad posting or promised campaign results.</p></aside>
    </div>
    {!!projects.length && <section className="mt-14"><h2 className="text-xl font-semibold">Your ad projects</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map((project) => <Link key={project.id} href={`/studio/ugc/${project.id}`} className="rounded-2xl border border-border bg-card p-5 hover:border-primary"><span className="text-xs capitalize text-primary">{project.status}</span><h3 className="mt-3 font-semibold">{project.title}</h3><p className="mt-5 text-xs text-muted-foreground">Open creative workspace →</p></Link>)}</div></section>}
  </main>;
}
