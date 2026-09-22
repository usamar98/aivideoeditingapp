import { notFound, redirect } from "next/navigation";
import { createClient,getViewer } from "@/lib/supabase/server";
import { defaultBrief,sampleStoryboard,type FacelessProject } from "@/lib/faceless/schema";
import { WorkspaceShell } from "@/components/studio/workspace-shell";
import { FacelessEditor } from "@/components/studio/faceless-editor";
import { z } from "zod";
export const metadata={title:"Faceless storyboard",robots:{index:false,follow:false}};
export default async function FacelessProjectPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const viewer=await getViewer();if(!viewer)redirect(`/login?next=${encodeURIComponent(`/studio/faceless/${id}`)}`);
  let project:FacelessProject;let videoUrl:string|null=null;
  if(id==="demo"){project={id:"demo",title:sampleStoryboard.title,brief:{...defaultBrief,topic:"An inviting short about looking up at the stars."},storyboard:sampleStoryboard,status:"ready",generation_id:null,output_path:null,error_message:null};}
  else{if(!z.string().uuid().safeParse(id).success)notFound();const db=await createClient();if(!db)notFound();const {data,error}=await db.from("faceless_projects").select("*").eq("id",id).eq("user_id",viewer.id).single();if(error||!data)notFound();project=data as FacelessProject;if(project.status==="complete"&&project.output_path){const {data:signed}=await db.storage.from("private-media").createSignedUrl(project.output_path,900);videoUrl=signed?.signedUrl||null;}}
  return <WorkspaceShell title="Faceless storyboard" active="Faceless videos"><FacelessEditor key={id} initial={project} demo={id==="demo"} initialVideoUrl={videoUrl}/></WorkspaceShell>;
}
