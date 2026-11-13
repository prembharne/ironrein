"use client";
// Live vault state for the landing page, read from the chain over RPC (no keys, no mock data).
import { useEffect, useState } from "react";
import type { Activity, Policy, VaultStatus } from "@ironrein/shared";
import { VAULT_ID } from "@/lib/config";
import { getVaultTxs, matchTxs } from "@/lib/explorer";
import { getPolicy, getRecent, getStatus } from "@/lib/vault";

const REFRESH_MS = 10_000;

export interface LiveVault {
  status: VaultStatus | null;
  policy: Policy | null;
  recent: Activity[];
  /** Tx hash for each entry in `recent`, or null when it couldn't be paired. */
  txHashes: Array<string | null>;
  error: string | null;
}

export function useLiveVault(): LiveVault {
  const [state, setState] = useState<LiveVault>({ status: null, policy: null, recent: [], txHashes: [], error: null });

  useEffect(() => {
    if (!VAULT_ID) {
      setState((s) => ({ ...s, error: "No vault configured" }));
      return;
    }
    let live = true;
    let newest: string | null = null;
    let txHashes: Array<string | null> = [];
    const load = () =>
      Promise.all([getStatus(), getPolicy(), getRecent(20)])
        .then(async ([status, policy, recent]) => {
          // Tx hashes come from the NearBlocks indexer; refetch only when there's a new event.
          if (recent[0] && recent[0].ts !== newest) {
            try {
              txHashes = matchTxs(recent, await getVaultTxs());
              newest = recent[0].ts;
            } catch {
              txHashes = []; // links are optional; retry next time
            }
          }
          if (live) setState({ status, policy, recent, txHashes, error: null });
        })
        .catch((e) => live && setState((s) => ({ ...s, error: String(e?.message ?? e) })));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  return state;
}
