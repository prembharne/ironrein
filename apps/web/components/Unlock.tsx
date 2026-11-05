"use client";
// Gate for anything that signs. Shows what's needed when the key isn't unlocked.
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { useOwner } from "@/lib/OwnerProvider";
import { Button, Field, Notice } from "./ui";

export function RequireSigner({ children }: { children: ReactNode }) {
  const { record, signer, ready, unlock } = useOwner();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <p className="text-zinc-500">Checking for a key…</p>;
  if (!record) {
    return (
      <Notice>
        You need an owner key to sign this. <Link className="underline" href="/setup">Create one in Setup</Link>.
      </Notice>
    );
  }
  if (signer) return <>{children}</>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(passphrase);
      setPassphrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <Field
        label="Passphrase"
        type="password"
        autoComplete="current-password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy || !passphrase}>
        {busy ? "Unlocking…" : "Unlock owner key"}
      </Button>
    </form>
  );
}
