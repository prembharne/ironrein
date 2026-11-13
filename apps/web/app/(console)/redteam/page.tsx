"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { yoctoToNear } from "@ironrein/shared";
import { RequireSigner } from "@/components/Unlock";
import { Badge, Button, Card, Notice, Steps } from "@/components/ui";
import { useVaultStatus } from "@/components/VaultBar";
import { continueRun, getRun, startRedTeam, type Run } from "@/lib/agentApi";
import { useOwner } from "@/lib/OwnerProvider";
import { killSwitch } from "@/lib/owner";

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
  return (
    <>
      <Notice>Every result below comes from the chain. Nothing here is simulated in the browser.</Notice>
      {SCENARIOS.map((s) => <Scenario key={s.id} {...s} />)}
    </>
  );
}

function Scenario({ id, title, what }: { id: string; title: string; what: string }) {
  const { record, signer } = useOwner();
  const { status } = useVaultStatus();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
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
