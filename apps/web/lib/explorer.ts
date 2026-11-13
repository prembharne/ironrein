// Links each vault event to the real transaction that produced it, using NearBlocks.
// The contract's activity log has no tx hashes (a contract can't see its own tx hash),
// so we pair events with the vault's transactions from the NearBlocks v3 API.
import type { Activity, ActivityKind } from "@ironrein/shared";
import { NETWORK, VAULT_ID } from "./config.ts";

const API = NETWORK === "mainnet" ? "https://api.nearblocks.io" : "https://api-testnet.nearblocks.io";
// VERIFY: the explorer pages sit behind a Cloudflare bot check, so these paths were not
// confirmed by script. They follow NearBlocks' standard /txns/<hash> and /address/<id> routes.
const SITE = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

export const txUrl = (hash: string) => `${SITE}/txns/${hash}`;
export const accountUrl = (id: string) => `${SITE}/address/${id}`;

/** The fields we use from GET /v3/accounts/{account}/txns. */
export interface VaultTx {
  transaction_hash: string;
  block_timestamp: string; // ns
  signer_account_id: string;
  actions: Array<{ action: string; method?: string | null }>;
  outcomes: { status: boolean };
}

/** Which contract method emits each event. */
const METHOD: Record<ActivityKind, string> = {
  spend: "agent_spend",
  rejected: "agent_spend",
  policy_set: "set_policy",
  paused: "pause",
  unpaused: "unpause",
  agent_key_rotated: "rotate_agent_key",
  agent_key_revoked: "revoke_agent_key",
  withdraw: "withdraw",
};

// An owner's call lands a block or two after its transaction; a self-call lands in the same block.
const MAX_LAG_NS = 30_000_000_000n;

/**
 * Pair each event with its transaction: the latest successful vault tx that called the
 * event's method at or before the event's block time, within MAX_LAG_NS. A tx that batches
 * calls (pause + revoke) pairs with each of its events. Unmatched events get no hash.
 */
export function matchTxs(events: Activity[], txs: VaultTx[]): Array<string | null> {
  const used = new Map<string, number>();
  return events.map((e) => {
    const method = METHOD[e.kind];
    const ts = BigInt(e.ts);
    let best: VaultTx | null = null;
    for (const tx of txs) {
      if (!tx.outcomes.status) continue;
      const calls = tx.actions.filter((a) => a.method === method).length;
      if (!calls || (used.get(`${tx.transaction_hash}:${method}`) ?? 0) >= calls) continue;
      const t = BigInt(tx.block_timestamp);
      if (t > ts || ts - t > MAX_LAG_NS) continue;
      if (!best || t > BigInt(best.block_timestamp)) best = tx;
    }
    if (!best) return null;
    const key = `${best.transaction_hash}:${method}`;
    used.set(key, (used.get(key) ?? 0) + 1);
    return best.transaction_hash;
  });
}

/** The vault's most recent transactions, newest first. Throws if NearBlocks is unreachable. */
export async function getVaultTxs(limit = 50): Promise<VaultTx[]> {
  const res = await fetch(`${API}/v3/accounts/${VAULT_ID}/txns?limit=${limit}`);
  if (!res.ok) throw new Error(`NearBlocks returned ${res.status}`);
  const body = await res.json();
  return Array.isArray(body.data) ? body.data : [];
}
