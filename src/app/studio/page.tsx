import Link from "next/link";
import { Film, FolderOpen } from "lucide-react";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Card } from "@/components/ui/card";
import { getViewer,createClient } from "@/lib/supabase/server";

export default async function StudioLibraryPage(){
  const viewer=await getViewer();if(!viewer)redirect("/login?next=/studio");
  const db=await createClient();let projects:{id:string;title:string;status:string;created_at:string;href:string}[]=[];
  if(db&&!viewer.fixture){
    const [faceless,cartoons,ugc,shorts]=await Promise.all([
      db.from("faceless_projects").select("id,title,status,created_at").eq("user_id",viewer.id).order("created_at",{ascending:false}).limit(9),
      db.from("cartoon_projects").select("id,title,status,created_at").eq("user_id",viewer.id).order("created_at",{ascending:false}).limit(9),
      db.from("ugc_projects").select("id,title,status,created_at").eq("user_id",viewer.id).order("created_at",{ascending:false}).limit(9),
      db.from("shorts_projects").select("id,title,status,created_at").eq("user_id",viewer.id).order("created_at",{ascending:false}).limit(9),
    ]);
    projects=[...(faceless.data||[]).map((p)=>({...p,href:`/studio/faceless/${p.id}`})),...(cartoons.data||[]).map((p)=>({...p,href:`/studio/cartoons/${p.id}`})),...(ugc.data||[]).map((p)=>({...p,href:`/studio/ugc/${p.id}`})),...(shorts.data||[]).map((p)=>({...p,href:`/studio/shorts/${p.id}`}))].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,9);
  }
  return <WorkspaceShell title="Your creative workspace" active="Projects"><main className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><p className="eyebrow text-primary">Welcome to your studio</p><h1 className="editorial mt-3 text-4xl sm:text-5xl">A good day to make something.</h1><p className="mt-4 text-muted-foreground">Pick your creative tool, or come back to a story you’ve started.</p>{viewer.fixture&&<p className="mt-6 rounded-xl border border-primary/20 bg-accent/50 p-4 text-sm">Demo workspace. Sample projects are labelled; real generation, billing, and account updates require a connected account.</p>}
    <section className="@container" aria-label="Creative tools"><FeatureGrid mode="studio" published={["faceless-video-generator", "ai-cartoon-series", "ai-ugc-product-ads", "podcast-to-shorts"]} /></section>
    <section className="mt-12"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Recent projects</h2><Link href="/studio/jobs" className="text-sm text-primary">View all jobs →</Link></div>{projects.length>0?<div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map((project)=><Link href={project.href} key={project.id}><Card className="p-5 hover:border-primary"><Film className="mb-5 size-5 text-primary" /><h3 className="font-semibold">{project.title}</h3><p className="mt-2 text-xs capitalize text-muted-foreground">{project.status}</p></Card></Link>)}</div>:<div className="mt-5 rounded-xl border border-dashed border-border p-10 text-center"><FolderOpen className="mx-auto size-7 text-muted-foreground" /><p className="mt-4 font-medium">Your next story belongs here.</p><p className="mt-2 text-sm text-muted-foreground">Saved video projects will appear here when you create them.</p></div>}</section>
  </main></WorkspaceShell>;
}
