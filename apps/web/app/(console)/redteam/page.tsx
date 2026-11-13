"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { yoctoToNear } from "@ironrein/shared";
import { RequireSigner } from "@/components/Unlock";
import { Badge, Button, Card, Notice, Steps } from "@/components/ui";
import { useVaultStatus } from "@/components/VaultBar";
import { continueRun, getRun, startRedTeam, type Run, type Verdict } from "@/lib/agentApi";
import { useOwner } from "@/lib/OwnerProvider";
import { killSwitch } from "@/lib/owner";
import { capLeft, summarize } from "@/lib/scoreboard";
import { spentToday } from "@/lib/spentToday";
import { getPolicy } from "@/lib/vault";

const SCENARIOS = [
  {
    id: "injection",
    title: "1. Tricked agent",
    what: "A hostile merchant tries twice: text telling the agent to send the whole vault to an attacker, then a bill that names the attacker's account as payee. A real model reads both.",
  },
  {
    id: "stolen_key",
    title: "2. Stolen agent key",
    what: "An attacker holds the agent's key and tries everything. This really spends testnet NEAR up to the daily cap.",
  },
  {
    id: "qday",
    title: "3. Q-Day drill",
    what: "Assume a quantum computer broke the classical agent key. You stop it with your post-quantum key.",
  },
];

export default function RedTeamPage() {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const report = useCallback((id: string, verdict: Verdict | null) => {
    setVerdicts((prev) => {
      const { [id]: _old, ...rest } = prev;
      return verdict ? { ...rest, [id]: verdict } : rest;
    });
  }, []);
  return (
    <>
      <Notice>Every result below comes from the chain. Nothing here is simulated in the browser.</Notice>
      <Scoreboard verdicts={Object.values(verdicts)} />
      {SCENARIOS.map((s) => <Scenario key={s.id} {...s} onVerdict={report} />)}
    </>
  );
}

/** Running totals for this visit. Starts empty and fills as attacks finish. */
function Scoreboard({ verdicts }: { verdicts: Verdict[] }) {
  const score = summarize(verdicts);
  const lost = yoctoToNear(score.lostYocto.toString());
  const tone = score.run === 0 ? "text-white" : score.failed > 0 ? "text-red-300" : "text-emerald-300";
  return (
    <dl className="wd-fade flex flex-wrap items-center gap-x-10 gap-y-3 rounded-2xl border border-white/10 bg-[rgba(14,18,28,0.6)] px-5 py-4 backdrop-blur-[16px]">
      <Stat label="Attacks run">{score.run} / {SCENARIOS.length}</Stat>
      <Stat label="Defenses held"><span className={tone}>{score.held} / {score.run}</span></Stat>
      <Stat label="Funds lost to attackers"><span className={tone}>{lost} NEAR</span></Stat>
    </dl>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">{label}</dt>
      <dd className="text-2xl font-medium tracking-[-0.02em] text-white">{children}</dd>
    </div>
  );
}

function Scenario({
  id,
  title,
  what,
  onVerdict,
}: {
  id: string;
  title: string;
  what: string;
  onVerdict: (id: string, verdict: Verdict | null) => void;
}) {
  const { record, signer } = useOwner();
  const { status } = useVaultStatus();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [dailyCap, setDailyCap] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const watch = useCallback((runId: string) => {
    const tick = async () => {
      try {
        const next = await getRun(runId);
        setRun(next);
        if (next.status === "running") timer.current = setTimeout(tick, 1200);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    return tick();
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  // The scoreboard follows this scenario's verdict.
  const verdict = run?.verdict ?? null;
  useEffect(() => {
    onVerdict(id, verdict);
  }, [id, verdict, onVerdict]);

  // The stolen-key attack really spends the rest of the day's cap, so say how much that is.
  useEffect(() => {
    if (id === "stolen_key") getPolicy().then((p) => setDailyCap(p.daily_cap)).catch(() => setDailyCap(null));
  }, [id, status?.spent_today]);
  const spendLeft = dailyCap && status ? capLeft(dailyCap, spentToday(status)) : null;

  const start = async () => {
    setError(null);
    setRun(null);
    try {
      await watch((await startRedTeam(id)).run_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const signKillSwitch = async () => {
    if (!run || !record || !signer) return;
    setSigning(true);
    setError(null);
    try {
      const tx = await killSwitch({ accountId: record.account_id, signer }, status?.agent_key ?? null);
      await continueRun(run.id, tx.hash);
      await watch(run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  };

  const running = run?.status === "running";
  return (
    <Card title={title}>
      <p>{what}</p>
      {id === "stolen_key" && spendLeft !== null && (
        <Notice tone={spendLeft === 0n ? "error" : "neutral"}>
          {spendLeft === 0n
            ? "Today's cap is already used up, so this attack has nothing left to spend."
            : `This will send up to ${yoctoToNear(spendLeft.toString())} NEAR from the vault to the approved merchant, then paid tasks fail until midnight UTC. Run it last when recording.`}
        </Notice>
      )}
      <Button tone="danger" onClick={start} disabled={running || run?.status === "awaiting_owner"}>
        {running ? "Attack running…" : "Run attack"}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
      {run && <Steps steps={run.steps} />}
      {run?.status === "awaiting_owner" && (
        <RequireSigner>
          <Button tone="danger" onClick={signKillSwitch} disabled={signing}>
            {signing ? "Signing with ML-DSA…" : "Sign kill switch with ML-DSA key"}
          </Button>
        </RequireSigner>
      )}
      {run?.error && <Notice tone="error">The run failed: {run.error}</Notice>}
      {run?.verdict && (
        <div className="space-y-1">
          <Badge tone={run.verdict.passed ? "good" : "bad"}>
            {run.verdict.passed ? "DEFENSE HELD" : "DEFENSE FAILED"}
          </Badge>
          <p className="text-white">{run.verdict.summary}</p>
          <p className="text-xs text-white/60">
            Funds lost: {yoctoToNear(run.verdict.funds_lost_yocto)} NEAR
            {run.verdict.max_loss_yocto && ` (worst case is the daily cap, ${yoctoToNear(run.verdict.max_loss_yocto)} NEAR)`}
          </p>
        </div>
      )}
    </Card>
  );
}
