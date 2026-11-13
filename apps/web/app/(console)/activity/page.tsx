"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { yoctoToNear, type Activity, type Settlement } from "@leash/shared";
import { MoneyMap } from "@/components/MoneyMap";
import { Badge, Button, Card, Mono, Notice, Steps } from "@/components/ui";
import { useVaultStatus } from "@/components/VaultBar";
import { getTask, startTask, type Task } from "@/lib/agentApi";
import { VAULT_ID } from "@/lib/config";
import { accountUrl, getVaultTxs, matchTxs, txUrl, type VaultTx } from "@/lib/explorer";
import { getRecent } from "@/lib/vault";

const POLL_MS = 3000;
const LABELS: Record<Activity["kind"], string> = {
  spend: "Paid",
  rejected: "Rejected",
  policy_set: "Policy changed",
  paused: "Paused",
  unpaused: "Unpaused",
  agent_key_rotated: "Agent key rotated",
  agent_key_revoked: "Agent key revoked",
  withdraw: "Withdrawn",
};

export default function ActivityPage() {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [txs, setTxs] = useState<VaultTx[]>([]);
  const [txError, setTxError] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { status } = useVaultStatus();

  useEffect(() => {
    let live = true;
    let newest: string | null = null;
    const load = () =>
      getRecent()
        .then((r) => {
          if (!live) return;
          setItems(r);
          setFeedError(null);
          // Ask the indexer for tx hashes only when there's a new event, to stay inside its rate limit.
          if (r[0] && r[0].ts !== newest) {
            newest = r[0].ts;
            getVaultTxs()
              .then((t) => {
                if (!live) return;
                setTxs(t);
                setTxError(null);
              })
              .catch((e) => {
                newest = null; // retry on the next poll
                if (live) setTxError(String(e.message ?? e));
              });
          }
        })
        .catch((e) => live && setFeedError(String(e.message ?? e)));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const runTask = async () => {
    setStarting(true);
    setTaskError(null);
    setTask(null);
    try {
      const { task_id } = await startTask("Buy the market report and summarize it.");
      const poll = async () => {
        const t = await getTask(task_id);
        setTask(t);
        if (t.status === "running") setTimeout(() => poll().catch(fail), 1500);
        else setStarting(false);
      };
      const fail = (e: Error) => {
        setTaskError(e.message);
        setStarting(false);
      };
      await poll();
    } catch (e) {
      setTaskError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  return (
    <>
      <MoneyMap events={items} vaultBalance={status?.balance ?? null} />

      <Card title="Give the agent a task">
        <p>The agent buys a report from the demo merchant, paying through the vault.</p>
        <Button onClick={runTask} disabled={starting}>{starting ? "Agent is working…" : "Run paid task"}</Button>
        {taskError && <Notice tone="error">{taskError}</Notice>}
        {task && <Steps steps={task.steps} />}
        {task?.error && <Notice tone="error">{task.error}</Notice>}
        {task?.result?.answer && <Notice tone="good">{task.result.answer}</Notice>}
        {task?.result?.settlement && <SettlementCard s={task.result.settlement} />}
      </Card>

      <Card title="Activity">
        <p className="text-xs text-white/50">
          Read live from the vault contract{" "}
          <a className="text-sky-400 underline" href={accountUrl(VAULT_ID)} target="_blank" rel="noreferrer">
            {VAULT_ID}
          </a>
          . Each entry links to the transaction that caused it.
          {txError && <span className="text-amber-200"> Transaction links are unavailable right now ({txError}).</span>}
        </p>
        {feedError && <Notice tone="error">Can&apos;t read the vault: {feedError}</Notice>}
        {items === null && !feedError && <p className="text-white/45">Loading…</p>}
        {items?.length === 0 && <p className="text-white/60">Nothing yet. Run a task or a Red Team attack.</p>}
        <ul className="divide-y divide-white/10">
          {items && matchTxs(items, txs).map((hash, i) => <Row key={`${items[i].ts}-${i}`} a={items[i]} tx={hash} />)}
        </ul>
      </Card>
    </>
  );
}

function Row({ a, tx }: { a: Activity; tx: string | null }) {
  const tone = a.kind === "spend" ? "good" : a.kind === "rejected" ? "bad" : "neutral";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <Badge tone={tone}>{LABELS[a.kind]}</Badge>
      {a.amount && <span className="font-medium text-white">{yoctoToNear(a.amount)} NEAR</span>}
      {a.payee && <span className="break-all">to {a.payee}</span>}
      {a.reason && <Mono>{a.reason}</Mono>}
      <time className="ml-auto text-xs text-white/45" dateTime={new Date(Number(BigInt(a.ts) / 1_000_000n)).toISOString()}>
        {new Date(Number(BigInt(a.ts) / 1_000_000n)).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
      </time>
      {tx && (
        <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="text-xs text-sky-400 underline" title={tx}>
          {tx.slice(0, 6)}…{tx.slice(-4)} ↗
        </a>
      )}
      {a.receipt_hash && (
        <Link href={`/receipt/${a.receipt_hash}`} className="w-full text-xs text-sky-400 underline md:w-auto">
          Verify receipt
        </Link>
      )}
    </li>
  );
}

function SettlementCard({ s }: { s: Settlement }) {
  return (
    <div className="rounded-xl border border-sky-400/25 bg-sky-400/5 p-3.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">Cross-chain settlement quote</Badge>
        <span className="text-xs text-white/50">{s.provider}</span>
      </div>
      <p className="mt-2 text-base font-medium text-white">
        {s.amount_in} {s.asset_in} <span className="text-sky-400">→</span> {s.amount_out} {s.asset_out} on{" "}
        <span className="capitalize">{s.chain_out}</span>
      </p>
      <p className="mt-1 break-all text-xs text-white/60">
        To the merchant&apos;s address <Mono>{s.recipient}</Mono>
        {s.time_estimate_s !== null && <> in about {s.time_estimate_s} seconds</>}. Priced{" "}
        {new Date(s.quoted_at).toLocaleTimeString()}.
      </p>
      <p className="mt-2 text-xs text-white/45">
        The agent paid the merchant&apos;s allowlisted NEAR account, so the vault&apos;s policy is unchanged. This is a
        live market quote and no funds moved across chains: NEAR Intents runs on mainnet and this vault is on testnet.
      </p>
    </div>
  );
}
