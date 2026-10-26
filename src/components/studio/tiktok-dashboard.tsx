"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CalendarClock, ExternalLink, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelTikTokPost, disconnectTikTok, publishToTikTok, refreshTikTokPost } from "@/app/studio/social/tiktok/actions";
import type { TikTokDashboardData, TikTokPrivacy, TikTokStatus } from "@/lib/social/tiktok-types";
import type { LibraryVideo } from "@/lib/social/types";

const field = "mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50";
const check = "flex items-start gap-2 text-sm leading-6 has-disabled:opacity-50";
const privacyLabels: Record<TikTokPrivacy, string> = { PUBLIC_TO_EVERYONE: "Everyone", MUTUAL_FOLLOW_FRIENDS: "Friends (mutual followers)", FOLLOWER_OF_CREATOR: "Followers", SELF_ONLY: "Only me" };
const labels: Record<TikTokStatus, string> = { queued: "Waiting for worker", scheduled: "Scheduled in Create AI Videos", publishing: "Sending to TikTok", processing: "TikTok processing", published: "Published", cancelled: "Cancelled", needs_attention: "Needs attention" };
const sourceKey = (video: LibraryVideo) => `${video.kind}:${video.projectId}:${video.outputKey}`;
const time = (value: string) => `${new Date(value).toISOString().replace("T", " ").slice(0, 16)} UTC`;
type Result = { error?: string; warning?: string; id?: string; success?: boolean };

