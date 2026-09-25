import { Captions, Mic, ScanFace, Scissors } from "lucide-react";

export function ShortsPreview() {
  return <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-[#10294d] p-6 text-white sm:p-8" aria-label="Illustration of a podcast becoming captioned vertical clips">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-200"><span className="flex items-center gap-2"><Mic className="size-4" />THE LONG CONVERSATION</span><span>→ SHORT STORIES</span></div>
    <div className="my-8 flex h-16 items-center justify-center gap-1.5" aria-hidden>{Array.from({ length: 45 }, (_, i) => <span key={i} style={{ height: `${15 + (i * 17 % 47)}px` }} className={`w-1.5 rounded-full ${i > 12 && i < 30 ? "bg-[#95b5ff]" : "bg-white/20"}`} />)}</div>
    <div className="grid grid-cols-3 gap-2 sm:gap-3">{["The insight", "The story", "The takeaway"].map((label, i) => <div key={label} className={`flex min-w-0 aspect-[9/14] flex-col items-center justify-between gap-3 rounded-2xl border border-white/20 p-2 sm:p-3 ${i === 1 ? "-translate-y-3 bg-[#3562cc]" : "bg-white/5"}`}><span className="text-center text-[8px] text-blue-100 sm:text-[10px]">0{i + 1} / HIGHLIGHT</span><ScanFace className="size-8 shrink-0 text-blue-100 sm:size-9" /><div className="max-w-full break-words rounded-md bg-[#f7efcf] px-1 py-1.5 text-center text-[10px] font-semibold text-[#10294d] sm:px-2 sm:text-xs">{label}</div></div>)}</div>
    <div className="mt-7 flex flex-wrap justify-between gap-3 text-[10px] text-blue-100"><span className="flex items-center gap-1"><Scissors className="size-3" />Useful moments</span><span className="flex items-center gap-1"><Captions className="size-3" />Animated words</span><span>9:16 MP4</span></div>
    <p className="mt-5 text-center text-[9px] uppercase tracking-wider text-blue-200/70">Workflow illustration · not generated footage</p>
  </div>;
}
