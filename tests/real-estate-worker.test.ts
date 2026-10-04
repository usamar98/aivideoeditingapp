import { writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estateBrief } from "./fixtures/real-estate";
const mocks=vi.hoisted(()=>({job:vi.fn(),rpc:vi.fn(),upload:vi.fn(),load:vi.fn(),loadFile:vi.fn(),saveFile:vi.fn(),signed:vi.fn(),exec:vi.fn(),provider:vi.fn(),client:vi.fn(),active:vi.fn(),claim:vi.fn(),cancelled:vi.fn()}));
vi.mock("@trigger.dev/sdk",()=>({schemaTask:(config:unknown)=>config,metadata:{set:vi.fn()},wait:{for:vi.fn()}}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>{const chain={select:()=>chain,eq:()=>chain,single:mocks.job};return{rpc:mocks.rpc,from:()=>({...chain,update:()=>({eq:async()=>({error:null})})}),storage:{from:()=>({upload:mocks.upload,createSignedUrl:mocks.signed})}};}}));
vi.mock("../trigger/job-control",()=>({assertJobActive:mocks.active,claimJob:mocks.claim,finishCancelledJob:mocks.cancelled}));
vi.mock("../trigger/media-io",()=>({MEDIA_LIMITS:{json:1000000,voice:1000000,image:1000000,video:1000000},streamToFile:vi.fn(),artifactStore:()=>({load:mocks.load,loadFile:mocks.loadFile,saveFile:mocks.saveFile})}));
vi.mock("../trigger/cartoon-fal",()=>({cartoonFalClient:mocks.client,runFalStage:mocks.provider}));
vi.mock("../trigger/cartoon-media",()=>({downloadCartoonVideo:vi.fn(),isCartoonMediaUrl:()=>true}));
vi.mock("node:child_process",()=>({execFile:Object.assign(()=>{},{[Symbol.for("nodejs.util.promisify.custom")]:mocks.exec})}));
import { realEstatePipeline } from "../trigger/real-estate-pipeline";
const id="10000000-0000-4000-8000-000000000003";
const task=realEstatePipeline as unknown as {run:(p:{generationId:string},c:unknown)=>Promise<unknown>;onComplete:(a:unknown)=>Promise<void>;onCancel:(a:unknown)=>Promise<void>};
const run=()=>task.run({generationId:id},{signal:new AbortController().signal,ctx:{run:{id:"run_test"},attempt:{number:1}}});
const job=(brief=estateBrief,photoPaths=["workspace/owner/real-estate-inputs/a.png","workspace/owner/real-estate-inputs/b.png"])=>({data:{operation:"real-estate-render",workspace_id:"workspace",requested_by:"owner",settings:{brief,photoPaths}}});
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","test");vi.stubEnv("SUPABASE_SECRET_KEY","test");
  mocks.job.mockResolvedValue(job());mocks.rpc.mockResolvedValue({error:null});mocks.upload.mockResolvedValue({error:null});mocks.load.mockResolvedValue(null);mocks.client.mockReturnValue({});
  mocks.signed.mockResolvedValue({data:{signedUrl:"https://example.supabase.co/photo.png"}});
  mocks.loadFile.mockImplementation(async(name:string,file:string)=>{if(!["a.png","b.png"].includes(name))return false;await writeFile(file,Buffer.from("89504e470d0a1a0a0000000000000000","hex"));return true;});
  mocks.exec.mockImplementation(async(_cmd:string,args:string[])=>({stdout:JSON.stringify({streams:[{codec_type:"video",width:1920,height:1080},{codec_type:"audio"}],format:{duration:args.at(-1)==="listing.mp4"?"16":args.at(-1)?.startsWith("voice")?"3":"6"}})}));
  mocks.provider.mockResolvedValue({video:{url:"https://fal.media/video.mp4"}});
});
afterEach(()=>vi.unstubAllEnvs());
describe("listing worker orchestration without paid inference",()=>{
  it("assembles faithful motion without initializing fal",async()=>{
    expect(await run()).toEqual({seconds:16});expect(mocks.client).not.toHaveBeenCalled();expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.claim).toHaveBeenCalled();expect(mocks.active).toHaveBeenCalled();
    expect(mocks.saveFile.mock.calls.map(c=>c[0])).toEqual(expect.arrayContaining(["photo-0.png","clip-0.mp4","clip-1.mp4","listing.mp4","captions.srt"]));
  });
  it("validates all photos before any paid stage and rejects foreign paths",async()=>{
    mocks.job.mockResolvedValue(job({...estateBrief,model:"film-veo-3.1"}));mocks.loadFile.mockResolvedValue(false);
    await expect(run()).rejects.toThrow(/missing/);expect(mocks.provider).not.toHaveBeenCalled();
    mocks.job.mockResolvedValue(job(estateBrief,["other/owner/photo.png","workspace/owner/real-estate-inputs/b.png"]));await expect(run()).rejects.toThrow(/ownership/);
  });
  it("binds every AI request to its source photo and removes provider sound",async()=>{
    mocks.job.mockResolvedValue(job({...estateBrief,model:"film-veo-3.1"}));expect(await run()).toEqual({seconds:16});
    expect(mocks.provider).toHaveBeenCalledTimes(2);expect(mocks.provider).toHaveBeenCalledWith(expect.objectContaining({endpoint:"fal-ai/veo3.1/image-to-video",input:expect.objectContaining({image_url:"https://example.supabase.co/photo.png",generate_audio:false})}));
    expect(mocks.exec.mock.calls.some(([,args])=>args.join(" ").includes("AI-animated"))).toBe(true);
  });
  it("resumes persisted room clips without resubmission",async()=>{
    const source=mocks.loadFile.getMockImplementation()!;
    mocks.loadFile.mockImplementation(async(name:string,file:string)=>name.startsWith("clip-")?true:source(name,file));
    mocks.job.mockResolvedValue(job({...estateBrief,model:"film-wan-3"}));expect(await run()).toEqual({seconds:16});expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("rejects incomplete provider footage instead of padding it",async()=>{
    mocks.job.mockResolvedValue(job({...estateBrief,model:"film-wan-3"}));
    mocks.exec.mockResolvedValue({stdout:JSON.stringify({streams:[{codec_type:"video",width:1920,height:1080}],format:{duration:"2"}})});
    await expect(run()).rejects.toThrow(/incomplete/);expect(mocks.saveFile.mock.calls.map(c=>c[0])).not.toContain("listing.mp4");
  });
  it("rejects narration overflow before buying room motion",async()=>{
    mocks.job.mockResolvedValue(job({...estateBrief,model:"film-wan-3",voice:"Rachel"}));const source=mocks.loadFile.getMockImplementation()!;
    mocks.loadFile.mockImplementation(async(name:string,file:string)=>name.startsWith("voice-")?true:source(name,file));
    mocks.exec.mockResolvedValue({stdout:JSON.stringify({streams:[{codec_type:"video",width:1920,height:1080}],format:{duration:"9"}})});
    await expect(run()).rejects.toThrow(/narration is too long/);expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("settles through the database and delegates stop-before-refund cancellation",async()=>{
    await task.onComplete({payload:{generationId:id},result:{ok:true,data:{seconds:16}}});expect(mocks.rpc).toHaveBeenLastCalledWith("finish_real_estate_job",{job_id:id,succeeded:true,result_seconds:16});
    await task.onComplete({payload:{generationId:id},result:{ok:false}});expect(mocks.rpc).toHaveBeenLastCalledWith("finish_real_estate_job",{job_id:id,succeeded:false,result_seconds:null});
    const runPromise=Promise.resolve();await task.onCancel({payload:{generationId:id},runPromise});expect(mocks.cancelled).toHaveBeenCalledWith(expect.anything(),id,runPromise);
  });
});
