"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ScanFace, ShieldCheck, Upload, Video, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createPresenterUpload, savePresenter, createPresenterProject, revokePresenter } from "@/app/studio/presenter/actions";
import { presenterConsentText, presenterBriefSchema, presenterCredits, portraitUploadSchema, type PresenterBrief, type PresenterView } from "@/lib/presenter/schema";

const field = "mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/35";
const initialBrief: PresenterBrief = { title: "", script: "", duration: 15, resolution: "480p", aspectRatio: "9:16", captions: true, model: "fabric-1.0" };
export function PresenterStudio({ demo, presenters, projects, initialError }: { demo: boolean; presenters: PresenterView[]; projects: { id: string; title: string; status: string }[]; initialError: string | null }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(presenters[0]?.id || ""), [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false), [adult, setAdult] = useState(false), [approved, setApproved] = useState(false);
  const [brief, setBrief] = useState(initialBrief), [error, setError] = useState(initialError), [phase, setPhase] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function chooseFile(next: File | null) { setFile(next); setPreview(next ? URL.createObjectURL(next) : null); }
  const chosen = presenters.find(p => p.id === selected);
  function change(patch: Partial<PresenterBrief>) { setBrief(current => ({ ...current, ...patch })); setApproved(false); setRequestId(null); }
  function upload() {
    if (!file || demo) return;
    startTransition(async () => {
      setError(null); setPhase("Saving your private presenter…");
      try {
        portraitUploadSchema.parse({ mime: file.type, size: file.size });
        const prepared = await createPresenterUpload({ mime: file.type, size: file.size });
        if (prepared.error || !prepared.assetId || !prepared.path || !prepared.token) throw new Error(prepared.error || "Upload unavailable.");
        const db = createClient(); if (!db) throw new Error("Storage is not connected.");
        const uploaded = await db.storage.from("private-media").uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
        if (uploaded.error) throw new Error("Portrait upload failed. Please retry.");
        const result = await savePresenter({ assetId: prepared.assetId, name, consent, adult });
        if (result.error || !result.id) throw new Error(result.error || "Presenter could not be saved.");
        setSelected(result.id); setConsent(false); setAdult(false); chooseFile(null); setName(""); router.refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
      finally { setPhase(""); }
    });
  }
  function create() {
    if (demo) return;
    const validated = presenterBriefSchema.safeParse(brief);
    if (!validated.success) { setError(validated.error.issues[0]?.message || "Check your script."); return; }
    const id = requestId || crypto.randomUUID(); setRequestId(id);
    startTransition(async () => {
      setError(null); setPhase("Saving your reviewed script…");
      try {
        const result = await createPresenterProject({ requestId: id, presenterId: selected, brief: validated.data, approved });
        if (result.error || !result.id) throw new Error(result.error || "Project could not be saved.");
        router.push(`/studio/presenter/${result.id}`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save video."); }
      finally { setPhase(""); }
    });
  }
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
    <div className="mb-8 max-w-3xl"><p className="eyebrow text-primary">AI digital-clone presenter / Photo-based</p><h1 className="editorial mt-3 text-4xl sm:text-5xl">Your face. Your next story.</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">Save an authorized portrait, write a short script, and make a talking presenter video. Reuse your presenter without filming every take.</p><p className="mt-2 text-xs leading-6 text-muted-foreground">Photo animation with an English studio voice—not a trained avatar, identity verification, or voice clone. Likeness and lip sync can vary.</p></div>
    {demo && <p className="mb-6 rounded-xl border border-primary/20 bg-accent p-4 text-sm">Preview mode · nothing is uploaded or charged. <Link href="/login?next=/studio/presenter" className="font-semibold underline">Sign in to create your presenter</Link>.</p>}
    {error && <p role="alert" className="mb-5 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
    <div className="grid gap-7 lg:grid-cols-[1fr_1.15fr]">
      <section className="rounded-3xl border border-border bg-card p-5 sm:p-7"><p className="eyebrow text-primary">01 / Your presenter</p><h2 className="mt-2 text-xl font-semibold">A familiar face, ready to speak.</h2>
        {presenters.length > 0 && <><label className="mt-5 block text-sm font-medium">Saved presenters<select value={selected} disabled={pending} onChange={e => { setSelected(e.target.value); setApproved(false); setRequestId(null); }} className={field}><option value="">Choose a presenter</option>{presenters.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{chosen && <div className="mt-4 flex items-center gap-4 rounded-xl bg-accent/40 p-3">{chosen.portraitUrl && <Image src={chosen.portraitUrl} alt={chosen.name} width={64} height={80} unoptimized className="h-20 w-16 rounded-lg object-cover" />}<div><p className="text-sm font-semibold">{chosen.name}</p><button className="mt-2 text-xs text-muted-foreground underline" disabled={pending || demo} onClick={() => {
          if (!window.confirm("Revoke permission for future videos and delete the original portrait? Completed videos remain in your projects. Cancel running videos first.")) return;
          startTransition(async () => { try { const result = await revokePresenter(chosen.id); if (result.error) setError(result.error); else { setSelected(""); setApproved(false); router.refresh(); } } catch { setError("Could not revoke permission. Please retry."); } });
        }}>Revoke consent & remove portrait</button></div></div>}</>}
        <details className="mt-5" open={presenters.length === 0}><summary className="cursor-pointer text-sm font-medium text-primary">Add a new presenter</summary><form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); upload(); }}>
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-primary/25 bg-accent/30">{preview ? <Image src={preview} alt="Your selected portrait" fill unoptimized className="object-contain" /> : <div className="p-6 text-center"><ScanFace className="mx-auto size-12 text-primary/50" /><p className="mt-4 text-sm">One adult. Clear face. Good light.</p><p className="mt-2 text-xs text-muted-foreground">Front-facing head and shoulders work best.</p></div>}</div>
          <label className="block text-sm font-medium">Portrait photo<input type="file" accept="image/png,image/jpeg,image/webp" required disabled={pending || demo} className={`${field} file:mr-3 file:text-primary`} onChange={e => { const f = e.target.files?.[0]; if (f && !portraitUploadSchema.safeParse({ mime: f.type, size: f.size }).success) { setError("Choose a JPG, PNG or WebP up to 8 MB."); chooseFile(null); return; } chooseFile(f || null); setConsent(false); setAdult(false); }} /></label><p className="text-xs leading-5 text-muted-foreground">JPG, PNG or WebP · up to 8 MB · 256px minimum per side · up to 20 megapixels.</p>
          <label className="block text-sm font-medium">Presenter name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} disabled={pending} className={field} placeholder="My studio presenter" /></label>
          <label className="flex gap-3 text-xs leading-6"><input type="checkbox" required checked={adult} onChange={e => setAdult(e.target.checked)} disabled={pending} className="mt-1.5 shrink-0 accent-primary" />The person shown is an adult (18 or older).</label>
          <label className="flex gap-3 text-xs leading-6 text-muted-foreground"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} disabled={pending} className="mt-1.5 shrink-0 accent-primary" />{presenterConsentText}</label>
          <Button type="submit" disabled={demo || pending || !file || !consent || !adult}><Upload />Save presenter · no credits</Button>
        </form></details>
      </section>
      <section className="rounded-3xl border border-border bg-card p-5 sm:p-7"><p className="eyebrow text-primary">02 / Give it a voice</p><h2 className="mt-2 text-xl font-semibold">What would you like to say?</h2><form className="mt-6 space-y-5" onSubmit={e => { e.preventDefault(); create(); }}>
        <label className="block text-sm font-medium">Video title<input value={brief.title} onChange={e => change({ title: e.target.value })} className={field} required minLength={2} maxLength={100} placeholder="Welcome to my channel" disabled={pending} /></label>
        <label className="block text-sm font-medium">Your script<textarea value={brief.script} onChange={e => change({ script: e.target.value })} required minLength={10} maxLength={650} rows={5} className={field} disabled={pending} placeholder="Welcome! Today I’m sharing one small idea that can make a big difference. Let’s get started." /><span className="mt-2 block text-xs font-normal text-muted-foreground">{brief.script.trim() ? brief.script.trim().split(/\s+/).length : 0}/{brief.duration === 15 ? 28 : 62} words · English studio voice</span></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Model<select className={field} value={brief.model} disabled={pending} onChange={() => undefined}><option value="fabric-1.0">Fabric 1.0 · lip sync</option></select></label><label className="text-sm font-medium">Maximum length<select value={brief.duration} disabled={pending} onChange={e => change({ duration: Number(e.target.value) as 15 | 30 })} className={field}><option value={15}>Up to 15 seconds</option><option value={30}>Up to 30 seconds</option></select></label><label className="text-sm font-medium">Resolution<select value={brief.resolution} disabled={pending} onChange={e => change({ resolution: e.target.value as PresenterBrief["resolution"] })} className={field}><option>480p</option><option>720p</option></select></label><label className="text-sm font-medium">Format<select value={brief.aspectRatio} disabled={pending} onChange={e => change({ aspectRatio: e.target.value as PresenterBrief["aspectRatio"] })} className={field}><option value="9:16">Vertical · 9:16</option><option value="16:9">Landscape · 16:9</option></select></label></div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={brief.captions} disabled={pending} onChange={e => change({ captions: e.target.checked })} className="accent-primary" />Burn captions into the video</label>
        <div className="rounded-xl bg-accent/50 p-4"><div className="flex justify-between gap-3 text-sm"><span>Maximum reservation</span><strong aria-live="polite">{presenterCredits(brief.duration, brief.resolution)} credits</strong></div><p className="mt-2 text-xs leading-6 text-muted-foreground">15 credits for voice and preparation, plus {brief.resolution === "480p" ? 6 : 10} per generated second (rounded up). Unused reserved credits are returned. Failed or cancelled jobs receive their reservation back.</p></div>
        <label className="flex gap-3 text-xs leading-6"><input type="checkbox" required checked={approved} disabled={pending} onChange={e => setApproved(e.target.checked)} className="mt-1.5 shrink-0 accent-primary" />I reviewed this exact script and have the presenter’s permission to say it. I will not use it to impersonate someone, fabricate an endorsement, or mislead viewers.</label>
        <Button className="w-full" size="lg" type="submit" disabled={demo || pending || !selected || !approved}><Video />Review saved video <ArrowRight /></Button><p className="text-xs leading-6 text-muted-foreground">Saving is free. Rendering starts only after your final confirmation on the next screen. Exports include an “AI presenter” disclosure.</p>
      </form></section>
    </div>
    {pending && <p role="status" className="mt-5 flex items-center gap-2 text-sm text-primary"><LoaderCircle className="size-4 animate-spin" />{phase || "Updating presenter…"}</p>}
    <p className="mt-7 flex items-start gap-2 text-xs leading-6 text-muted-foreground"><ShieldCheck className="mt-1 size-4 shrink-0" />Portraits are private to your account. Selected inputs are shared with fal/VEED and the studio voice service for generation. Consent is your attestation, not an automated identity check. Revocation stops new renders; existing exports and processing records remain until deletion is requested.</p>
    <section className="mt-10"><h2 className="text-xl font-semibold">Your presenter videos</h2>{projects.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{projects.map(p => <Link key={p.id} href={`/studio/presenter/${p.id}`} className="rounded-2xl border border-border bg-card p-5 hover:border-primary"><p className="font-medium">{p.title}</p><p className="mt-2 text-xs capitalize text-muted-foreground">{p.status}</p></Link>)}</div> : <p className="mt-3 text-sm text-muted-foreground">Your saved scripts and finished videos will appear here.</p>}</section>
  </div>;
}
