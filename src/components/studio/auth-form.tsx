"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { beginGoogleSignIn } from "@/lib/auth/google";
import { authCallbackUrl, safeAuthNextPath } from "@/lib/auth/redirect";

export function AuthForm({ nextPath, demoMode, initialMessage = null }: { nextPath: string; demoMode: boolean; initialMessage?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const inFlight = useRef(false);
  const [message, setMessage] = useState<string | null>(initialMessage);
  const destination = safeAuthNextPath(nextPath);

  useEffect(() => {
    // Back from Google's page may restore a cached document with pending state.
    const resetPending = () => { inFlight.current = false; setPending(null); };
    window.addEventListener("pageshow", resetPending);
    return () => window.removeEventListener("pageshow", resetPending);
  }, []);

  const continueWithGoogle = async () => {
    if (inFlight.current) return;
    const supabase = createClient();
    if (!supabase) {
      setMessage(demoMode
        ? "Google sign-in needs Supabase configuration. You can explore the labelled development fixture below."
        : "Google sign-in is not configured yet. Please contact support.");
      return;
    }
    inFlight.current = true;
    setPending("google");
    setMessage(null);
    try {
      const url = await beginGoogleSignIn(supabase.auth, window.location.origin, destination);
      window.location.assign(url);
    } catch {
      setMessage("Google sign-in could not start. Please try again or continue with email.");
      inFlight.current = false;
      setPending(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const supabase = createClient();
    if (!supabase) {
      setMessage(demoMode
        ? "Supabase is not configured. Use the labelled demo workspace or add environment credentials."
        : "Sign-in is not configured yet. Please contact support.");
      return;
    }
    inFlight.current = true;
    setPending("email");
    setMessage(null);
    try {
      const result = mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authCallbackUrl(window.location.origin, destination) } });
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
        setMessage("Your account is signed in, but workspace setup could not finish. Sign in again to retry, or contact support.");
        return;
      }
      router.push(destination);
      router.refresh();
    } catch {
      setMessage("Sign-in could not finish. Please check your connection and try again.");
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 rounded-lg bg-secondary p-1" aria-label="Authentication mode">
        {(["sign-in", "sign-up"] as const).map((value) => <button key={value} type="button" disabled={pending !== null} aria-pressed={mode === value} onClick={() => setMode(value)} className={`h-8 rounded-md text-sm font-medium disabled:opacity-50 ${mode === value ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>{value === "sign-in" ? "Sign in" : "Create account"}</button>)}
      </div>
      <Button type="button" variant="outline" className="mt-5 w-full gap-2.5 border-[#747775] bg-white font-medium text-[#1f1f1f] hover:bg-[#f2f2f2]" disabled={pending !== null} aria-busy={pending === "google"} onClick={continueWithGoogle}>
        <Image src="https://developers.google.com/static/identity/images/g-logo.png" width={20} height={20} alt="" unoptimized />
        {pending === "google" ? "Connecting to Google…" : "Continue with Google"}
        {pending === "google" && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Sign up or sign in. No separate password needed.</p>
      <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>or continue with email</span><span className="h-px flex-1 bg-border" /></div>
      {message && <p className="mt-4 rounded-lg border border-primary/20 bg-secondary p-3 text-sm leading-relaxed text-foreground" role="status">{message}</p>}
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" disabled={pending !== null} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@studio.com" /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} disabled={pending !== null} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        <Button className="w-full" type="submit" disabled={pending !== null} aria-busy={pending === "email"}>{pending === "email" ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} {mode === "sign-in" ? "Sign in" : "Create account"}</Button>
      </form>
      {demoMode && <Button asChild variant="outline" className="mt-3 w-full"><a href={destination}>Enter development fixture</a></Button>}
    </div>
  );
}
