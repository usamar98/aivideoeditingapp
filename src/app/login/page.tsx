import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { AuthForm } from "@/components/studio/auth-form";
import { BrandMark } from "@/components/studio/brand-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isFixtureMode } from "@/lib/integrations";
import { authErrorMessage, safeAuthNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const { next, error } = await searchParams;
  const nextPath = safeAuthNextPath(next);
  const initialMessage = authErrorMessage(error);
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-7 flex justify-center"><BrandMark /></Link>
        <Card className="border-primary/15 bg-card/85 shadow-2xl">
          <CardHeader><CardTitle className="text-2xl">Your series, right where you left it.</CardTitle><CardDescription>Sign in to access private projects, character references, credit history, and exports.</CardDescription></CardHeader>
          <CardContent><AuthForm nextPath={nextPath} demoMode={isFixtureMode()} initialMessage={initialMessage} /></CardContent>
        </Card>
        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Private media stays behind authenticated storage policies.</p>
      </div>
    </main>
  );
}
