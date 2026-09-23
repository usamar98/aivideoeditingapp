"use client";

import { useState, useTransition } from "react";
import { AlertDialog } from "radix-ui";
import { LoaderCircle, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CancelJobButton({ jobId, title, requested = false, disabled = false, onUpdate }: { jobId: string; title: string; requested?: boolean; disabled?: boolean; onUpdate: () => void | Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  function cancel() {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/generations/${jobId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(65000) });
        const result = await response.json();
        if (result.status === "cancelled") toast.success("Job cancelled. Reserved credits were returned.");
        else if (result.error) { setError(result.error); toast.info(result.error); }
        else toast.info("Job status changed. The list has been refreshed.");
      } catch {
        setError("Could not confirm cancellation. Refresh the job status, then retry; no duplicate refund is possible.");
      }
      try { await onUpdate(); } catch { setError("Job status could not refresh. Open Jobs to check the latest status."); }
    });
  }
  return <div className="max-w-sm">
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild><Button variant="outline" size="sm" disabled={disabled || pending} className="text-destructive">{pending ? <LoaderCircle className="animate-spin" /> : <Square />}{pending ? "Stopping…" : requested ? "Retry cancellation" : "Cancel job"}</Button></AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-xl">
          <AlertDialog.Title className="text-xl font-semibold">Cancel this job?</AlertDialog.Title>
          <AlertDialog.Description className="mt-3 break-words text-sm leading-7 text-muted-foreground">Stop “{title}”? This sends a backend stop request immediately. The job slot and reserved credits are released once the worker has stopped. Already-started AI provider requests may take time to stop.</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3"><AlertDialog.Cancel asChild><Button variant="outline">Keep running</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button variant="destructive" onClick={cancel}>Cancel job</Button></AlertDialog.Action></div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    {error && <p role="status" className="mt-2 text-xs leading-5 text-muted-foreground">{error}</p>}
  </div>;
}