export function TikTokDashboard({ initial, notice }: { initial: TikTokDashboardData; notice: string | null }) {
  const [data, setData] = useState(initial), [message, setMessage] = useState(notice), [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(""), [caption, setCaption] = useState(""), [privacy, setPrivacy] = useState("");
  const [comments, setComments] = useState(false), [duet, setDuet] = useState(false), [stitch, setStitch] = useState(false);
  const [commercial, setCommercial] = useState(false), [ownBrand, setOwnBrand] = useState(false), [branded, setBranded] = useState(false);
  const [synthetic, setSynthetic] = useState(""), [rights, setRights] = useState(false), [music, setMusic] = useState(false), [brandPolicy, setBrandPolicy] = useState(false);
  const [mode, setMode] = useState("now"), [scheduled, setScheduled] = useState(""), [feedback, setFeedback] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; url: string; loaded: boolean } | null>(null), [previewRetry, setPreviewRetry] = useState(0);
  const mounted = useRef(true), controller = useRef<AbortController | null>(null), inFlight = useRef(false);
  const creatorSignature = useRef(JSON.stringify([initial.creator, initial.connection]));
  const submission = useRef<{ signature: string; id: string } | null>(null);
  const linked = data.connection, creator = data.creator, video = data.videos.find((v) => sourceKey(v) === selected);
  const ready = !data.demo && data.configured && data.publishingEnabled && !data.error && linked?.status === "connected" && Boolean(creator);
  const options = (creator?.privacy_level_options || []).filter((p) => data.publicPosting || p === "SELF_ONLY");
  const validPrivacy = options.includes(privacy as TikTokPrivacy) && !(privacy === "SELF_ONLY" && branded);
  const privateTesting = !data.publicPosting && Boolean(creator?.privacy_level_options.includes("PUBLIC_TO_EVERYONE"));
  const previewReady = preview?.key === selected && preview.loaded;
  const canPublish = ready && !privateTesting && validPrivacy && previewReady && synthetic !== "" && rights && music && (!commercial || ownBrand || branded) && (!branded || brandPolicy);

  const reload = useCallback(async () => {
    if (initial.demo || !initial.configured || inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 75_000);
    try {
      const response = await fetch("/api/social/tiktok", { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error("Refresh failed");
      const updated: TikTokDashboardData = await response.json();
      if (!mounted.current) return;
      const signature = JSON.stringify([updated.creator, updated.connection]);
      if (signature !== creatorSignature.current) {
        creatorSignature.current = signature;
        setPrivacy(""); setComments(false); setDuet(false); setStitch(false); setRights(false); setMusic(false); setBrandPolicy(false);
      }
      setData(updated);
    } catch { if (mounted.current) setMessage("Could not refresh TikTok. Saved posts are unchanged. Refresh again or sign in if your session expired."); }
    finally { clearTimeout(timeout); inFlight.current = false; }
  }, [initial.demo, initial.configured]);
  useEffect(() => {
    mounted.current = true;
    const timer = initial.demo || !initial.configured ? null : setInterval(() => { if (!document.hidden) void reload(); }, 30_000);
    return () => { mounted.current = false; controller.current?.abort(); if (timer) clearInterval(timer); };
  }, [initial.demo, initial.configured, reload]);
  useEffect(() => {
    if (!selected || data.demo || !data.configured) return;
    const [kind, projectId, outputKey] = selected.split(":"), request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 20_000);
    void fetch(`/api/social/tiktok/preview?${new URLSearchParams({ kind, projectId, outputKey })}`, { cache: "no-store", signal: request.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Preview failed"); return response.json(); })
      .then((result) => { if (!request.signal.aborted) setPreview({ key: selected, url: result.url, loaded: false }); })
      .catch(() => { if (!request.signal.aborted) setFeedback("Preview unavailable. Reload the preview before publishing."); })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); request.abort(); };
  }, [selected, previewRetry, data.demo, data.configured]);
  function action(run: () => Promise<Result>, success: string) {
    startTransition(async () => {
      try { const result = await run(); setMessage(result.error || result.warning || success); await reload(); }
      catch { setMessage("The request could not be confirmed. Refresh before trying again."); }
    });
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canPublish || pending || !video) return;
    const date = mode === "schedule" ? new Date(scheduled) : null;
    if (date && (!Number.isFinite(date.getTime()) || date.getTime() < Date.now() + 15 * 60_000 || date.getTime() > Date.now() + 90 * 86400_000)) { setFeedback("Schedule between 15 minutes and 90 days from now."); return; }
    const input = { source: { kind: video.kind, projectId: video.projectId, outputKey: video.outputKey }, caption, privacy, allowComments: comments, allowDuet: duet, allowStitch: stitch,
      commercialContent: commercial, brandOrganic: ownBrand, brandedContent: branded, syntheticMedia: synthetic === "yes", rightsConfirmed: true, musicConfirmed: true, brandedPolicyConfirmed: brandPolicy, scheduledAt: date?.toISOString() || null };
    const signature = JSON.stringify(input);
    if (submission.current?.signature !== signature) submission.current = { signature, id: crypto.randomUUID() };
    const requestId = submission.current.id;
    startTransition(async () => {
      try { const result = await publishToTikTok({ ...input, requestId }); setFeedback(result.error || result.warning || "Post saved. TikTok processing may take a few minutes before it appears on your profile. Follow the queue below."); await reload(); }
      catch { setFeedback("The request could not be confirmed. Refresh the queue before submitting again."); }
    });
  }
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-primary">TikTok Direct Post</p><h1 className="editorial mt-3 text-4xl sm:text-5xl">Made here. Shared on TikTok.</h1><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Preview your finished video, choose who sees it, and publish now or schedule it in Create AI Videos. TikTok processing may take a few minutes.</p></div><Button variant="outline" disabled={pending || data.demo || !data.configured} onClick={() => void reload()}><RefreshCw />Refresh</Button></header>
    {message && <p role="status" className="mt-6 rounded-xl border border-primary/20 bg-accent p-4 text-sm leading-6">{message}</p>}
    {(data.demo || !data.configured || data.error || !data.publishingEnabled) && <div className="mt-6 rounded-xl border border-primary/20 bg-accent/60 p-5 text-sm leading-6"><strong>{data.demo ? "Demo preview — no TikTok account is connected." : "TikTok setup required."}</strong><p>{data.error || (!data.configured ? "The operator must configure a TikTok developer app with Login Kit and Content Posting API, verify the media domain, apply the migration and deploy the worker." : "Publishing is disabled by the operator. Connecting does not post any video.")}</p><a href="https://developers.tiktok.com/" target="_blank" rel="noopener noreferrer" className="underline">TikTok developer portal</a></div>}
    {!data.publicPosting && <p className="mt-5 rounded-xl border border-border p-4 text-sm leading-6">Private testing only until TikTok approves the Direct Post audit: use a private TikTok account and choose Only me. {privateTesting && <strong>Set your TikTok account to private, then refresh before posting.</strong>}</p>}
    <section aria-labelledby="tiktok-account-heading" className="mt-8 rounded-2xl border border-border bg-card p-6"><div className="flex flex-wrap justify-between gap-5"><div><h2 id="tiktok-account-heading" className="text-lg font-semibold">{creator?.creator_nickname || linked?.display_name || "Connect your TikTok account"}</h2><p className="mt-2 text-sm text-muted-foreground">{linked ? `@${creator?.creator_username || linked.username} · ${linked.status === "connected" ? "Connected" : linked.status === "reconnect" ? "Access expired — reconnect the same account" : "Disconnect pending"}` : "Choose the TikTok creator account you want to publish to."}</p></div><div className="max-w-md space-y-3">
      {(!linked || linked.status === "reconnect") && <form action="/api/social/tiktok/connect" method="post" className="space-y-3"><label className={check}><input type="checkbox" name="policy" value="agree" required className="mt-1.5 accent-blue-600" /><span>I agree to the <Link href="/privacy#tiktok" className="underline">TikTok data policy</Link> and <Link href="/terms#tiktok" className="underline">publishing terms</Link>.</span></label><Button type="submit" disabled={data.demo || !data.configured || pending}><Link2 />{linked ? "Reconnect TikTok" : "Connect TikTok"}</Button></form>}
      {linked && <Button variant="outline" disabled={pending} onClick={() => { if (window.confirm("Remove the TikTok connection, tokens and publishing history? Pending Create AI Videos schedules stop. Videos already sent to TikTok remain there; manage them in TikTok. YouTube, Facebook and source videos are unchanged.")) action(disconnectTikTok, "TikTok connection removed. Videos already sent remain on TikTok."); }}>Disconnect TikTok</Button>}
    </div></div><p className="mt-5 flex gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="size-4 shrink-0" />Separate profile and publishing permission. Credentials stay encrypted on the server; no TikTok password is stored.</p></section>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]"><section className="rounded-2xl border border-border bg-card p-6 sm:p-8"><h2 className="editorial text-3xl">Prepare your post.</h2><form className="mt-6" onSubmit={submit}><fieldset disabled={!ready || pending} className="space-y-5 disabled:opacity-60"><legend className="sr-only">TikTok post details</legend>
      <label className="block text-sm font-medium">Completed video<select required className={field} value={selected} onChange={(event) => { setSelected(event.target.value); setPreview(null); setRights(false); setMusic(false); setFeedback(null); }}><option value="">Choose a completed video</option>{data.videos.map((v) => <option key={sourceKey(v)} value={sourceKey(v)}>{v.kind} · {v.title}</option>)}</select></label>
      {!data.videos.length && <p className="text-sm text-muted-foreground">Your completed faceless videos, cartoons, ads and Shorts appear here. <Link href="/studio" className="underline">Create a video first.</Link></p>}
      <label className="block text-sm font-medium">Caption<textarea rows={4} maxLength={2200} className={field} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Your caption, hashtags and credits" /></label>
      <label className="block text-sm font-medium">Who can watch this video?<select required className={field} value={privacy} onChange={(event) => setPrivacy(event.target.value)}><option value="">Choose privacy — no default</option>{options.map((p) => <option key={p} value={p} disabled={p === "SELF_ONLY" && branded}>{privacyLabels[p]}</option>)}</select></label>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Allow interactions (off until you choose)</legend><label className={check}><input type="checkbox" checked={comments} disabled={creator?.comment_disabled} onChange={(event) => setComments(event.target.checked)} className="mt-1.5" />Comments{creator?.comment_disabled && " — disabled in TikTok"}</label><label className={check}><input type="checkbox" checked={duet} disabled={creator?.duet_disabled} onChange={(event) => setDuet(event.target.checked)} className="mt-1.5" />Duet{creator?.duet_disabled && " — disabled in TikTok"}</label><label className={check}><input type="checkbox" checked={stitch} disabled={creator?.stitch_disabled} onChange={(event) => setStitch(event.target.checked)} className="mt-1.5" />Stitch{creator?.stitch_disabled && " — disabled in TikTok"}</label></fieldset>
      <div className="space-y-3 rounded-xl border border-border p-4"><label className={check}><input type="checkbox" role="switch" checked={commercial} onChange={(event) => { setCommercial(event.target.checked); setOwnBrand(false); setBranded(false); setBrandPolicy(false); }} className="mt-1.5" /><span>Disclose commercial content<p className="text-xs text-muted-foreground">Turn on if this video promotes yourself, a brand, product or service.</p></span></label>{commercial && <><label className={check}><input type="checkbox" checked={ownBrand} onChange={(event) => setOwnBrand(event.target.checked)} className="mt-1.5" /><span>Your brand — promoting yourself or your own business</span></label><label className={check}><input type="checkbox" checked={branded} disabled={privacy === "SELF_ONLY"} onChange={(event) => { setBranded(event.target.checked); setBrandPolicy(false); }} className="mt-1.5" /><span>Branded content — promoting another brand or third party</span></label>{privacy === "SELF_ONLY" && <p className="text-xs text-muted-foreground">Branded content visibility cannot be set to private. Choose another available privacy option yourself to enable it.</p>}{(ownBrand || branded) ? <p className="text-xs font-medium">Your video will be labeled as “{branded ? "Paid partnership" : "Promotional content"}”.</p> : <p className="text-xs">You need to indicate if your content promotes yourself, a third party, or both.</p>}</>}</div>
      <label className="block text-sm font-medium">Does this video contain AI-generated or digitally altered content?<select required value={synthetic} onChange={(event) => setSynthetic(event.target.value)} className={field}><option value="">Choose Yes or No</option><option value="yes">Yes — request TikTok’s AI-generated label</option><option value="no">No</option></select></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">When<select className={field} value={mode} onChange={(event) => setMode(event.target.value)}><option value="now">Publish now</option><option value="schedule">Schedule in Create AI Videos</option></select></label>{mode === "schedule" && <label className="block text-sm font-medium">Start date & time<input required type="datetime-local" className={field} value={scheduled} onChange={(event) => setScheduled(event.target.value)} /></label>}</div>
      {mode === "schedule" && <p className="text-xs leading-5 text-muted-foreground">Your local timezone, 15 minutes–90 days ahead, stored as UTC. Create AI Videos starts sending at that time; this is not a native TikTok schedule. Processing can delay publication. Starts missed by over 15 minutes pause for review.</p>}
      <label className={check}><input type="checkbox" required checked={rights} onChange={(event) => setRights(event.target.checked)} className="mt-1.5" /><span>I reviewed the video and authorize uploading it to the TikTok account above with these settings. I have the necessary rights and permissions.</span></label>
      <label className={check}><input type="checkbox" required checked={music} onChange={(event) => setMusic(event.target.checked)} className="mt-1.5" /><span>By posting, you agree to TikTok’s <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer" className="underline">Music Usage Confirmation</a>{branded && <> and <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener noreferrer" className="underline">Branded Content Policy</a></>}.</span></label>
      {branded && <label className={check}><input type="checkbox" required checked={brandPolicy} onChange={(event) => setBrandPolicy(event.target.checked)} className="mt-1.5" /><span>I confirm this paid partnership complies with TikTok’s Branded Content Policy.</span></label>}
      <p className="text-xs leading-5 text-muted-foreground">After you publish, it may take a few minutes for TikTok to process the video and show it on your profile. Your chosen privacy still applies.</p>
      <Button type="submit" disabled={!canPublish || pending} title={commercial && !ownBrand && !branded ? "You need to indicate if your content promotes yourself, a third party, or both." : undefined}><CalendarClock />{pending ? "Saving…" : mode === "schedule" ? "Schedule TikTok post" : "Publish to TikTok"}</Button>
    </fieldset>{feedback && <p role="status" className="mt-5 rounded-xl bg-accent p-4 text-sm leading-6">{feedback}</p>}</form></section>
      <aside className="space-y-6"><section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-semibold">Review your video.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">9:16 H.264 MP4, 3–60 seconds, at least 540×960, 23–60 fps, up to 200 MiB, AAC audio if present. Your creator’s current duration limit also applies. No promotional watermark is added by publishing.</p>{video && <><p className="mt-4 text-sm font-medium">{video.title}</p>{preview?.key === selected && <video key={preview.url} src={preview.url} controls playsInline preload="metadata" aria-label="Selected TikTok video preview" className="mx-auto mt-4 max-h-[480px] w-full rounded-xl bg-black" onLoadedMetadata={() => setPreview((p) => p?.key === selected ? { ...p, loaded: true } : p)} onError={() => { setPreview(null); setFeedback("Video preview failed or expired. Reload it before posting."); }} />}<Button variant="outline" className="mt-4" onClick={() => { setPreview(null); setPreviewRetry((v) => v + 1); }}><RefreshCw />Reload preview</Button><Link href={video.href} className="mt-4 block text-sm text-primary underline">Open source project</Link>{!previewReady && <p className="mt-3 text-xs text-muted-foreground">Load the preview before publishing.</p>}</>}</section><section className="rounded-2xl border border-border p-6"><h2 className="font-semibold">Your account. Your choices.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Cancel before sending starts. Once a publishing request may have reached TikTok, manage the video directly in TikTok. Check status only reconciles an existing request; it never automatically creates a replacement.</p><a href="https://www.tiktok.com/" target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm text-primary underline">Open TikTok</a></section></aside>
    </div>
    <section aria-labelledby="tiktok-queue-heading" className="mt-12"><h2 id="tiktok-queue-heading" className="editorial text-3xl">Your TikTok queue.</h2><p className="mt-3 text-xs text-muted-foreground">Times are UTC. Auto-refresh every 30 seconds while visible. Publishing uses no generation credits.</p><div className="mt-6 space-y-4">{data.posts.length ? data.posts.map((post) => <article key={post.id} className="rounded-2xl border border-border bg-card p-6"><div className="flex flex-wrap justify-between gap-5"><div className="min-w-0 flex-1"><span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">{labels[post.status]}</span><h3 className="mt-3 break-words font-semibold">{post.caption || "TikTok video"}</h3><p className="mt-2 text-xs text-muted-foreground">{privacyLabels[post.privacy]} · Created {time(post.created_at)}{post.scheduled_at && ` · Start ${time(post.scheduled_at)}`}</p><p className="mt-2 break-all text-[10px] text-muted-foreground">Post ID: {post.id}</p></div><div className="flex flex-wrap items-start gap-2">{post.tiktokUrl && <Button asChild variant="outline" size="sm"><a href={post.tiktokUrl} target="_blank" rel="noopener noreferrer">TikTok <ExternalLink /></a></Button>}{!["published", "cancelled"].includes(post.status) && <Button variant="outline" size="sm" disabled={pending || linked?.status !== "connected"} onClick={() => action(() => refreshTikTokPost(post.id), "Status check queued. Wait a moment, then refresh.")}>Check status</Button>}{!post.init_started_at && !["published", "cancelled"].includes(post.status) && <Button variant="outline" size="sm" disabled={pending} onClick={() => { if (window.confirm("Cancel before TikTok publishing starts? Your source video remains unchanged.")) action(() => cancelTikTokPost(post.id), "TikTok post cancelled before sending."); }}>Cancel</Button>}</div></div>{post.error_message && <p className="mt-4 rounded-lg bg-accent/60 p-3 text-sm leading-6">{post.error_message}</p>}{post.init_started_at && post.status !== "published" && <p className="mt-3 text-xs text-muted-foreground">TikTok may already have received this video. Check TikTok before creating another post.</p>}</article>) : <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No TikTok posts queued yet.</p>}</div></section>
  </main>;
}
