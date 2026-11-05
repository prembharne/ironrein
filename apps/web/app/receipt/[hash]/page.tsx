"use client";
import { use, useEffect, useState } from "react";
import { yoctoToNear, type ReceiptBundle } from "@warden/shared";
import { Badge, Card, Mono, Notice } from "@/components/ui";
import { getReceipt } from "@/lib/agentApi";
import { getRecent, onChainHashes } from "@/lib/vault";
import { verifyBundle, type Check } from "@/lib/verifyReceipt";

const TONES = { pass: "good", fail: "bad", unavailable: "neutral" } as const;
const WORDS = { pass: "Pass", fail: "Fail", unavailable: "Not verified" };

export default function ReceiptPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params);
  const [bundle, setBundle] = useState<ReceiptBundle | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const loaded: ReceiptBundle = await getReceipt(hash);
      setBundle(loaded);
      let onChain: boolean | null = null;
      try {
        onChain = onChainHashes(await getRecent()).has(hash);
      } catch {
        onChain = null;
      }
      setChecks(await verifyBundle(loaded, hash, onChain));
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [hash]);

  if (error) return <Notice tone="error">Receipt not found: {error}</Notice>;
  if (!bundle) return <p className="text-zinc-500">Loading receipt…</p>;

  const reply = parseReply(bundle.raw_response);
  return (
    <>
      <Card title="Why the agent paid">
        <p className="text-zinc-100">{bundle.spend_intent.reason || "No reason given."}</p>
        <p>
          {yoctoToNear(bundle.spend_intent.amount)} NEAR to {bundle.spend_intent.payee}, decided by{" "}
          <Mono>{bundle.model}</Mono>
        </p>
        {reply && <pre className="overflow-x-auto rounded bg-zinc-950 p-3 text-xs whitespace-pre-wrap">{reply}</pre>}
      </Card>
      <Card title="Verification">
        <p>Receipt <Mono>{hash}</Mono></p>
        {!checks && <p className="text-zinc-500">Checking…</p>}
        <ul className="space-y-2">
          {checks?.map((c) => (
            <li key={c.label}>
              <Badge tone={TONES[c.state]}>{WORDS[c.state]}</Badge>{" "}
              <span className="font-medium text-zinc-100">{c.label}</span>
              <p className="mt-0.5 text-xs break-words text-zinc-400">{c.detail}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function parseReply(raw: string): string | null {
  try {
    const message = JSON.parse(raw).choices?.[0]?.message;
    const calls = message?.tool_calls?.map((c: any) => `${c.function.name}(${c.function.arguments})`).join("\n");
    return [message?.content, calls].filter(Boolean).join("\n") || null;
  } catch {
    return null;
  }
}
