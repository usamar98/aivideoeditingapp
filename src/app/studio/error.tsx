"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StudioError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-md text-center"><span className="mx-auto grid size-12 place-items-center rounded-xl bg-red-400/10 text-red-300"><TriangleAlert /></span><h1 className="mt-5 text-2xl font-bold">The studio lost its place.</h1><p className="mt-2 text-muted-foreground">Your last autosaved draft is still stored. Retry to reopen the workspace.</p><Button className="mt-6" onClick={reset}>Retry</Button></div></main>;
}
