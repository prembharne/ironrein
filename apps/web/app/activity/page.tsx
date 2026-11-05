"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { yoctoToNear, type Activity } from "@warden/shared";
import { Badge, Button, Card, Mono, Notice, Steps } from "@/components/ui";
import { getTask, startTask, type Task } from "@/lib/agentApi";
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
  const [feedError, setFeedError] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      getRecent()
        .then((r) => {
          if (live) {
            setItems(r);
            setFeedError(null);
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
      <Card title="Give the agent a task">
        <p>The agent buys a report from the demo merchant, paying through the vault.</p>
        <Button onClick={runTask} disabled={starting}>{starting ? "Agent is working…" : "Run paid task"}</Button>
        {taskError && <Notice tone="error">{taskError}</Notice>}
        {task && <Steps steps={task.steps} />}
        {task?.error && <Notice tone="error">{task.error}</Notice>}
        {task?.result?.answer && <Notice tone="good">{task.result.answer}</Notice>}
      </Card>

      <Card title="Activity">
        {feedError && <Notice tone="error">Can&apos;t read the vault: {feedError}</Notice>}
        {items === null && !feedError && <p className="text-zinc-500">Loading…</p>}
        {items?.length === 0 && <p className="text-zinc-400">Nothing yet. Run a task or a Red Team attack.</p>}
        <ul className="divide-y divide-zinc-800">
          {items?.map((a, i) => <Row key={`${a.ts}-${i}`} a={a} />)}
        </ul>
      </Card>
    </>
  );
}

function Row({ a }: { a: Activity }) {
  const tone = a.kind === "spend" ? "good" : a.kind === "rejected" ? "bad" : "neutral";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <Badge tone={tone}>{LABELS[a.kind]}</Badge>
      {a.amount && <span className="font-medium text-zinc-100">{yoctoToNear(a.amount)} NEAR</span>}
      {a.payee && <span className="break-all">to {a.payee}</span>}
      {a.reason && <Mono>{a.reason}</Mono>}
      <time className="ml-auto text-xs text-zinc-500">
        {new Date(Number(BigInt(a.ts) / 1_000_000n)).toLocaleTimeString()}
      </time>
      {a.receipt_hash && (
        <Link href={`/receipt/${a.receipt_hash}`} className="w-full text-xs text-emerald-400 underline md:w-auto">
          Verify receipt
        </Link>
      )}
    </li>
  );
}
