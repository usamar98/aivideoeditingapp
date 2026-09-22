import { z } from "zod";

export const alignmentSchema = z.object({ characters:z.array(z.string()).min(1),character_start_times_seconds:z.array(z.number().finite().nonnegative()),character_end_times_seconds:z.array(z.number().finite().nonnegative()) }).refine((a) => a.characters.length === a.character_start_times_seconds.length && a.characters.length === a.character_end_times_seconds.length && a.character_end_times_seconds.every((end,i) => end >= a.character_start_times_seconds[i] && (i === 0 || a.character_start_times_seconds[i] >= a.character_start_times_seconds[i-1])),"Invalid narration timing");
export type Alignment = z.infer<typeof alignmentSchema>;
export function srtTimestamp(seconds:number) {
  const ms = Math.round(seconds*1000);
  return `${String(Math.floor(ms/3600000)).padStart(2,"0")}:${String(Math.floor(ms/60000)%60).padStart(2,"0")}:${String(Math.floor(ms/1000)%60).padStart(2,"0")},${String(ms%1000).padStart(3,"0")}`;
}
export function alignmentToSrt(input:Alignment) {
  const a = alignmentSchema.parse(input);
  const chunks:{text:string;start:number;end:number}[] = [];
  let text = "", words = 0, start = 0, end = 0;
  for (let i=0;i<a.characters.length;i++) {
    const char = a.characters[i];
    if (!text) start = a.character_start_times_seconds[i];
    text += char; end = a.character_end_times_seconds[i];
    if (/\s/.test(char)) words++;
    if (words >= 5 || i === a.characters.length-1) {
      const cleaned = text.replace(/[<>{}\\\r\n]/g,"").trim();
      if (cleaned) chunks.push({text:cleaned,start,end});
      text = ""; words = 0;
    }
  }
  return chunks.map((chunk,i) => `${i+1}\n${srtTimestamp(chunk.start)} --> ${srtTimestamp(Math.max(chunk.end,chunk.start+.08))}\n${chunk.text}\n`).join("\n");
}
