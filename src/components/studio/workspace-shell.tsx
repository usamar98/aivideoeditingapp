import Link from "next/link";
import { ArrowLeft, UserRound, ListChecks } from "lucide-react";
import { AppSidebar } from "./app-sidebar";
import { BrandMark } from "./brand-mark";
import { Button } from "@/components/ui/button";

export function WorkspaceShell({ title, active, children }: { title: string; active: string; children: React.ReactNode }) {
  return <div className="flex min-h-screen"><AppSidebar active={active} /><div className="min-w-0 flex-1"><header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-border px-5 sm:px-8"><div className="flex items-center gap-5"><Link href="/" aria-label="Home" className="md:hidden"><BrandMark compact /></Link><Link href="/studio" aria-label="Back to studio"><ArrowLeft className="size-4 text-muted-foreground" /></Link><span className="text-sm font-medium">{title}</span></div><div className="flex items-center gap-2"><Button asChild variant="outline" size="sm" className="rounded-full"><Link href="/studio/jobs"><ListChecks /> Jobs</Link></Button><Button asChild variant="outline" size="sm" className="rounded-full"><Link href="/studio/profile"><UserRound /> My account</Link></Button></div></header>{children}</div></div>;
}
