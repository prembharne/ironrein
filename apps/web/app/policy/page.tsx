"use client";
import { useEffect, useState } from "react";
import { nearToYocto, yoctoToNear } from "@warden/shared";
import { RequireSigner } from "@/components/Unlock";
import { Button, Card, Field, Notice } from "@/components/ui";
import { useOwner } from "@/lib/OwnerProvider";
import { setPolicy } from "@/lib/owner";
import { getPolicy } from "@/lib/vault";

interface Form {
  perTx: string;
  daily: string;
  reserve: string;
  allowlist: string;
  expiry: string;
}

export default function PolicyPage() {
  const { record, signer } = useOwner();
  const [form, setForm] = useState<Form | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPolicy()
      .then((p) =>
        setForm({
          perTx: yoctoToNear(p.per_tx_cap, 24),
          daily: yoctoToNear(p.daily_cap, 24),
          reserve: yoctoToNear(p.min_reserve, 24),
          allowlist: p.allowlist.join(", "),
          expiry: p.expires_at === "0" ? "" : new Date(Number(BigInt(p.expires_at) / 1_000_000n)).toISOString().slice(0, 16),
        }),
      )
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const update = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));
    setState("idle");
  };

  const save = async () => {
    if (!form || !signer || !record) return;
    setState("saving");
    setError(null);
    try {
      const allowlist = form.allowlist.split(",").map((s) => s.trim()).filter(Boolean);
      const expires_at = form.expiry ? (BigInt(new Date(`${form.expiry}Z`).getTime()) * 1_000_000n).toString() : "0";
      await setPolicy(
        { accountId: record.account_id, signer },
        {
          per_tx_cap: nearToYocto(form.perTx),
          daily_cap: nearToYocto(form.daily),
          min_reserve: nearToYocto(form.reserve),
          allowlist,
          expires_at,
        },
      );
      setState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("idle");
    }
  };

  return (
    <Card title="Spending policy">
      <p>The vault enforces these on-chain. The agent has no way to change them.</p>
      {error && <Notice tone="error">{error}</Notice>}
      {!form && !error && <p className="text-zinc-500">Loading…</p>}
      {form && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Max per payment (NEAR)" inputMode="decimal" value={form.perTx} onChange={update("perTx")} />
            <Field label="Max per UTC day (NEAR)" inputMode="decimal" value={form.daily} onChange={update("daily")} />
            <Field
              label="Keep in vault (NEAR)"
              inputMode="decimal"
              value={form.reserve}
              onChange={update("reserve")}
              hint="The agent can't spend below this."
            />
          </div>
          <Field
            label="Allowed payees"
            value={form.allowlist}
            onChange={update("allowlist")}
            hint="NEAR accounts, comma separated. Empty means the agent can pay nobody."
          />
          <Field
            label="Expires (UTC)"
            type="datetime-local"
            value={form.expiry}
            onChange={update("expiry")}
            hint="Leave empty for no expiry."
          />
          <RequireSigner>
            <Button onClick={save} disabled={state === "saving"}>
              {state === "saving" ? "Signing with ML-DSA…" : "Save policy"}
            </Button>
          </RequireSigner>
          {state === "saved" && <Notice tone="good">Policy saved on-chain, signed with your ML-DSA key.</Notice>}
        </>
      )}
    </Card>
  );
}
