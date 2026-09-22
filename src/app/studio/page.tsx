import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, FolderKanban, Plus, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/studio/app-sidebar";
import { BrandMark } from "@/components/studio/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getIntegrationStatuses } from "@/lib/integrations";
import { getViewer } from "@/lib/supabase/server";

export default async function StudioLibraryPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/studio");
  const integrations = getIntegrationStatuses();
  const configured = integrations.filter((item) => item.configured).length;
  const missing = integrations.filter((item) => !item.configured);

  return (
    <div className="flex min-h-screen">
      <AppSidebar active="Projects" />
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-border px-5 sm:px-8">
          <BrandMark className="md:hidden" />
          <div className="hidden md:block"><h1 className="text-base font-semibold">Project library</h1><p className="text-xs text-muted-foreground">Continue a series or start a new story world.</p></div>
          <Button size="sm"><Plus /> New series</Button>
        </header>
        <main className="mx-auto max-w-7xl p-5 sm:p-8">
          {viewer.fixture && (
            <div className="mb-6 flex flex-col justify-between gap-4 rounded-xl border border-amber/25 bg-amber/8 p-4 sm:flex-row sm:items-center">
              <div><p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><TriangleAlert className="size-4" /> Development fixture</p><p className="mt-1 text-sm text-muted-foreground">The workspace is interactive, but no real generation or billing call will be reported as successful.</p>{missing.length > 0 && <p className="mt-2 text-xs text-amber-100">Unavailable until configured: {missing.map((item) => item.label).join(", ")}.</p>}</div>
              <Badge variant="warning">{configured}/{integrations.length} integrations connected</Badge>
            </div>
          )}

          <section aria-labelledby="series-heading">
            <div><h2 id="series-heading" className="text-2xl font-bold tracking-tight">Your series</h2><p className="mt-1 text-sm text-muted-foreground">Characters, voices, guides, and episode history stay together.</p></div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
              <Link href="/studio/series/pip-and-moss/episodes/the-cloud-in-a-jar" className="group">
                <Card className="h-full overflow-hidden transition-colors group-hover:border-primary/45">
                  <div className="relative aspect-[16/8] overflow-hidden bg-secondary"><Image src="/demo/windy-rooftop.png" alt="Pip and Moss on their workshop rooftop" fill loading="eager" fetchPriority="high" sizes="(max-width: 1024px) 100vw, 65vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" /><div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" /><div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5"><div><Badge variant="success">Active series</Badge><h3 className="mt-2 text-2xl font-bold text-white">Pip & Moss</h3><p className="mt-1 text-sm text-white/70">3 characters · 4 episodes · updated just now</p></div><span className="grid size-10 place-items-center rounded-full bg-white text-black"><ArrowRight className="size-4" /></span></div></div>
                </Card>
              </Link>
              <Card>
                <CardHeader><CardTitle>Generation queue</CardTitle><CardDescription>Persistent records let a worker reconcile a request before retrying it.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  {[{ title: "Scene 02 storyboard", meta: "Ready for review", ok: true }, { title: "Episode 03 export", meta: "Completed · 38.2 MB", ok: true }, { title: "Scene 05 animation", meta: "Released reservation after failure", ok: false }].map((item) => <div key={item.title} className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-lg ${item.ok ? "bg-primary/10 text-primary" : "bg-red-400/10 text-red-300"}`}>{item.ok ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.meta}</p></div></div>)}
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mt-8 grid gap-5 md:grid-cols-3" aria-label="Workspace summary">
            <Card><CardHeader><div className="flex items-center gap-2 text-primary"><FolderKanban className="size-4" /><span className="text-sm font-medium">Projects</span></div><CardTitle className="text-3xl">1</CardTitle><CardDescription>1 active series, no archived projects</CardDescription></CardHeader></Card>
            <Card><CardHeader><div className="flex items-center gap-2 text-primary"><Clock3 className="size-4" /><span className="text-sm font-medium">Video minutes</span></div><CardTitle className="text-3xl">2.4</CardTitle><CardDescription>Across approved development fixtures</CardDescription></CardHeader></Card>
            <Card><CardHeader><div className="flex items-center gap-2 text-primary"><CheckCircle2 className="size-4" /><span className="text-sm font-medium">Credits</span></div><CardTitle className="text-3xl">420</CardTitle><CardDescription>Database ledger is the source of truth</CardDescription></CardHeader></Card>
          </section>
        </main>
      </div>
    </div>
  );
}
