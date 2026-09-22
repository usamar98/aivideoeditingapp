import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({error:"Invalid project"},{status:400});
  const db = await createClient();
  if (!db) return Response.json({error:"Authentication unavailable"},{status:503});
  const {data:{user}} = await db.auth.getUser();
  if (!user) return Response.json({error:"Please sign in"},{status:401});
  const {data:project,error} = await db.from("faceless_projects").select("*").eq("id",id).eq("user_id",user.id).single();
  if (error || !project) return Response.json({error:"Project not found"},{status:404});
  let videoUrl:string|null = null;
  if (project.status === "complete" && project.output_path) {
    const {data} = await db.storage.from("private-media").createSignedUrl(project.output_path,900);
    videoUrl = data?.signedUrl || null;
  }
  return Response.json({project,videoUrl},{headers:{"Cache-Control":"private, no-store"}});
}
