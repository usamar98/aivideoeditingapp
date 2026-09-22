"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return <Sonner theme="light" position="bottom-right" toastOptions={{ classNames: { toast: "!border-border !bg-card !text-foreground" } }} />;
}
