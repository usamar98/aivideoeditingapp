"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CalendarClock, ExternalLink, Film, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelFacebookPost, disconnectFacebook, publishToFacebook, refreshFacebookPost, selectFacebookPage } from "@/app/studio/social/facebook/actions";
import type { FacebookDashboardData, FacebookStatus } from "@/lib/social/facebook-types";
import type { LibraryVideo } from "@/lib/social/types";

const field = "mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60";
const labels: Record<FacebookStatus, string> = { queued: "Waiting for worker", scheduled: "Scheduled in ETA", uploading: "Uploading to Facebook", processing: "Facebook processing", publishing: "Confirming publication", published: "Published", cancelled: "Cancelled", needs_attention: "Needs attention" };
const sourceKey = (video: LibraryVideo) => `${video.kind}:${video.projectId}:${video.outputKey}`;
const time = (value: string) => `${new Date(value).toISOString().replace("T", " ").slice(0, 16)} UTC`;
type Result = { error?: string; warning?: string; id?: string; success?: boolean };

export function FacebookDashboard({ initial, notice }: { initial: FacebookDashboardData; notice: string | null }) {
  const [data, setData] = useState(initial), [message, setMessage] = useState(notice), [pending, startTransition] = useTransition();
  const [page, setPage] = useState(""), [selected, setSelected] = useState(""), [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [mode, setMode] = useState("now"), [scheduled, setScheduled] = useState(""), [synthetic, setSynthetic] = useState(""), [consent, setConsent] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inFlight = useRef(false), mounted = useRef(true), controller = useRef<AbortController | null>(null), submission = useRef<{ signature: string; id: string } | null>(null);
  const linked = data.connection, video = data.videos.find((item) => sourceKey(item) === selected);
  const ready = !data.demo && data.configured && data.publishingEnabled && !data.error && linked?.status === "connected";
  const reload = useCallback(async () => {
    if (initial.demo || inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 15_000);
    try {
      const response = await fetch("/api/social/facebook", { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error("refresh");
      const updated = await response.json();
      if (mounted.current) setData(updated);
    } catch { if (mounted.current) setMessage("Could not refresh Facebook. Saved requests are unchanged. Sign in again if your session expired."); }
    finally { clearTimeout(timeout); inFlight.current = false; }
  }, [initial.demo]);
  useEffect(() => {
    mounted.current = true;
    const timer = initial.demo ? null : setInterval(() => { if (!document.hidden) void reload(); }, 15_000);
    return () => { mounted.current = false; controller.current?.abort(); if (timer) clearInterval(timer); };
  }, [initial.demo, reload]);
  function action(run: () => Promise<Result>, success: string) {
    startTransition(async () => {
      try { const result = await run(); setMessage(result.error || result.warning || success); await reload(); }
      catch { setMessage("The request could not be confirmed. Refresh before trying again."); }
    });
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ready || pending || !video) return;
    const date = mode === "schedule" ? new Date(scheduled) : null;
    if (date && (!Number.isFinite(date.getTime()) || date.getTime() < Date.now() + 15 * 60_000 || date.getTime() > Date.now() + 90 * 86400_000)) {
      setFeedback("Choose a time between 15 minutes and 90 days from now."); return;
    }
    if (!title.trim() || !synthetic || !consent) { setFeedback("Complete the title, AI disclosure and publishing permission first."); return; }
    const input = { source: { kind: video.kind, projectId: video.projectId, outputKey: video.outputKey }, title, description, scheduledAt: date?.toISOString() || null, syntheticMedia: synthetic === "yes", rightsConfirmed: true };
    const signature = JSON.stringify(input);
    if (submission.current?.signature !== signature) submission.current = { signature, id: crypto.randomUUID() };
    const requestId = submission.current.id;
    startTransition(async () => {
      try { const result = await publishToFacebook({ ...input, requestId }); setFeedback(result.error || result.warning || "Reel saved. Follow its progress in Your Facebook queue below."); await reload(); }
      catch { setFeedback("The request could not be confirmed. Refresh the queue before submitting again."); }
    });
  }
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-primary">Facebook Page Reels</p><h1 className="editorial mt-3 text-4xl sm:text-5xl">From your studio to your Page.</h1><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Choose a completed vertical video, review its caption, and publish now or schedule it in ETA. Personal-profile posting is not supported.</p></div><Button variant="outline" disabled={pending || data.demo} onClick={() => void reload()}><RefreshCw />Refresh</Button></header>
    {message && <p role="status" className="mt-6 rounded-xl border border-primary/20 bg-accent p-4 text-sm leading-6">{message}</p>}
    {(data.demo || !data.configured || data.error || !data.publishingEnabled) && <div className="mt-6 rounded-xl border border-primary/20 bg-accent/60 p-5 text-sm leading-6"><strong>{data.demo ? "Demo preview — no Facebook account is connected." : "Facebook setup required."}</strong><p>{data.error || (!data.configured ? "The operator must configure the Meta app, encryption key, database migration and worker first." : "Publishing is disabled by the operator. You can connect an eligible test Page once the Meta app is configured.")}</p><p>No Reel will be posted from this preview.</p></div>}
    <section aria-labelledby="facebook-page-heading" className="mt-8 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-5"><div><h2 id="facebook-page-heading" className="text-lg font-semibold">{linked?.page_name || "Connect a Facebook Page"}</h2><p className="mt-2 text-sm text-muted-foreground">{linked ? `Page ${linked.page_id} · ${linked.status === "connected" ? "Connected" : linked.status === "reconnect" ? "Access expired — reconnect this Page" : "Disconnect pending — retry below"}` : "Sign in with the Facebook account that manages your Page."}</p></div>
        <div className="max-w-md space-y-3">{(!linked || linked.status === "reconnect") && <form action="/api/social/facebook/connect" method="post" className="space-y-3"><label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" name="policy" value="agree" required className="mt-1 accent-blue-600" /><span>I agree to ETA’s <Link href="/privacy#facebook" className="underline">Facebook data policy</Link> and <Link href="/terms#facebook" className="underline">publishing terms</Link>.</span></label><Button type="submit" disabled={data.demo || !data.configured || Boolean(data.error)}><Link2 />{linked ? "Reconnect Facebook" : "Connect Facebook"}</Button></form>}
          {(linked || data.pages.length > 0) && <Button variant="outline" disabled={pending} onClick={() => { if (window.confirm("Disconnect Facebook and remove ETA’s Facebook tokens, Page connection and publishing history? Pending ETA schedules will stop. Reels already sent for publication remain on Facebook: manage those in Meta Business Suite. Your ETA videos and YouTube connection are unchanged.")) action(disconnectFacebook, "Facebook connection and publishing history removed. Already published Reels remain on Facebook."); }}>Disconnect Facebook</Button>}
        </div>
      </div>
      <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" />ETA requests your Page list, Page information and permission to create Page posts. Tokens stay encrypted on the server; no Facebook password is stored.</p>
      {data.pages.length > 0 && <form className="mt-6 space-y-3 border-t border-border pt-5" onSubmit={(event) => { event.preventDefault(); action(() => selectFacebookPage(page), "Page connected. Review a Reel before publishing."); }}><label className="block text-sm font-medium">Which Page should ETA use?<select required className={field} value={page} onChange={(event) => setPage(event.target.value)}><option value="">Choose a Page</option>{data.pages.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><p className="text-xs text-muted-foreground">One Page per ETA account. This selection expires after ten minutes. Reconnecting must use the same Page; disconnect first to switch.</p><Button type="submit" disabled={pending || !page}>Use this Page</Button></form>}
    </section>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8"><h2 className="editorial text-3xl">Prepare your Reel.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Reels published here are public on the connected Page. This is not a private test-upload workflow.</p>
        <form className="mt-6" onSubmit={submit}><fieldset disabled={!ready || pending} className="space-y-5 disabled:opacity-60"><legend className="sr-only">Facebook Reel details</legend>
          <label className="block text-sm font-medium">Completed ETA video<select required className={field} value={selected} onChange={(event) => { setSelected(event.target.value); setTitle(data.videos.find((item) => sourceKey(item) === event.target.value)?.title.slice(0, 100) || ""); setConsent(false); setFeedback(null); }}><option value="">Choose your completed video</option>{data.videos.map((item) => <option key={sourceKey(item)} value={sourceKey(item)}>{item.kind} · {item.title}</option>)}</select></label>
          {!data.videos.length && <p className="text-sm leading-6 text-muted-foreground">Your completed faceless videos, cartoons, ad variants and Shorts appear here. <Link href="/studio" className="text-primary underline">Create a vertical video first.</Link></p>}
          <label className="block text-sm font-medium">Reel title<input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} className={field} /></label>
          <label className="block text-sm font-medium">Caption<textarea rows={4} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className={field} placeholder="Write your opening hook, context and credits" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">When<select className={field} value={mode} onChange={(event) => setMode(event.target.value)}><option value="now">Publish now</option><option value="schedule">Schedule in ETA</option></select></label>{mode === "schedule" && <label className="block text-sm font-medium">Start date & time<input required type="datetime-local" className={field} value={scheduled} onChange={(event) => setScheduled(event.target.value)} /></label>}</div>
          {mode === "schedule" && <p className="text-xs leading-5 text-muted-foreground">Use your device’s local timezone, 15 minutes–90 days ahead. ETA starts the upload at that time; Facebook processing can delay publication. If ETA is more than 15 minutes late starting publication, it pauses for your attention instead of posting late.</p>}
          <label className="block text-sm font-medium">Does this video contain AI-generated or digitally altered content?<select required value={synthetic} onChange={(event) => setSynthetic(event.target.value)} className={field}><option value="">Choose Yes or No</option><option value="yes">Yes — add an AI disclosure to my caption</option><option value="no">No</option></select></label>
          {synthetic === "yes" && <p className="rounded-lg bg-accent/60 p-3 text-xs leading-5">ETA will append: “AI-generated or digitally altered video.” This caption does not set Facebook’s native AI label. Apply any additional disclosure required by Meta in its own publishing tools.</p>}
          <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1.5 size-4 shrink-0 accent-blue-600" /><span>I reviewed this video, have the necessary rights and disclosures, and authorize ETA to publish it <strong>publicly</strong> to {linked?.page_name || "my connected Page"} with these settings, under <Link href="/terms#facebook" className="underline">the publishing terms</Link>.</span></label>
          <Button type="submit" className="w-full" disabled={!ready || pending}>{pending ? "Saving…" : mode === "schedule" ? "Schedule public Facebook Reel" : "Publish public Facebook Reel"}</Button>
        </fieldset></form>{feedback && <p role="status" className="mt-4 rounded-xl border border-primary/20 bg-accent p-4 text-sm leading-6">{feedback} <a href="#facebook-queue" className="underline">View queue</a></p>}
      </section>
      <aside className="space-y-6"><section className="rounded-2xl border border-border bg-accent/40 p-6 sm:p-8"><Film className="size-7 text-primary" /><h2 className="editorial mt-4 text-2xl">Made for the vertical feed.</h2><p className="mt-4 text-sm leading-7">This initial workflow accepts 9:16 H.264 MP4 videos, 4–60 seconds, at least 540×960, 23–60 fps, up to 200 MB (MiB), with AAC audio if present. Other exports must be re-exported first; ETA does not crop them automatically.</p>{video && <><p className="mt-4 font-medium">{video.title}</p><Button asChild variant="outline" className="mt-4"><Link href={video.href} target="_blank" rel="noopener noreferrer">Review video <ExternalLink /></Link></Button></>}</section>
        <section className="rounded-2xl border border-border p-6"><CalendarClock className="size-6 text-primary" /><h2 className="mt-3 font-semibold">Schedules stay under your control.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Cancel in ETA before publication starts. Once the request has been sent to Facebook, manage the Reel in Meta Business Suite. ETA checks uncertain results against the existing Reel rather than automatically publishing another copy.</p><a className="mt-4 inline-block text-sm text-primary underline" href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">Open Meta Business Suite</a></section>
      </aside>
    </div>
    <section id="facebook-queue" aria-labelledby="facebook-queue-heading" className="mt-12"><h2 id="facebook-queue-heading" className="editorial text-3xl">Your Facebook queue.</h2><p className="mt-3 text-xs text-muted-foreground">Queue times are UTC. Auto-refresh every 15 seconds. No ETA generation credits are charged for publishing.</p><div className="mt-6 space-y-4">
      {data.posts.length ? data.posts.map((post) => <article key={post.id} className="rounded-2xl border border-border bg-card p-6"><div className="flex flex-wrap justify-between gap-5"><div className="min-w-0 flex-1"><span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">{labels[post.status]}</span><h3 className="mt-3 break-words text-lg font-semibold">{post.title}</h3><p className="mt-2 text-xs text-muted-foreground">Created {time(post.created_at)} · {post.scheduled_at ? `Start ${time(post.scheduled_at)}` : "Public Reel"}</p><p className="mt-2 break-all text-[10px] text-muted-foreground">Post ID: {post.id}</p></div><div className="flex flex-wrap items-start gap-2">
        {post.facebookUrl && <Button asChild variant="outline" size="sm"><a href={post.facebookUrl} target="_blank" rel="noopener noreferrer">Facebook <ExternalLink /></a></Button>}
        {!["published", "cancelled"].includes(post.status) && <Button variant="outline" size="sm" disabled={pending || linked?.status !== "connected"} onClick={() => action(() => refreshFacebookPost(post.id), "Status check queued. Wait a moment, then refresh.")}><RefreshCw />Check status</Button>}
        {!post.finish_started_at && !["published", "cancelled"].includes(post.status) && <Button variant="outline" size="sm" disabled={pending} onClick={() => { if (window.confirm("Cancel this Reel before publication starts? Your ETA video is unchanged.")) action(() => cancelFacebookPost(post.id), "Reel cancelled before publication."); }}>Cancel</Button>}
      </div></div>{post.error_message && <p className="mt-4 rounded-lg bg-accent/60 p-3 text-sm leading-6">{post.error_message}</p>}{post.finish_started_at && post.status !== "published" && <p className="mt-3 text-xs leading-5 text-muted-foreground">Facebook may already have received the publication request. Check the existing Reel or Meta Business Suite before making another post.</p>}</article>) : <div className="rounded-2xl border border-dashed border-border p-10 text-center"><p className="font-medium">No Facebook Reels queued yet.</p><p className="mt-2 text-sm text-muted-foreground">Connect a Page and choose your finished vertical video to begin.</p></div>}
    </div></section>
  </main>;
}
