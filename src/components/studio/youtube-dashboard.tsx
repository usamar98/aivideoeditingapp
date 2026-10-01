"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CalendarClock, Check, ExternalLink, Film, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { Youtube } from "./youtube-icon";
import { Button } from "@/components/ui/button";
import { publishToYouTube, cancelYouTubePost, refreshYouTubePost, disconnectYouTube } from "@/app/studio/social/actions";
import type { LibraryVideo, SocialDashboard, PostStatus } from "@/lib/social/types";
import { missingUploadRequirements } from "@/lib/social/publish-form";

const field = "mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60";
const labels: Record<PostStatus, string> = { queued: "Waiting for worker", uploading: "Uploading privately", processing: "YouTube processing", scheduled: "Scheduled on YouTube", published: "Published", private: "Private upload ready", cancelled: "Cancelled", failed: "YouTube processing failed", needs_attention: "Needs attention", cancelling: "Confirming cancellation" };
function sourceKey(video: LibraryVideo) { return `${video.kind}:${video.projectId}:${video.outputKey}`; }
function time(value: string) { return `${new Date(value).toISOString().replace("T", " ").slice(0, 16)} UTC`; }
type ActionResult = { error?: string; warning?: string; success?: boolean; id?: string };

export function YouTubeDashboard({ initial, notice }: { initial: SocialDashboard; notice: string | null }) {
  const [data, setData] = useState(initial), [message, setMessage] = useState(notice), [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(""), [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private"), [mode, setMode] = useState("now"), [scheduled, setScheduled] = useState("");
  const [kids, setKids] = useState(""), [synthetic, setSynthetic] = useState(""), [consent, setConsent] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ text: string; queued: boolean } | null>(null);
  const [filter, setFilter] = useState("all"), refreshInFlight = useRef(false), submission = useRef<{ signature: string; id: string } | null>(null);
  const video = data.videos.find((v) => sourceKey(v) === selected);
  const linked = data.connection, ready = !data.demo && data.configured && !data.error && linked?.status === "connected";
  const requirements = missingUploadRequirements({ hasVideo: Boolean(video), title, kids, synthetic, consent, mode, scheduled });
  const reload = useCallback(async () => {
    if (initial.demo || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const response = await fetch("/api/social/youtube", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Could not refresh your uploads. Sign in again if your session expired.");
      setData(await response.json());
    } catch { setMessage("Could not refresh uploads. Your saved requests are unchanged. Try Refresh again."); }
    finally { refreshInFlight.current = false; }
  }, [initial.demo]);
  useEffect(() => {
    if (initial.demo) return;
    const timer = setInterval(() => { if (!document.hidden) void reload(); }, 15_000);
    return () => clearInterval(timer);
  }, [initial.demo, reload]);
  function action(run: () => Promise<ActionResult>, success: string) {
    startTransition(async () => {
      try { const result = await run(); setMessage(result.error || result.warning || success); await reload(); }
      catch { setMessage("The request could not be confirmed. Refresh before trying again."); }
    });
  }
  function choose(key: string) {
    setSelected(key); const chosen = data.videos.find((v) => sourceKey(v) === key);
    setTitle(chosen?.title.slice(0, 100) || ""); setConsent(false); setUploadFeedback(null);
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    if (requirements.length) {
      setUploadFeedback({ text: requirements[0].message, queued: false });
      document.getElementById(requirements[0].id)?.focus();
      return;
    }
    if (!video) return;
    const date = mode === "schedule" ? new Date(scheduled) : null;
    const input = { source: { kind: video.kind, projectId: video.projectId, outputKey: video.outputKey }, title, description,
      visibility: mode === "schedule" ? "public" : visibility, scheduledAt: date?.toISOString() || null, madeForKids: kids === "yes", syntheticMedia: synthetic === "yes", rightsConfirmed: true };
    const signature = JSON.stringify(input);
    if (submission.current?.signature !== signature) submission.current = { signature, id: crypto.randomUUID() };
    const requestId = submission.current.id;
    setUploadFeedback(null);
    startTransition(async () => {
      try {
        const result = await publishToYouTube({ ...input, requestId });
        setUploadFeedback({
          text: result.error || result.warning || "Upload queued. Follow its progress in Your publishing queue below.",
          queued: !result.error && Boolean(result.id),
        });
        if (!result.error && result.id) setFilter("all");
        await reload();
      } catch {
        setUploadFeedback({ text: "The upload request could not be confirmed. Refresh your publishing queue before trying again.", queued: false });
      }
    });
  }
  const posts = data.posts.filter((post) => filter === "all" || (filter === "active" ? ["queued", "uploading", "processing", "scheduled", "cancelling"].includes(post.status) : filter === "done" ? ["published", "private"].includes(post.status) : filter === "attention" ? ["failed", "needs_attention"].includes(post.status) : post.status === "cancelled"));
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-primary">Your studio, out in the world</p><h1 className="editorial mt-3 text-4xl sm:text-5xl">Ready for your audience.</h1><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Connect YouTube, choose a finished video, and give it a publication time. You stay in control of every upload.</p></div><Button variant="outline" disabled={pending || data.demo} onClick={() => void reload()}><RefreshCw /> Refresh</Button></div>
    {message && <p role="status" className="mt-6 rounded-xl border border-primary/20 bg-accent p-4 text-sm leading-6">{message}</p>}
    {(data.demo || !data.configured || data.error) && <div className="mt-6 rounded-xl border border-primary/20 bg-accent/60 p-5 text-sm leading-6"><strong>{data.demo ? "Demo preview — no account is connected." : "YouTube setup required."}</strong><p>{data.error || "Live connections require the YouTube OAuth credentials, token-encryption key, publishing migration, and deployed publishing worker. No video will be uploaded from this preview."}</p></div>}
    <section aria-labelledby="channel-heading" className="mt-8 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-5"><div className="flex items-center gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600"><Youtube aria-hidden /></div><div><h2 id="channel-heading" className="text-lg font-semibold">{linked?.channel_title || "Connect your YouTube channel"}</h2><p className="mt-1 text-sm text-muted-foreground">{linked ? linked.status === "connected" ? "Connected · Your videos go to this channel" : linked.status === "reconnect" ? "Access expired — reconnect the same channel" : "Disconnect pending — retry to finish" : "Separate from your ETA Google sign-in"}</p>{linked && <a href={`https://www.youtube.com/channel/${encodeURIComponent(linked.channel_id)}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline">View connected channel</a>}</div></div>
        <div className="flex max-w-md flex-wrap gap-3">{(!linked || linked.status === "reconnect") && <form action="/api/social/youtube/connect" method="post" className="space-y-3"><label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" name="policy" value="agree" required className="mt-1 accent-blue-600" /><span>I agree to the <Link href="/privacy#youtube" className="underline">YouTube data policy</Link> and <Link href="/terms#youtube" className="underline">publishing terms</Link>, including the YouTube Terms of Service.</span></label><Button type="submit" disabled={!data.configured || data.demo || Boolean(data.error)}><Link2 />{linked ? "Reconnect YouTube" : "Connect YouTube"}</Button></form>}{linked && <Button variant="outline" disabled={pending} onClick={() => { if (window.confirm("Disconnect YouTube and erase ETA’s stored YouTube connection and upload history? Existing YouTube videos AND schedules remain on YouTube: manage or cancel them in YouTube Studio first. ETA source projects remain unchanged. Google may also revoke related permissions for this Google Cloud project.")) action(disconnectYouTube, "YouTube disconnected. Its connection and upload history were removed from ETA. Any existing YouTube schedules must be managed in YouTube Studio."); }}>Disconnect</Button>}</div></div>
      <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" />ETA requests access to manage YouTube videos so it can upload, check progress, and cancel schedules. It does not need your Google password. <Link href="/privacy#youtube" className="shrink-0 underline">Data use</Link></p>
    </section>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section aria-labelledby="compose-heading" className="rounded-2xl border border-border bg-card p-6 sm:p-8"><p className="eyebrow text-primary">01 / Prepare your upload</p><h2 id="compose-heading" className="editorial mt-3 text-3xl">A final look. Then, publish.</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Choose a finished ETA video, answer both required disclosure questions, then confirm the upload below. Nothing is sent to YouTube until you submit.</p>
        <form onSubmit={submit} className="mt-6 space-y-5"><fieldset disabled={!ready || pending} className="space-y-5 disabled:opacity-70">
          <label className="block text-sm font-medium">Completed video<select id="youtube-video" required value={selected} onChange={(event) => choose(event.target.value)} className={field}><option value="">Choose from your video library</option>{data.videos.map((v) => <option key={sourceKey(v)} value={sourceKey(v)}>{v.kind.toUpperCase()} · {v.title}</option>)}</select></label>
          {!data.videos.length && <p className="text-sm leading-6 text-muted-foreground">Your completed faceless videos, cartoons, ad variants and Shorts will appear here. <Link href="/studio" className="text-primary underline">Create a video first.</Link></p>}
          <label className="block text-sm font-medium">YouTube title<input id="youtube-title" required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className={field} placeholder="Give your audience a reason to watch" /></label>
          <label className="block text-sm font-medium">Description<textarea rows={4} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} className={field} placeholder="Context, credits, and anything your viewers should know" /><span className="mt-1 block text-xs font-normal text-muted-foreground">YouTube allows up to 5,000 bytes; emoji and some languages use more than one byte per character.</span></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">When<select className={field} value={mode} onChange={(event) => setMode(event.target.value)}><option value="now">Upload now</option><option value="schedule" disabled={!data.publicPublishing}>Schedule publication</option></select></label>{mode === "now" ? <label className="block text-sm font-medium">Visibility<select className={field} value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private — only you</option><option value="unlisted" disabled={!data.publicPublishing}>Unlisted — anyone with the link</option><option value="public" disabled={!data.publicPublishing}>Public — everyone</option></select></label> : <label className="block text-sm font-medium">Date & time<input id="youtube-scheduled" required type="datetime-local" className={field} value={scheduled} onChange={(event) => setScheduled(event.target.value)} /></label>}</div>
          {mode === "schedule" && <p className="text-xs leading-5 text-muted-foreground">Use your device’s local timezone. Schedule 15 minutes–90 days ahead. ETA uploads privately first; YouTube publishes it publicly at the selected time. Allow extra time for large videos and processing.</p>}
          {!data.publicPublishing && <p className="rounded-lg bg-accent/60 p-3 text-xs leading-5">Private test uploads only. Public/unlisted publishing and scheduling remain disabled until the operator completes the YouTube API audit and enables them.</p>}
          <label className="block text-sm font-medium">Is this video made for kids? <span className="text-xs text-primary">Required</span><select id="youtube-kids" required value={kids} onChange={(event) => setKids(event.target.value)} className={field}><option value="">Choose Yes or No</option><option value="no">No, it is not made for kids</option><option value="yes">Yes, it is made for kids</option></select></label>
          <label className="block text-sm font-medium">Does it contain realistic altered or synthetic content? <span className="text-xs text-primary">Required</span><select id="youtube-synthetic" required aria-describedby="youtube-synthetic-help" value={synthetic} onChange={(event) => setSynthetic(event.target.value)} className={field}><option value="">Choose Yes or No — required before upload</option><option value="yes">Yes — disclose altered / synthetic content</option><option value="no">No — disclosure is not required for this video</option></select><span id="youtube-synthetic-help" className="mt-2 block text-xs font-normal leading-5 text-muted-foreground">Choose an answer even for AI-generated videos. Select Yes for realistic altered or synthetic content that requires disclosure; select No only when disclosure is not required. <a href="https://support.google.com/youtube/answer/14328491" target="_blank" rel="noopener noreferrer" className="underline">Read YouTube’s guidance</a>.</span></label>
          <label className="flex items-start gap-3 text-sm leading-6"><input id="youtube-consent" type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1.5 size-4 shrink-0 accent-blue-600" /><span>I reviewed this video, have permission to upload it, and confirm it follows <a href="https://www.youtube.com/howyoutubeworks/our-commitments/standing-up-against-harmful-content/" target="_blank" rel="noopener noreferrer" className="underline">YouTube’s Community Guidelines</a>. I authorize uploading it to the channel above with these settings.</span></label>
          <div id="youtube-upload-checklist" className="rounded-xl border border-primary/20 bg-accent/50 p-4 text-sm leading-6">
            <p className="font-semibold" aria-live="polite">{requirements.length ? `Before you upload: ${requirements.length} ${requirements.length === 1 ? "choice" : "choices"} remaining` : "Ready to upload — review your settings, then submit."}</p>
            {requirements.length > 0 && <ul className="mt-2 space-y-1">{requirements.map((requirement) => <li key={requirement.id}><button type="button" className="text-left text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => document.getElementById(requirement.id)?.focus()}>{requirement.message}</button></li>)}</ul>}
          </div>
          <Button type="submit" className="w-full" aria-describedby="youtube-upload-checklist" disabled={!ready || pending}><Youtube />{pending ? "Saving…" : mode === "schedule" ? "Upload & schedule on YouTube" : visibility === "private" ? "Upload privately to YouTube" : `Publish ${visibility === "public" ? "publicly" : "unlisted"} on YouTube`}</Button>
        </fieldset></form>
        {uploadFeedback && <div role="status" className="mt-4 rounded-xl border border-primary/20 bg-accent p-4 text-sm leading-6"><p>{uploadFeedback.text}</p>{uploadFeedback.queued && <a href="#uploads-heading" className="mt-2 inline-block font-medium text-primary underline">View upload progress ↓</a>}</div>}
      </section>
      <aside className="space-y-6"><section className="rounded-2xl border border-border bg-accent/40 p-6 sm:p-8"><Film className="size-7 text-primary" /><h2 className="editorial mt-4 text-2xl">Your video, your channel.</h2>{video ? <><p className="mt-4 font-medium">{video.title}</p><p className="mt-2 text-sm capitalize text-muted-foreground">{video.kind} export · Original completed MP4</p><Button asChild variant="outline" className="mt-5"><Link href={video.href} target="_blank">Review video <ExternalLink /></Link></Button></> : <p className="mt-4 text-sm leading-7 text-muted-foreground">Choose a finished video to review it before uploading. ETA uses your original export and never changes the video’s aspect ratio.</p>}
        <ul className="mt-6 space-y-4 text-sm leading-6 text-muted-foreground"><li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-primary" />Uploads resume from their saved checkpoint after a temporary interruption.</li><li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-primary" />Scheduled publication happens on YouTube after upload and processing.</li><li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-primary" />Vertical/square videos may qualify as Shorts under YouTube’s rules; there is no guaranteed “Shorts” switch.</li></ul>
      </section><section className="rounded-2xl border border-border p-6"><CalendarClock className="size-5 text-primary" /><h2 className="mt-3 font-semibold">Need to change your plans?</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Cancel below to stop an upload or clear a YouTube schedule and keep the uploaded video private. Cancellation is not confirmed until YouTube responds. If publication is near, make it private directly in YouTube Studio.</p><p className="mt-3 text-sm leading-6 text-muted-foreground">Facebook Pages have a separate tab above. Instagram, TikTok and X connections are not available yet.</p></section></aside>
    </div>
    <section aria-labelledby="uploads-heading" className="mt-12"><div className="flex flex-wrap items-center justify-between gap-4"><h2 id="uploads-heading" className="editorial text-3xl">Your publishing queue.</h2><label className="text-sm">Show<select className="ml-3 rounded-lg border border-border bg-card px-3 py-2" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All uploads</option><option value="active">Active & scheduled</option><option value="done">Completed</option><option value="attention">Needs attention</option><option value="cancelled">Cancelled</option></select></label></div><p className="mt-3 text-xs text-muted-foreground">All queue times are UTC. Auto-refresh every 15 seconds. YouTube status checks run in the background.</p>
      <div className="mt-6 space-y-4">{posts.length ? posts.map((post) => <article key={post.id} className="rounded-2xl border border-border bg-card p-6"><div className="flex flex-wrap justify-between gap-5"><div className="min-w-0 flex-1"><span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">{labels[post.status]}</span><h3 className="mt-3 break-words text-lg font-semibold">{post.title}</h3><p className="mt-2 text-xs text-muted-foreground">Created {time(post.created_at)} · {post.scheduled_at ? `Publish ${time(post.scheduled_at)}` : `Requested ${post.visibility}`}</p>{post.total_bytes && !["published", "private", "cancelled", "failed"].includes(post.status) ? <p className="mt-2 text-xs">Upload progress: {Math.min(100, Math.floor(post.uploaded_bytes / post.total_bytes * 100))}%</p> : null}{post.remote_privacy && <p className="mt-2 text-xs text-muted-foreground">Last confirmed YouTube visibility: {post.remote_privacy}</p>}<p className="mt-2 break-all text-[10px] text-muted-foreground">Upload ID: {post.id}</p></div><div className="flex flex-wrap items-start gap-2">{post.youtubeUrl && <Button asChild variant="outline" size="sm"><a href={post.youtubeUrl} target="_blank" rel="noopener noreferrer">YouTube <ExternalLink /></a></Button>}{post.status !== "cancelled" && <Button variant="outline" size="sm" disabled={pending || linked?.status !== "connected"} onClick={() => action(() => refreshYouTubePost(post.id), "Status check queued. This may take a moment.")}><RefreshCw /> Retry / refresh</Button>}{!["published", "private", "cancelled"].includes(post.status) && <Button variant="outline" size="sm" disabled={pending} className="text-red-600" onClick={() => { if (window.confirm("Cancel this upload or schedule? Any uploaded video will be kept private, not deleted.")) action(() => cancelYouTubePost(post.id), "Cancellation requested. Wait for confirmation before disconnecting."); }}>{post.cancel_requested ? "Retry cancellation" : "Cancel"}</Button>}</div></div>{post.error_message && <p className="mt-4 rounded-lg bg-accent/60 p-3 text-sm leading-6" role="status">{post.error_message}</p>}{post.status === "cancelling" && <p className="mt-3 text-xs leading-5 text-muted-foreground">Stop requested, not yet confirmed. Use YouTube Studio if the scheduled publication time is close.</p>}{post.status === "cancelled" && <p className="mt-3 text-xs leading-5 text-muted-foreground">Cancelled. Any completed upload remains private on YouTube; your ETA source video is unchanged.</p>}</article>) : <div className="rounded-2xl border border-dashed border-border p-10 text-center"><Youtube className="mx-auto size-8 text-muted-foreground" /><p className="mt-4 font-medium">No uploads in this view yet.</p><p className="mt-2 text-sm text-muted-foreground">Your saved uploads and confirmed schedules will appear here.</p></div>}</div>
    </section>
    <p className="mt-10 text-xs leading-6 text-muted-foreground">By using YouTube publishing you agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="underline">YouTube Terms of Service</a> and <Link href="/terms#youtube" className="underline">ETA publishing terms</Link>. Read our <Link href="/privacy#youtube" className="underline">YouTube data policy</Link>. Uploading does not guarantee processing, public visibility, Shorts classification or platform approval.</p>
  </main>;
}
