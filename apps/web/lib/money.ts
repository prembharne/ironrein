// Where the money is: who holds what, and what each account got from the vault.
// Everything here comes from chain data (the vault's event log and account balances).
import type { Activity, Policy } from "@ironrein/shared";
import { RPC_URL } from "./config.ts";

export interface MoneyRow {
  account: string;
  /** "approved": on the allowlist. "blocked": someone tried to pay it and the vault refused. */
  role: "approved" | "blocked";
  /** yoctoNEAR the vault actually sent to this account, in the events given. */
  received: bigint;
  paidCount: number;
  /** yoctoNEAR of refused attempts to pay this account. */
  refused: bigint;
  refusedCount: number;
}

/**
 * One row per approved payee, then one per account that someone tried to pay without it
 * being approved. Totals cover only the events passed in (the vault keeps its last 50).
 */
export function moneyRows(events: Activity[], policy: Pick<Policy, "allowlist">): MoneyRow[] {
  const rows = new Map<string, MoneyRow>();
  const row = (account: string, role: MoneyRow["role"]) => {
    let r = rows.get(account);
    if (!r) rows.set(account, (r = { account, role, received: 0n, paidCount: 0, refused: 0n, refusedCount: 0 }));
    return r;
  };
  for (const account of policy.allowlist) row(account, "approved");
  for (const e of events) {
    if (!e.payee || (e.kind !== "spend" && e.kind !== "rejected")) continue;
    // An account paid earlier and since removed from the allowlist still shows what it received.
    const r = row(e.payee, "blocked");
    const amount = BigInt(e.amount ?? "0");
    if (e.kind === "spend") {
      r.received += amount;
      r.paidCount += 1;
    } else {
      r.refused += amount;
      r.refusedCount += 1;
    }
  }
  return [...rows.values()].sort((a, b) => Number(b.role === "approved") - Number(a.role === "approved"));
}

/** An account's balance in yoctoNEAR, or null if the account does not exist. */
export async function getBalance(accountId: string): Promise<bigint | null> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "ironrein",
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: accountId },
    }),
  });
  const body = await res.json();
  if (body.error) {
    if (body.error.cause?.name === "UNKNOWN_ACCOUNT") return null;
    throw new Error(body.error.cause?.name ?? body.error.message ?? "RPC error");
  }
  return BigInt(body.result.amount);
}
