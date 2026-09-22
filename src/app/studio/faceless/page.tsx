import { redirect } from "next/navigation";
import { getViewer, createClient } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { FacelessCreator } from "@/components/studio/faceless-creator";
export const metadata={title:"Faceless video generator",robots:{index:false,follow:false}};
export default async function FacelessPage(){const viewer=await getViewer();if(!viewer)redirect("/login?next=/studio/faceless");const db=await createClient();let projects:{id:string;title:string;status:string}[]=[];if(db&&!viewer.fixture){const {data}=await db.from("faceless_projects").select("id,title,status").order("created_at",{ascending:false}).limit(20);projects=data||[];}return <WorkspaceShell title="Faceless video studio" active="Faceless videos"><FacelessCreator demo={viewer.fixture} projects={projects}/></WorkspaceShell>;}
