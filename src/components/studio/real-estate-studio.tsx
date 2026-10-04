"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowRight, House, Upload, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createEstateProject, createEstateUpload } from "@/app/studio/real-estate/actions";
import { estateBriefSchema, estateCredits, estateModels, estateSeconds, type EstateBrief } from "@/lib/real-estate/schema";

const field = "mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/35";
const initial: EstateBrief = { title: "", address: "", price: "", agent: "", contact: "", cta: "Book a viewing", brandColor: "#1b4d4a", model: "photo-motion", aspectRatio: "16:9", secondsPerRoom: 6, voice: "none", rooms: [] };
export function RealEstateStudio({ demo, projects, initialError }: { demo: boolean; projects: { id: string; title: string; status: string }[]; initialError: string | null }) {
  const router = useRouter(), [pending, startTransition] = useTransition(), [brief, setBrief] = useState(initial), [approved, setApproved] = useState(false);
  const [error, setError] = useState(initialError), [phase, setPhase] = useState(""), [photos, setPhotos] = useState<Record<string, string>>({});
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), []);
  function change(patch: Partial<EstateBrief>) { setBrief(b => ({ ...b, ...patch })); setApproved(false); }
  function roomChange(i: number, patch: Partial<EstateBrief["rooms"][number]>) { change({ rooms: brief.rooms.map((r, n) => n === i ? { ...r, ...patch } : r) }); }
  function move(i: number, step: number) { const rooms = [...brief.rooms]; [rooms[i], rooms[i + step]] = [rooms[i + step], rooms[i]]; change({ rooms }); }
  function upload(files: File[]) {
    if (!files.length) return;
    if (files.length + brief.rooms.length > 12) { setError("Choose up to 12 photos in total."); return; }
    if (files.some(f => !["image/png", "image/jpeg", "image/webp"].includes(f.type) || f.size > 8 * 1024 * 1024 || !f.size)) { setError("Use PNG, JPEG or WebP photos up to 8 MB each."); return; }
    startTransition(async () => {
      setError(null); setApproved(false);
      try {
        for (const [index, file] of files.entries()) {
          setPhase(`Uploading photo ${index + 1} of ${files.length}…`);
          let id = crypto.randomUUID() as string;
          if (!demo) {
            const prepared = await createEstateUpload({ mime: file.type, size: file.size });
            if (prepared.error || !prepared.path || !prepared.token || !prepared.assetId) throw new Error(prepared.error || "Could not prepare upload.");
            const db = createClient(); if (!db) throw new Error("Storage is not connected.");
            if ((await db.storage.from("private-media").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type })).error) throw new Error("Photo upload failed. Uploaded photos are retained; retry the remaining files.");
            id = prepared.assetId;
          }
          const url = URL.createObjectURL(file); urls.current.push(url); setPhotos(p => ({ ...p, [id]: url }));
          setBrief(b => ({ ...b, rooms: [...b.rooms, { assetId: id, label: `Room ${b.rooms.length + 1}`, narration: "", motion: "push" }] }));
        }
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); } finally { setPhase(""); }
    });
  }
  function save() {
    const valid = estateBriefSchema.safeParse(brief);
    if (!valid.success) { setError(valid.error.issues[0]?.message || "Check your listing."); return; }
    if (demo) { setError("This is a local preview. Sign in to save and generate; preview uploads are not sent to storage."); return; }
    startTransition(async () => { setError(null); setPhase("Saving your reviewed listing…"); try {
      const result = await createEstateProject(valid.data, approved);
      if (result.error || !result.id) throw new Error(result.error || "Could not save listing."); router.push(`/studio/real-estate/${result.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed."); } finally { setPhase(""); } });
  }
  const model = estateModels.find(m => m.id === brief.model)!;
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
    <header className="mb-10 flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><p className="eyebrow text-primary">Real estate / Photo-to-video studio</p><h1 className="editorial mt-3 text-4xl sm:text-5xl">Every room. A reason to stay.</h1><p className="mt-5 text-sm leading-7 text-muted-foreground">Turn your property photos into a considered listing tour. Arrange the rooms, choose motion, and finish with your brand. Your listing facts stay in your hands.</p></div><Link href="/features/ai-real-estate-video-generator" className="text-sm text-primary underline underline-offset-4">Read the listing video guide</Link></header>
    {demo && <p className="mb-6 rounded-xl border border-border bg-card p-4 text-sm">Studio preview · Try the controls and local photo previews. No uploads, charges or generation. <Link href="/login?next=/studio/real-estate" className="text-primary underline">Sign in to create.</Link></p>}
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-7"><section className="rounded-3xl border border-border bg-card p-5 sm:p-8"><p className="eyebrow text-primary">01 / Tell the property’s story</p><h2 className="editorial mt-3 text-2xl">Start with the real details.</h2><fieldset disabled={pending} className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Listing title <input className={field} value={brief.title} maxLength={80} onChange={e => change({ title: e.target.value })} placeholder="A light-filled home at Maple Court" /></label>
        <label className="text-sm font-medium">Address or area <span className="font-normal text-muted-foreground">(optional)</span><input className={field} value={brief.address} maxLength={100} onChange={e => change({ address: e.target.value })} placeholder="Only include details you want public" /></label>
        <label className="text-sm font-medium">Price <span className="font-normal text-muted-foreground">(optional)</span><input className={field} value={brief.price} maxLength={40} onChange={e => change({ price: e.target.value })} placeholder="Your verified asking price" /></label>
      </fieldset></section>
      <section className="rounded-3xl border border-border bg-card p-5 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow text-primary">02 / A room-by-room tour</p><h2 className="editorial mt-3 text-2xl">Your photos, in your order.</h2></div><span className="text-xs text-muted-foreground">{brief.rooms.length} / 12 photos</span></div>
        <label className={`mt-6 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-primary/35 bg-primary/5 px-5 py-8 text-center ${pending ? "pointer-events-none opacity-50" : "hover:bg-primary/10"}`}><Upload className="mb-3 size-6 text-primary"/><span className="font-medium">Choose property photos</span><span className="mt-2 text-xs leading-6 text-muted-foreground">2–12 JPEG, PNG or WebP files · up to 8 MB each<br/>Start with the exterior, then living spaces and standout details.</span><input aria-label="Upload property photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={pending || brief.rooms.length >= 12} className="sr-only" onChange={e => { upload(Array.from(e.target.files || [])); e.target.value = ""; }} /></label>
        <fieldset disabled={pending} className="mt-6 space-y-4">{brief.rooms.map((r, i) => <article key={r.assetId} className="rounded-2xl border border-border p-4"><div className="flex gap-4"><div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg bg-accent"><Image src={photos[r.assetId]} alt={`Original listing photo ${i + 1}`} fill unoptimized className="object-contain"/></div><div className="min-w-0 flex-1"><label className="text-xs font-medium">Room {i + 1} label<input className={`${field} mt-1`} aria-label={`Room ${i + 1} label`} value={r.label} maxLength={40} onChange={e => roomChange(i, { label: e.target.value })}/></label><div className="mt-2 flex gap-1"><Button size="icon" variant="ghost" disabled={i === 0} aria-label={`Move room ${i + 1} up`} onClick={() => move(i, -1)}><ArrowUp className="size-4"/></Button><Button size="icon" variant="ghost" disabled={i === brief.rooms.length - 1} aria-label={`Move room ${i + 1} down`} onClick={() => move(i, 1)}><ArrowDown className="size-4"/></Button><Button size="icon" variant="ghost" aria-label={`Remove room ${i + 1}`} onClick={() => change({ rooms: brief.rooms.filter((_, n) => n !== i) })}><Trash2 className="size-4"/></Button></div></div></div><div className="mt-3 grid gap-4 sm:grid-cols-[160px_1fr]"><label className="text-xs font-medium">Camera movement<select className={field} value={r.motion} onChange={e => roomChange(i, { motion: e.target.value as typeof r.motion })}><option value="push">Gentle push</option><option value="pan">Subtle pan</option><option value="still">Still camera</option></select></label><label className="text-xs font-medium">{brief.voice === "none" ? "Optional caption" : "Room narration"}<input className={field} value={r.narration} maxLength={140} onChange={e => roomChange(i, { narration: e.target.value })} placeholder="Describe only what the photo and verified facts support."/><span className="mt-2 block font-normal text-muted-foreground">Up to {brief.secondsPerRoom === 6 ? 11 : 15} words · exported in the SRT caption file</span></label></div></article>)}</fieldset>
      </section>
      <section className="rounded-3xl border border-border bg-card p-5 sm:p-8"><p className="eyebrow text-primary">03 / Make it yours</p><fieldset disabled={pending} className="mt-6 grid gap-5 sm:grid-cols-2">{([['agent','Agent or agency',60],['contact','Contact or website',100],['cta','Final call to action',60]] as const).map(([key,label,max]) => <label key={key} className="text-sm font-medium">{label}<input className={field} value={brief[key]} maxLength={max} onChange={e => change({ [key]: e.target.value })}/></label>)}<label className="text-sm font-medium">Brand color<input aria-label="Brand color" type="color" value={brief.brandColor} onChange={e => change({ brandColor: e.target.value })} className="mt-2 block h-12 w-full cursor-pointer rounded-xl border border-border bg-background p-2"/></label></fieldset></section>
      </div>
      <aside className="space-y-5 xl:sticky xl:top-6"><section className="overflow-hidden rounded-3xl border border-border bg-card"><div className="bg-[#183f3e] p-7 text-[#f4eedf]"><House className="size-8 opacity-80"/><p className="editorial mt-5 text-2xl">A tour worth taking.</p><p className="mt-3 text-xs leading-6 opacity-80">1080p MP4 · Private project<br/>Original photos stay available for review.</p></div><fieldset disabled={pending} className="space-y-5 p-6"><label className="block text-sm font-medium">Motion engine<select className={field} value={brief.model} onChange={e => change({ model: e.target.value as EstateBrief['model'] })}>{estateModels.map(m => <option key={m.id} value={m.id}>{m.name} · {m.rate} cr/s</option>)}</select><span className="mt-2 block text-xs font-normal leading-6 text-muted-foreground">{model.note}</span></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Format<select className={field} value={brief.aspectRatio} onChange={e => change({ aspectRatio: e.target.value as EstateBrief['aspectRatio'] })}><option value="16:9">Landscape</option><option value="9:16">Portrait</option></select></label><label className="text-sm font-medium">Per room<select className={field} value={brief.secondsPerRoom} onChange={e => change({ secondsPerRoom: Number(e.target.value) as 6 | 8 })}><option value={6}>6 seconds</option><option value={8}>8 seconds</option></select></label></div><label className="block text-sm font-medium">Voiceover<select className={field} value={brief.voice} onChange={e => change({ voice: e.target.value as EstateBrief['voice'] })}><option value="none">No voiceover</option><option value="Rachel">Rachel · ElevenLabs v3</option><option value="Aria">Aria · ElevenLabs v3</option></select><span className="mt-2 block text-xs font-normal text-muted-foreground">English · no music or generated dialogue</span></label></fieldset></section>
      <section className="rounded-2xl border border-border bg-card p-6"><div className="flex justify-between text-sm"><span>Tour length</span><strong>{brief.rooms.length ? `${estateSeconds(brief)} seconds` : "Add photos"}</strong></div><div className="mt-3 flex justify-between text-sm"><span>Render cost</span><strong>{brief.rooms.length ? `${estateCredits(brief).toLocaleString()} credits` : "—"}</strong></div><p className="mt-3 text-xs leading-6 text-muted-foreground">10 export credits + {model.rate} credit{model.rate === 1 ? "" : "s"}/room-second{brief.voice !== "none" ? " + 5 credits/room for voice" : ""}. Includes a 4-second contact card. Saving this plan does not charge credits.</p><label className="mt-5 flex gap-3 text-xs leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0" checked={approved} disabled={pending} onChange={e => setApproved(e.target.checked)}/><span>I have permission to use these photos and have verified all listing facts. I will inspect the output before publishing.</span></label><Button className="mt-5 w-full" disabled={pending || !approved || brief.rooms.length < 2 || Boolean(initialError)} onClick={save}>{pending ? "Working…" : "Save & review listing"}<ArrowRight className="size-4"/></Button>{phase && <p role="status" className="mt-3 text-xs">{phase}</p>}</section>
      <p className="flex gap-3 px-2 text-xs leading-6 text-muted-foreground"><ShieldCheck className="mt-1 size-5 shrink-0"/>{brief.model === "photo-motion" ? "Faithful mode moves your photos without generating architecture. Output preserves the whole photo with padding where needed." : "AI can alter windows, dimensions or furniture. Prompts reduce changes but cannot guarantee accuracy. AI exports include a visible disclosure."}</p>
      {error && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
      </aside>
    </div>
    <section className="mt-12"><h2 className="editorial text-2xl">Your listing projects</h2>{projects.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map(p => <Link key={p.id} href={`/studio/real-estate/${p.id}`} className="rounded-2xl border border-border bg-card p-5 hover:border-primary/50"><p className="font-medium">{p.title}</p><p className="mt-2 text-xs capitalize text-muted-foreground">{p.status}</p></Link>)}</div> : <p className="mt-4 text-sm text-muted-foreground">Your saved tours and finished exports will appear here.</p>}</section>
  </div>;
}
