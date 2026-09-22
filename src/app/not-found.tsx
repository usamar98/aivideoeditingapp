import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center p-6 text-center"><div><p className="font-mono text-sm text-primary">404</p><h1 className="mt-3 text-3xl font-bold">That scene is not in this cut.</h1><p className="mt-2 text-muted-foreground">The page may be unpublished, moved, or private.</p><Button asChild className="mt-6"><Link href="/">Return home</Link></Button></div></main>;
}
