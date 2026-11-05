"use client";
import { useEffect, useState } from "react";
import { yoctoToNear, type VaultStatus } from "@warden/shared";
import { VAULT_ID } from "@/lib/config";
import { getPolicy, getStatus } from "@/lib/vault";
import { Badge } from "./ui";

const POLL_MS = 3000;

export function useVaultStatus() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!VAULT_ID) return;
    let live = true;
    const load = () =>
      getStatus()
        .then((s) => {
          if (live) {
            setStatus(s);
            setError(null);
          }
        })
        .catch((e) => live && setError(String(e.message ?? e)));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return { status, error };
}

export function VaultBar() {
  const { status, error } = useVaultStatus();
  const [cap, setCap] = useState<string | null>(null);
  useEffect(() => {
    if (VAULT_ID) getPolicy().then((p) => setCap(p.daily_cap)).catch(() => setCap(null));
  }, [status?.spent_today]);

  if (!VAULT_ID) return <p className="text-xs text-amber-300">No vault configured. Set NEXT_PUBLIC_VAULT_ACCOUNT_ID.</p>;
  if (error) return <p className="text-xs text-red-300">Can&apos;t read the vault: {error}</p>;
  if (!status) return <p className="text-xs text-zinc-500">Loading vault…</p>;
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-400">
      <Item label="Balance">{yoctoToNear(status.balance)} NEAR</Item>
      <Item label="Spent today">
        {yoctoToNear(status.spent_today)}
        {cap ? ` / ${yoctoToNear(cap)}` : ""} NEAR
      </Item>
      <Item label="Paid">{status.accepted_count}</Item>
      <Item label="Blocked">{status.rejected_count}</Item>
      <Badge tone={status.paused ? "bad" : "good"}>{status.paused ? "Paused" : "Active"}</Badge>
      <Badge tone={status.agent_key ? "good" : "bad"}>{status.agent_key ? "Agent key set" : "No agent key"}</Badge>
    </dl>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1">
      <dt>{label}:</dt>
      <dd className="font-medium text-zinc-100">{children}</dd>
    </div>
  );
}
