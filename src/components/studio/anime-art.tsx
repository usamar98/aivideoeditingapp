import { useId } from "react";
import type { AnimeStyle } from "@/lib/anime/preview";

/** Original vector concept art, not generated footage or competitor assets. */
export function AnimeArt({ scene = "city", style = "cinematic", closeUp = false, className = "" }: {
  scene?: "city" | "bridge" | "station"; style?: AnimeStyle; closeUp?: boolean; className?: string;
}) {
  const id = useId();
  const colors = style === "manga" ? ["#e9e8df", "#8593a9", "#25364e", "#f3efdf", "#cad6eb"]
    : style === "watercolor" ? ["#d6c9ea", "#718ab7", "#53678e", "#ffd9a9", "#e6c2d9"]
    : ["#142c57", "#4869a3", "#10284b", "#ffd09b", "#8dc7ef"];
  return <svg viewBox="0 0 600 400" className={className} role="img" aria-labelledby={`${id}-title`} preserveAspectRatio="xMidYMid slice">
    <title id={`${id}-title`}>{`Illustrated ${scene === "city" ? "rain-lit city and a courier" : scene === "bridge" ? "moonlit footbridge" : "last-train platform"} · static concept art`}</title>
    <defs>
      <linearGradient id={`${id}-sky`} x2="0.8" y2="1"><stop stopColor={colors[0]}/><stop offset="1" stopColor={colors[1]}/></linearGradient>
      <linearGradient id={`${id}-floor`} x2="0" y2="1"><stop stopColor={colors[2]}/><stop offset="1" stopColor={colors[1]}/></linearGradient>
      <radialGradient id={`${id}-light`}><stop stopColor={colors[3]} stopOpacity=".75"/><stop offset="1" stopColor={colors[3]} stopOpacity="0"/></radialGradient>
      <pattern id={`${id}-windows`} width="27" height="32" patternUnits="userSpaceOnUse"><rect x="8" y="10" width="5" height="9" rx="1" fill={colors[3]} opacity=".65"/></pattern>
    </defs>
    <rect width="600" height="400" fill={`url(#${id}-sky)`}/>
    <circle cx="450" cy="76" r="38" fill={colors[4]} opacity=".75"/><circle cx="434" cy="65" r="34" fill={colors[0]} opacity=".8"/>
    {[30, 111, 185, 279, 362, 517, 573].map((x, i) => <g key={x} opacity={i % 2 ? ".65" : ".38"}><rect x={x - 22} y={98 + i * 23 % 100} width={50 + i * 9 % 40} height="230" fill={colors[2]}/><rect x={x - 22} y={98 + i * 23 % 100} width="52" height="230" fill={`url(#${id}-windows)`}/></g>)}
    <rect y="290" width="600" height="110" fill={`url(#${id}-floor)`}/>
    {[45, 154, 302, 443, 540].map((x, i) => <path key={x} d={`M${x} 305 l${i % 2 ? 42 : -38} 85 h24 l5 -85Z`} fill={i % 2 ? colors[3] : colors[4]} opacity=".12"/>)}
    {scene === "bridge" ? <g><path d="M-40 370 Q300 170 640 350 L640 430 H-40Z" fill={colors[2]}/><path d="M-20 317 Q300 134 620 300" stroke={colors[4]} strokeWidth="4" fill="none"/>{[20, 90, 160, 230, 300, 370, 440, 510, 580].map((x, i) => <path key={x} d={`M${x} ${295 - Math.sin(i / 8 * Math.PI) * 90} v65`} stroke={colors[4]} strokeWidth="3" opacity=".7"/>)}</g> : null}
    {scene === "station" ? <g><path d="M0 103 L330 80 L600 130 V155 H0Z" fill={colors[2]}/><path d="M75 130 V330 M500 150 V330" stroke={colors[2]} strokeWidth="14"/><rect x="290" y="210" width="350" height="95" rx="22" fill={colors[1]}/>{[320, 380, 440, 500, 560].map(x => <rect key={x} x={x} y="228" width="38" height="34" rx="5" fill={colors[3]} opacity=".8"/>)}<circle cx="300" cy="125" r="26" fill={colors[3]}/><path d="M300 107 V125 L316 136" stroke={colors[2]} strokeWidth="3" fill="none"/></g> : null}
    <ellipse cx="284" cy="360" rx="90" ry="11" fill={colors[2]} opacity=".5"/>
    <g transform={closeUp ? "translate(-142,-94) scale(1.5)" : "translate(18,0)"}>
      <path d="M243 297 L240 356 L252 356 L271 302 M273 302 L282 356 H294 L291 293" fill="#16243c"/>
      <path d="M242 352 l-12 9 q-3 5 14 4 l13-6 M282 353 l-2 12 h25 q4-5-13-10" fill="#101c31"/>
      <path d="M253 218 Q237 221 233 240 L216 311 Q252 325 302 307 L291 233 Q284 218 270 219" fill="#e6e9ec"/>
      <path d="M254 223 l7 66 12-68 M233 248 l-8 52 M280 238 l20 29-29 10" stroke="#9aaec5" strokeWidth="4" fill="none"/>
      <path d="M253 203 l1 19 16 3 4-25" fill="#e5b3a2"/>
      <ellipse cx="266" cy="189" rx="23" ry="29" fill="#efc3b1"/>
      <path d="M244 206 Q228 175 248 157 Q276 141 289 169 l2 15-16-5-9-15-13 26-1 26Z" fill="#17273f"/>
      <path d="M282 190 h6 M278 205 l5-1" stroke="#39425a" strokeWidth="2"/>
      <path d="M245 228 l44 62" stroke="#4863a0" strokeWidth="6"/><rect x="278" y="280" width="29" height="32" rx="6" fill="#4e73b5"/>
      <rect x="273" y="258" width="31" height="21" rx="2" fill={colors[3]} transform="rotate(-13 273 258)"/>
      <circle cx="290" cy="250" r="42" fill={`url(#${id}-light)`}/><path d="M290 238 l4 10 11 2-10 6 1 11-7-8-10 4 4-11-7-8 11 1Z" fill="#fff1cf"/>
    </g>
    <path d="M0 375 Q130 347 240 382 T600 370" stroke={colors[4]} opacity=".17" strokeWidth="2" fill="none"/>
    <rect x="1" y="1" width="598" height="398" rx="2" stroke="white" strokeOpacity=".06" fill="none"/>
  </svg>;
}
