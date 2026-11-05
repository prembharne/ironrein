"use client";
import { useState } from "react";
import { RequireSigner } from "@/components/Unlock";
import { Button, Card, Mono, Notice } from "@/components/ui";
import { useVaultStatus } from "@/components/VaultBar";
import { health } from "@/lib/agentApi";
import { useOwner } from "@/lib/OwnerProvider";
import { killSwitch, recover } from "@/lib/owner";

export default function KillPage() {
  const { record, signer } = useOwner();
  const { status } = useVaultStatus();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = record && signer ? { accountId: record.account_id, signer } : null;

  const run = async (work: () => Promise<{ hash: string }>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const tx = await work();
      setTxHash(tx.hash);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const fire = () => ctx && run(() => killSwitch(ctx, status?.agent_key ?? null), () => setRecovered(false));

  const restore = () =>
    ctx && run(async () => recover(ctx, (await health()).agent_public_key), () => setRecovered(true));

  return (
    <Card title="Kill switch">
      <p>Pauses the vault and removes the agent&apos;s key in one transaction, signed with your ML-DSA key.</p>
      <RequireSigner>
        {!confirming ? (
          <Button tone="danger" className="px-6 py-4 text-base" onClick={() => setConfirming(true)} disabled={busy}>
            Stop the agent now
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button tone="danger" onClick={fire} disabled={busy}>
              {busy ? "Signing with ML-DSA…" : "Yes, pause and revoke"}
            </Button>
            <Button tone="ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
          </div>
        )}
        {status?.paused && (
          <div className="mt-4">
            <Button tone="ghost" onClick={restore} disabled={busy}>Unpause and restore the agent&apos;s key</Button>
          </div>
        )}
      </RequireSigner>
      {error && <Notice tone="error">{error}</Notice>}
      {txHash && (
        <Notice tone="good">
          {recovered ? "Agent restored." : "Done."} Transaction <Mono>{txHash}</Mono>
        </Notice>
      )}
    </Card>
  );
}
