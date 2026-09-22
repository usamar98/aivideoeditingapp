import { describe, expect, it } from "vitest";

import { availableBalance, reserveCredits, settleReservation, type LedgerEntry } from "@/lib/credits/ledger";

const grant: LedgerEntry = {
  id: "grant-1",
  accountId: "workspace-1",
  generationId: null,
  kind: "grant",
  amount: 100,
  createdAt: "2026-09-22T00:00:00.000Z",
  idempotencyKey: "grant-1",
};

describe("credit accounting", () => {
  it("reserves once for repeated idempotency keys", () => {
    const first = reserveCredits([grant], { accountId: "workspace-1", generationId: "gen-1", amount: 30, idempotencyKey: "reserve-gen-1" });
    const second = reserveCredits(first.entries, { accountId: "workspace-1", generationId: "gen-1", amount: 30, idempotencyKey: "reserve-gen-1" });
    expect(second.duplicate).toBe(true);
    expect(availableBalance(second.entries)).toBe(70);
  });

  it("releases only the unused reservation", () => {
    const reserved = reserveCredits([grant], { accountId: "workspace-1", generationId: "gen-1", amount: 30, idempotencyKey: "reserve-gen-1" });
    const settled = settleReservation(reserved.entries, { accountId: "workspace-1", generationId: "gen-1", reservedAmount: 30, usedAmount: 22, idempotencyKey: "settle-gen-1" });
    expect(availableBalance(settled)).toBe(78);
  });
});
