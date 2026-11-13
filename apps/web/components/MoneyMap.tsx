"use client";
import { useEffect, useState } from "react";
import { yoctoToNear, type Activity, type Policy } from "@ironrein/shared";
import { OWNER_ID, VAULT_ID } from "@/lib/config";
import { accountUrl } from "@/lib/explorer";
import { getBalance, moneyRows } from "@/lib/money";
import { getPolicy } from "@/lib/vault";
import { Badge, Card } from "./ui";

/** Shows which account holds the money and what each payee got, all read from the chain. */
export function MoneyMap({ events, vaultBalance }: { events: Activity[] | null; vaultBalance: string | null }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [balances, setBalances] = useState<Record<string, bigint | null>>({});
  const rows = policy && events ? moneyRows(events, policy) : [];
  const accounts = rows.map((r) => r.account).join(",");
  // Balances only move when the vault pays or refuses, so reload on a new newest event.
  const newest = events?.[0]?.ts ?? "";

  useEffect(() => {
    getPolicy().then(setPolicy).catch(() => setPolicy(null));
  }, [newest]);

  useEffect(() => {
    if (!accounts) return;
    let live = true;
    for (const id of accounts.split(",")) {
      getBalance(id)
        .then((b) => live && setBalances((prev) => ({ ...prev, [id]: b })))
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [accounts, newest]);

  if (!VAULT_ID) return null;
  return (
    <Card title="Where the money is">
      <p className="text-xs text-white/50">
        Balances are read from NEAR. Amounts received and refused are added up from the vault&apos;s last 50 events.
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        <Tile
          account={VAULT_ID}
          badge={<Badge tone="good">Vault holds the money</Badge>}
          balance={vaultBalance === null ? undefined : BigInt(vaultBalance)}
          note={`Only the contract can move it. The owner ${OWNER_ID || "account"} sets the rules.`}
        />
        {rows.map((r) => (
          <Tile
            key={r.account}
            account={r.account}
            badge={
              r.role === "approved" ? <Badge tone="neutral">Approved payee</Badge> : <Badge tone="bad">Not approved</Badge>
            }
            balance={balances[r.account]}
            note={
              <>
                Received <b className="text-white">{yoctoToNear(r.received.toString())} NEAR</b> from the vault in{" "}
                {r.paidCount} {r.paidCount === 1 ? "payment" : "payments"}.
                {r.refusedCount > 0 && (
                  <span className="text-red-300">
                    {" "}
                    {r.refusedCount} {r.refusedCount === 1 ? "attempt" : "attempts"} to send it{" "}
                    {yoctoToNear(r.refused.toString())} NEAR refused.
                  </span>
                )}
              </>
            }
          />
        ))}
      </ul>
    </Card>
  );
}

function Tile({
  account,
  badge,
  balance,
  note,
}: {
  account: string;
  badge: React.ReactNode;
  /** undefined while loading, null if the account does not exist. */
  balance: bigint | null | undefined;
  note: React.ReactNode;
}) {
  return (
    <li className="rounded-xl border border-white/10 bg-black/25 p-3.5">
      <div className="flex flex-wrap items-center gap-2">{badge}</div>
      <p className="mt-2 text-xl font-medium tracking-[-0.01em] text-white">
        {balance === undefined ? "…" : balance === null ? "No such account" : `${yoctoToNear(balance.toString())} NEAR`}
      </p>
      <a
        href={accountUrl(account)}
        target="_blank"
        rel="noreferrer"
        className="break-all text-xs text-sky-400 underline"
      >
        {account} ↗
      </a>
      <p className="mt-2 text-xs text-white/60">{note}</p>
    </li>
  );
}
