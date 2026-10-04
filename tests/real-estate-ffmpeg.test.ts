// Optional real encoder check: REAL_ESTATE_FFMPEG_TEST=/absolute/path/to/ffmpeg.
// No database, network, credentials or paid inference. Test charts are not property examples.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, copyFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, expect } from "vitest";
import { estateBrief } from "./fixtures/real-estate";
import { estateClipArgs, estateJoinArgs } from "../trigger/real-estate-render";
const exec=promisify(execFile), binary=process.env.REAL_ESTATE_FFMPEG_TEST;
it.skipIf(!binary)("encodes and concatenates a real 16-second listing with stereo sound in both formats",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"eta-estate-encoder-test-"));
  const run=(args:string[])=>exec(binary!,args,{cwd:dir,timeout:180000,maxBuffer:1024*1024});
  const args=(a:string[])=>process.platform==="win32"?a.map(v=>v.replaceAll("font='DejaVu Sans'","fontfile=font.ttf")):a;
  try{
    if(process.platform==="win32")await copyFile("C:/Windows/Fonts/arial.ttf",path.join(dir,"font.ttf"));
    await writeFile(path.join(dir,"brand.txt"),"Example Agency");await writeFile(path.join(dir,"outro.txt"),"Maple Court\nBook a viewing\nexample.com");
    for(let i=0;i<2;i++){
      await run(["-y","-v","error","-f","lavfi","-i",`testsrc=size=800x600:rate=1`,"-frames:v","1",`photo-${i}.png`]);
      await writeFile(path.join(dir,`label-${i}.txt`),"Room's details: 100% verified");
    }
    for(const aspectRatio of ["16:9","9:16"] as const){
      const brief={...estateBrief,aspectRatio};
      for(let i=0;i<2;i++)await run(args(estateClipArgs(brief,i,false)));
      await run(args(estateClipArgs(brief,0,false,true)));
      await writeFile(path.join(dir,"clips.txt"),"file 'clip-0.mp4'\nfile 'clip-1.mp4'\nfile 'outro.mp4'\n");
      await run(estateJoinArgs());expect((await stat(path.join(dir,"listing.mp4"))).size).toBeGreaterThan(10000);
      const decoded=await run(["-hide_banner","-i","listing.mp4","-f","null","-"]);
      expect(decoded.stderr).toMatch(/Duration: 00:00:16/);expect(decoded.stderr).toContain(aspectRatio==="16:9"?"1920x1080":"1080x1920");expect(decoded.stderr).toMatch(/Audio: aac.*48000 Hz, stereo/);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
},240000);
