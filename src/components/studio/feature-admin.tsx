"use client";

import { useState } from "react";
import { Eye, Save, SearchCheck, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveFeatureAction } from "@/app/admin/features/actions";
import type { FeatureDefinition } from "@/lib/features/catalog";

export function FeatureAdmin({ initialFeatures, fixtureMode }: { initialFeatures: FeatureDefinition[]; fixtureMode: boolean }) {
  const [features, setFeatures] = useState(initialFeatures);
  const [selectedSlug, setSelectedSlug] = useState(initialFeatures[0].slug);
  const [saving, setSaving] = useState(false);
  const selected = features.find((item) => item.slug === selectedSlug) || features[0];
  const update = (patch: Partial<FeatureDefinition>) => setFeatures((items) => items.map((item) => item.slug === selected.slug ? { ...item, ...patch, modifiedAt: new Date().toISOString() } : item));
  const updateSeo = (patch: Partial<FeatureDefinition["seo"]>) => update({ seo: { ...selected.seo, ...patch } });

  const save = async (feature = selected) => {
    setSaving(true);
    if (fixtureMode) {
      window.localStorage.setItem("framefoundry:feature-catalog", JSON.stringify(features));
      toast.success("Development preview saved locally", { description: "No production content was published." });
      setSaving(false);
      return;
    }
    const result = await saveFeatureAction(feature);
    if (result.ok) toast.success(feature.status === "published" ? "Feature published" : "Draft saved", { description: "Public pages, metadata, and sitemap entries were refreshed." });
    else toast.error("Feature was not saved", { description: result.error });
    setSaving(false);
  };

  const publish = async () => {
    const published = { ...selected, status: "published" as const, publishedAt: new Date().toISOString(), modifiedAt: new Date().toISOString() };
    setFeatures((items) => items.map((item) => item.slug === selected.slug ? published : item));
    await save(published);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_22rem]">
      <Card className="h-fit"><CardHeader><CardTitle>Feature catalog</CardTitle><CardDescription>One typed source drives pages and search previews.</CardDescription></CardHeader><CardContent className="space-y-2">{features.map((feature) => <button key={feature.slug} onClick={() => setSelectedSlug(feature.slug)} className={`w-full rounded-lg border p-3 text-left ${feature.slug === selected.slug ? "border-primary/40 bg-primary/8" : "border-border bg-background/35"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{feature.name}</span><Badge variant={feature.status === "published" ? "success" : "warning"}>{feature.status}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">/{feature.slug}</p></button>)}</CardContent></Card>

      <div className="space-y-5">
        <Card><CardHeader><CardTitle>Approved content</CardTitle><CardDescription>Public pages render these facts as crawlable HTML. Editorial overrides remain intact.</CardDescription></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="feature-name">Feature name</Label><Input id="feature-name" value={selected.name} onChange={(event) => update({ name: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="feature-description">Factual description</Label><Textarea id="feature-description" value={selected.description} onChange={(event) => update({ description: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="heading">Main heading</Label><Input id="heading" value={selected.seo.heading} onChange={(event) => updateSeo({ heading: event.target.value, editorialOverride: true })} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="title">Page title</Label><Input id="title" value={selected.seo.title} onChange={(event) => updateSeo({ title: event.target.value, editorialOverride: true })} /><p className="text-xs text-muted-foreground">{selected.seo.title.length}/65</p></div><div className="space-y-2"><Label htmlFor="canonical">Canonical path</Label><Input id="canonical" value={selected.seo.canonicalPath} onChange={(event) => updateSeo({ canonicalPath: event.target.value, editorialOverride: true })} /></div></div>
          <div className="space-y-2"><Label htmlFor="meta-description">Meta description</Label><Textarea id="meta-description" value={selected.seo.description} onChange={(event) => updateSeo({ description: event.target.value, editorialOverride: true })} /><p className="text-xs text-muted-foreground">{selected.seo.description.length}/165</p></div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3"><div><p className="text-sm font-medium">Editorial override</p><p className="text-xs text-muted-foreground">Automatic suggestions cannot replace these fields.</p></div><Switch checked={selected.seo.editorialOverride} onCheckedChange={(editorialOverride) => updateSeo({ editorialOverride })} /></div>
        </CardContent></Card>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={saving} onClick={() => setFeatures(initialFeatures)}><Undo2 /> Reset</Button><Button variant="outline" disabled={saving} onClick={() => void save()}><Save /> {saving ? "Saving…" : "Save draft"}</Button><Button disabled={selected.developmentOnly || fixtureMode || saving} onClick={() => void publish()}><Send /> Publish</Button></div>
      </div>

      <div className="space-y-5">
        <Card><CardHeader><div className="flex items-center gap-2 text-primary"><SearchCheck className="size-4" /><CardTitle>Search preview</CardTitle></div></CardHeader><CardContent><p className="text-sm text-blue-300">{selected.seo.title}</p><p className="mt-1 text-xs text-primary">example.com{selected.seo.canonicalPath}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{selected.seo.description}</p></CardContent></Card>
        <Card><CardHeader><div className="flex items-center gap-2"><Eye className="size-4 text-primary" /><CardTitle>Publication checks</CardTitle></div></CardHeader><CardContent className="space-y-3 text-sm">{[
          ["Visible facts match structured data", true], ["Canonical path is unique", true], ["Included in sitemap", selected.status === "published" && !selected.developmentOnly], ["Social preview generated", true], ["Development-only guard", selected.developmentOnly],
        ].map(([label, ok]) => <div key={String(label)} className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><Badge variant={ok ? "success" : "outline"}>{ok ? "Pass" : "Pending"}</Badge></div>)}</CardContent></Card>
      </div>
    </div>
  );
}
