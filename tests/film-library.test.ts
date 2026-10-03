import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { listVideos } from "@/lib/social/library";
import { getJobs } from "@/lib/jobs/repository";

describe("film discovery without changing legacy storage sources", () => {
  it("lists completed films in publishing with their film editor link", async () => {
    const eq = vi.fn();
    const db = { from: (table:string) => {
      const chain = { select: () => chain, eq: (...args:unknown[]) => { eq(...args); return chain; }, order: () => chain,
        limit: async () => ({ data: table === "cartoon_projects" ? [{ id:"film", title:"My film", workspace_id:"workspace", status:"complete", brief:{kind:"short-film"}, output_path:"workspace/owner/cartoons/job/video.mp4" }] : [], error:null }) };
      return chain;
    } } as unknown as SupabaseClient;
    expect(await listVideos(db,"owner")).toEqual([{ kind:"cartoon", projectId:"film", outputKey:"", title:"My film", href:"/studio/films/film" }]);
    expect(eq).toHaveBeenCalledWith("user_id","owner");
  });
  it("shows a film label and destination while still querying the existing worker operations", async () => {
    const id="10000000-0000-4000-8000-000000000001", inFilter=vi.fn(), eq=vi.fn();
    const chain = { select:()=>chain, eq:(...args:unknown[])=>{eq(...args);return chain;}, in:(...args:unknown[])=>{inFilter(...args);return chain;}, order:()=>chain,
      range:async()=>({error:null,count:1,data:[{id,operation:"cartoon-render",status:"succeeded",settings:{projectId:id,projectTitle:"My film",brief:{kind:"short-film"}},created_at:"2026-10-03T00:00:00Z",completed_at:null,cancel_requested_at:null,estimated_credits:318,reported_credits:318}]}) };
    const result=await getJobs({from:()=>chain} as unknown as SupabaseClient,"owner","done");
    expect(result.jobs[0]).toMatchObject({operation:"film-render",projectHref:`/studio/films/${id}`,title:"My film",usedCredits:318});
    expect(eq).toHaveBeenCalledWith("requested_by","owner");
    expect(inFilter).toHaveBeenCalledWith("operation",expect.arrayContaining(["cartoon-render"]));
  });
});
