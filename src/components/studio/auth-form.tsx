"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ nextPath, demoMode, initialMessage = null }: { nextPath: string; demoMode: boolean; initialMessage?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(initialMessage);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is not configured. Use the labelled demo workspace or add environment credentials.");
      return;
    }
    setPending(true);
    setMessage(null);
    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` } });
    setPending(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm your account, then return here to sign in.");
      return;
    }
    const { error: workspaceError } = await supabase.schema("api").rpc("ensure_personal_workspace", { workspace_name: "My studio" });
    if (workspaceError) {
      setMessage(`Your account is ready, but workspace setup failed: ${workspaceError.message}`);
      return;
    }
    router.push(nextPath);
    router.refresh();
  };

  return (
    <div>
      <div className="grid grid-cols-2 rounded-lg bg-secondary p-1" aria-label="Authentication mode">
        {(["sign-in", "sign-up"] as const).map((value) => <button key={value} type="button" onClick={() => setMode(value)} className={`h-8 rounded-md text-sm font-medium ${mode === value ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>{value === "sign-in" ? "Sign in" : "Create account"}</button>)}
      </div>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@studio.com" /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        {message && <p className="rounded-lg border border-amber/25 bg-amber/8 p-3 text-sm leading-relaxed text-amber-100" role="status">{message}</p>}
        <Button className="w-full" type="submit" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} {mode === "sign-in" ? "Sign in" : "Create account"}</Button>
      </form>
      {demoMode && <Button asChild variant="outline" className="mt-3 w-full"><a href={nextPath}>Enter development fixture</a></Button>}
    </div>
  );
}
