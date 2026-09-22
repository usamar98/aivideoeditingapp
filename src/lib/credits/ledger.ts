import { z } from "zod";

export const ledgerEntrySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  generationId: z.string().nullable(),
  kind: z.enum(["grant", "purchase", "reservation", "usage", "release", "refund", "adjustment"]),
  amount: z.number(),
  createdAt: z.string().datetime(),
  idempotencyKey: z.string(),
});

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export function availableBalance(entries: LedgerEntry[]) {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

export function reserveCredits(
  entries: LedgerEntry[],
  input: { accountId: string; generationId: string; amount: number; idempotencyKey: string },
) {
  if (input.amount <= 0) throw new Error("Reservation amount must be positive.");

  const duplicate = entries.find((entry) => entry.idempotencyKey === input.idempotencyKey);
  if (duplicate) return { entries, reservation: duplicate, duplicate: true };

  if (availableBalance(entries) < input.amount) {
    throw new Error("Not enough credits for this generation.");
  }

  const reservation: LedgerEntry = {
    id: `ledger_${input.idempotencyKey}`,
    accountId: input.accountId,
    generationId: input.generationId,
    kind: "reservation",
    amount: -input.amount,
    createdAt: new Date().toISOString(),
    idempotencyKey: input.idempotencyKey,
  };

  return { entries: [...entries, reservation], reservation, duplicate: false };
}

export function settleReservation(
  entries: LedgerEntry[],
  input: {
    accountId: string;
    generationId: string;
    reservedAmount: number;
    usedAmount: number;
    idempotencyKey: string;
  },
) {
  if (input.usedAmount < 0 || input.usedAmount > input.reservedAmount) {
    throw new Error("Used credits must be between zero and the reserved amount.");
  }
  if (entries.some((entry) => entry.idempotencyKey === input.idempotencyKey)) return entries;

  const now = new Date().toISOString();
  const settlement: LedgerEntry[] = [
    {
      id: `usage_${input.idempotencyKey}`,
      accountId: input.accountId,
      generationId: input.generationId,
      kind: "usage",
      amount: 0,
      createdAt: now,
      idempotencyKey: input.idempotencyKey,
    },
  ];

  const unused = input.reservedAmount - input.usedAmount;
  if (unused > 0) {
    settlement.push({
      id: `release_${input.idempotencyKey}`,
      accountId: input.accountId,
      generationId: input.generationId,
      kind: "release",
      amount: unused,
      createdAt: now,
      idempotencyKey: `${input.idempotencyKey}:release`,
    });
  }
  return [...entries, ...settlement];
}
