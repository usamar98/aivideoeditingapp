"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { requireAccount, publicError } from "@/lib/account";
import { briefSchema, storyboardSchema, scriptToStoryboard, validateNarration } from "@/lib/faceless/schema";
import { recordDispatchFailure, type JobStage } from "@/lib/jobs/diagnostics";
import type { facelessPipeline } from "../../../../trigger/faceless-pipeline";

export async function createFacelessProject(input: unknown) {
  try {
    const brief = briefSchema.parse(input);
    const account = await requireAccount();
    const storyboard = brief.mode === "script" ? scriptToStoryboard(brief) : null;
    const {count,error:countError} = await account.db.from("faceless_projects").select("id",{count:"exact",head:true}).gte("created_at",new Date(Date.now()-86400000).toISOString());
    if (countError) throw new Error("Apply the faceless-project migration before creating videos.");
    if ((count || 0) >= 50) throw new Error("Daily project limit reached. Continue one of your saved projects.");
    const id = randomUUID();
    const {error} = await account.admin.from("faceless_projects").insert({id,user_id:account.user.id,workspace_id:account.workspaceId,title:storyboard?.title || brief.topic.slice(0,70),brief,storyboard,status:storyboard ? "ready":"draft"});
    if (error) throw new Error("Could not save the video project.");
    revalidatePath("/studio/faceless");
    return {id};
  } catch(error) {return {error:publicError(error)};}
}

export async function saveFacelessStoryboard(id: string, input: unknown) {
  try {
    z.string().uuid().parse(id);
    const storyboard = storyboardSchema.parse(input);
    const {db,admin,user} = await requireAccount();
    const {data:project,error} = await db.from("faceless_projects").select("brief,status").eq("id",id).single();
    if (error || !project) throw new Error("Project not found.");
    validateNarration(storyboard,briefSchema.parse(project.brief).duration);
    const {data,error:saveError} = await admin.from("faceless_projects").update({storyboard,title:storyboard.title,status:"ready",output_path:null,error_message:null}).eq("id",id).eq("user_id",user.id).in("status",["draft","ready","complete","failed"]).select("id").maybeSingle();
    if (saveError || !data) throw new Error("Wait for the current job to finish before editing.");
    revalidatePath(`/studio/faceless/${id}`);
    return {ok:true};
  } catch(error) {return {error:publicError(error)};}
}

export async function startFacelessJob(id:string, kind:"script"|"render") {
  try {
    z.string().uuid().parse(id); z.enum(["script","render"]).parse(kind);
    const {db,admin,user} = await requireAccount();
    const needed = kind === "script" ? ["GEMINI_API_KEY","TRIGGER_SECRET_KEY"] : ["FAL_KEY","ELEVENLABS_API_KEY","ELEVENLABS_DEFAULT_VOICE_ID","TRIGGER_SECRET_KEY"];
    if (needed.some((key) => !process.env[key])) throw new Error("This generation service is not connected yet. Ask the owner to configure the provider and worker credentials.");
    const {data:project} = await db.from("faceless_projects").select("*").eq("id",id).single();
    if (!project) throw new Error("Project not found.");
    if (kind === "render") validateNarration(storyboardSchema.parse(project.storyboard),briefSchema.parse(project.brief).duration);
    const {data:generationId,error} = await admin.rpc("start_faceless_job",{project_id:id,owner_id:user.id,job_id:randomUUID(),job_kind:kind});
    if (error || !generationId) throw new Error(error?.message || "Could not reserve credits.");
    const {data:generation,error:readError} = await db.from("generations").select("settings,provider_request_id,status,cancel_requested_at").eq("id",generationId).single();
    if (readError || !generation) {
      const diagnostic = await recordDispatchFailure(admin, String(generationId), "read_saved_job", readError);
      return {error:`Could not retrieve the saved job. ${diagnostic} Open Jobs to cancel, or retry to reconnect without another charge.`};
    }
    if (generation.cancel_requested_at) throw new Error("This job is cancelling. Open Jobs to check its status or retry cancellation.");
    if (!generation.provider_request_id && generation.status === "reserved") {
      // An uncertain network response keeps the reservation. Retry uses the same durable key.
      let stage: JobStage = "submit_task";
      try {
        const handle = await tasks.trigger<typeof facelessPipeline>("faceless-pipeline",{generationId:String(generationId)},{idempotencyKey:String(generationId),idempotencyKeyTTL:"30d",concurrencyKey:user.id,tags:[`project:${id}`,`generation:${generationId}`]}, {retry:{maxAttempts:1}});
        stage = "save_run";
        const {data:dispatched,error:dispatchError} = await admin.from("generations").update({provider_request_id:handle.id,submitted_at:new Date().toISOString(),error_message:null}).eq("id",generationId).in("status",["reserved","submitted","processing"]).is("cancel_requested_at",null).select("cancel_requested_at").maybeSingle();
        if (dispatchError) throw dispatchError;
        if (!dispatched) {
          revalidatePath(`/studio/faceless/${id}`);
          return {error:"Job state changed during submission. Open Jobs to see its current status."};
        }
      } catch (error) {
        const diagnostic = await recordDispatchFailure(admin, String(generationId), stage, error);
        return {error:`${diagnostic} Job saved and credits reserved, but dispatch is not confirmed. Use Reconnect job to retry without another charge, or cancel it in Jobs.`};
      }
    }
    revalidatePath(`/studio/faceless/${id}`);
    return {ok:true};
  } catch(error) {return {error:publicError(error)};}
}
