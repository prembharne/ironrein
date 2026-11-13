"use client";
import { useEffect, useState } from "react";
import { yoctoToNear, type VaultStatus } from "@ironrein/shared";
import { VAULT_ID } from "@/lib/config";
import { spentToday } from "@/lib/spentToday";
import { getPolicy, getStatus } from "@/lib/vault";
import { health } from "@/lib/agentApi";
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

/** Whether the local agent service (tasks, Red Team, receipts) answers. null while checking. */
function useAgentOnline() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const check = () => health().then(() => live && setOnline(true), () => live && setOnline(false));
    check();
    const timer = setInterval(check, 10_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return online;
}

export function VaultBar() {
  const { status, error } = useVaultStatus();
  const agentOnline = useAgentOnline();
  const [cap, setCap] = useState<string | null>(null);
  useEffect(() => {
    if (VAULT_ID) getPolicy().then((p) => setCap(p.daily_cap)).catch(() => setCap(null));
  }, [status?.spent_today]);

  const strip = "rounded-2xl border border-white/10 bg-[rgba(14,18,28,0.6)] px-5 py-3.5 text-xs backdrop-blur-[16px]";
  if (!VAULT_ID) return <p className={`${strip} text-amber-200`}>No vault configured. Set NEXT_PUBLIC_VAULT_ACCOUNT_ID.</p>;
  if (error) return <p className={`${strip} text-red-200`}>Can&apos;t read the vault: {error}</p>;
  if (!status) return <p className={`${strip} text-white/45`}>Loading vault…</p>;
  return (
    <dl className={`${strip} flex flex-wrap items-center gap-x-8 gap-y-3`}>
      <Item label="Balance">{yoctoToNear(status.balance)} NEAR</Item>
      <Item label="Spent today">
        {yoctoToNear(spentToday(status))}
        {cap ? ` / ${yoctoToNear(cap)}` : ""} NEAR
      </Item>
      <Item label="Paid">{status.accepted_count}</Item>
      <Item label="Blocked">{status.rejected_count}</Item>
      <div className="flex flex-wrap gap-2 md:ml-auto">
        <Badge tone={status.paused ? "bad" : "good"}>{status.paused ? "Paused" : "Active"}</Badge>
        <Badge tone={status.agent_key ? "good" : "bad"}>{status.agent_key ? "Agent key set" : "No agent key"}</Badge>
        {agentOnline !== null && (
          <Badge tone={agentOnline ? "good" : "bad"}>{agentOnline ? "Agent service online" : "Agent service offline"}</Badge>
        )}
      </div>
    </dl>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">{label}</dt>
      <dd className="text-[15px] font-medium tracking-[-0.01em] text-white">{children}</dd>
    </div>
  );
}
