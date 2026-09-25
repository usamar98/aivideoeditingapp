import { Captions, Package, UserRound } from "lucide-react";

/** A labelled layout illustration, never represented as a generated video. */
export function UgcPreview({ compact = false }: { compact?: boolean }) {
  return <div className={`relative flex items-center justify-center overflow-hidden bg-[#e8edf8] ${compact ? "h-52" : "min-h-[440px] p-8"}`}>
    <div className={`relative overflow-hidden rounded-[1.6rem] border-[5px] border-white bg-[#d2dbef] shadow-xl ${compact ? "mt-24 w-36" : "w-52"}`}>
      <div className="relative flex h-48 items-end justify-center overflow-hidden bg-[#c3d0e8]">
        <div className="absolute top-5 rounded-full bg-white/80 px-3 py-1 text-[9px] uppercase tracking-widest text-[#182d4e]">AI presenter</div>
        <UserRound className="size-36 translate-y-5 stroke-[.7] text-[#5876b4]" aria-hidden="true" />
        <span className="absolute inset-x-3 bottom-4 rounded-lg bg-[#2457d6] px-2 py-1 text-center text-xs font-semibold text-white">One product. A fresh angle.</span>
      </div>
      <div className="flex h-36 flex-col items-center justify-center gap-3 bg-[#faf7ef]"><Package className="size-12 stroke-1 text-[#2457d6]" /><span className="text-[10px] uppercase tracking-widest text-[#182d4e]">Your product, in focus</span></div>
    </div>
    {!compact && <><span className="absolute left-3 top-16 -rotate-6 rounded-xl border border-white bg-white/90 px-4 py-3 text-xs text-[#2457d6] shadow-sm">Hook 01 · Ask a question</span><span className="absolute bottom-20 right-3 rotate-6 rounded-xl border border-white bg-white/90 px-4 py-3 text-xs text-[#2457d6] shadow-sm"><Captions className="mr-2 inline size-4" />Timed captions</span></>}
    <span className="absolute inset-x-0 bottom-3 text-center text-[9px] uppercase tracking-widest text-[#50658c]">Layout illustration · not generated footage</span>
  </div>;
}
