export type GenerationStatus =
  | "created"
  | "reserved"
  | "submitted"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface GenerationRecord {
  id: string;
  status: GenerationStatus;
  providerRequestId: string | null;
  attemptCount: number;
  lastError: string | null;
}

export type ReconcileAction = "submit" | "check_provider" | "use_output" | "stop";

export function nextGenerationAction(record: GenerationRecord): ReconcileAction {
  if (record.status === "succeeded") return "use_output";
  if (record.status === "failed" || record.status === "cancelled") return "stop";
  if (record.providerRequestId) return "check_provider";
  return "submit";
}

export function mayRetry(record: GenerationRecord, maxAttempts = 3) {
  return record.status === "failed" && record.attemptCount < maxAttempts;
}
