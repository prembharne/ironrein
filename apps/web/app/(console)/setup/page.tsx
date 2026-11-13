"use client";
import { useEffect, useState } from "react";
import { nearToYocto } from "@ironrein/shared";
import { RequireSigner } from "@/components/Unlock";
import { Badge, Button, Card, Field, Mono, Notice } from "@/components/ui";
import { health } from "@/lib/agentApi";
import { OWNER_ID, VAULT_ID } from "@/lib/config";
import { downloadKeyfile, parseKeyfile } from "@/lib/keystore";
import { useOwner } from "@/lib/OwnerProvider";
import { addBackupKey, createKey, deposit, enrollWithClassicalKey, isEnrolled, rotateAgentKey, withdraw } from "@/lib/owner";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function SetupPage() {
  const { record, signer, adopt, lock, ready } = useOwner();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!record) return setEnrolled(null);
    isEnrolled(record.account_id, record.public_key).then(setEnrolled).catch(() => setEnrolled(null));
  }, [record]);

  if (!ready) return <p className="text-white/45">Checking for a key…</p>;

  return (
    <>
      <Notice>
        Hackathon-grade key custody. Browser ML-DSA is not constant-time, and hardware wallets don&apos;t support
        ML-DSA yet. Testnet funds only.
      </Notice>
      {!record ? (
        <CreateKey />
      ) : (
        <>
          <Card title="Owner key">
            <p>Account: <Mono>{record.account_id}</Mono></p>
            <p>
              <Badge tone={enrolled ? "good" : "neutral"}>{enrolled ? "Enrolled on-chain" : "Not enrolled yet"}</Badge>{" "}
              <Badge tone={signer ? "good" : "neutral"}>{signer ? "Unlocked" : "Locked"}</Badge>
            </p>
            <details>
              <summary className="cursor-pointer text-xs text-white/60">Public key</summary>
              <Mono>{record.public_key}</Mono>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button tone="ghost" onClick={() => downloadKeyfile(record, "primary")}>Export encrypted keyfile</Button>
              {signer && <Button tone="ghost" onClick={lock}>Lock</Button>}
            </div>
          </Card>
          {enrolled === false && <Enroll onDone={() => setEnrolled(true)} />}
          {enrolled && (
            <>
              <Card title="Unlock"><RequireSigner><p>Your key is unlocked for this tab. Reloading locks it.</p></RequireSigner></Card>
              <Backup />
              <AgentKey />
              <Funds />
            </>
          )}
        </>
      )}
      {!record && <ImportKey adopt={adopt} />}
    </>
  );
}

function CreateKey() {
  const { adopt } = useOwner();
  const [accountId, setAccountId] = useState(OWNER_ID);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { signer, record } = await createKey(accountId.trim(), passphrase);
      await adopt(record, signer);
      setPassphrase("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Create your post-quantum owner key">
      <Field label="Your NEAR account" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="you.testnet" />
      <Field
        label="Passphrase"
        type="password"
        autoComplete="new-password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        hint="Encrypts the key on this device. At least 10 characters. It can't be recovered."
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button onClick={create} disabled={busy || !accountId.trim() || !passphrase}>
        {busy ? "Creating…" : "Create ML-DSA-65 key"}
      </Button>
    </Card>
  );
}

function ImportKey({ adopt }: { adopt: ReturnType<typeof useOwner>["adopt"] }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="Or restore from a keyfile">
      <input
        type="file"
        accept=".keyfile,application/json"
        aria-label="Ironrein keyfile"
        className="text-sm text-white/70 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-[#0b1d3a] hover:file:bg-white/85"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            setError(null);
            await adopt(parseKeyfile(await file.text()));
          } catch (err) {
            setError(message(err));
          }
        }}
      />
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

function Enroll({ onDone }: { onDone: () => void }) {
  const { record } = useOwner();
  const [classical, setClassical] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enroll = async () => {
    if (!record) return;
    setBusy(true);
    setError(null);
    try {
      await enrollWithClassicalKey(record.account_id, record.public_key, classical.trim());
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setClassical("");
      setBusy(false);
    }
  };

  return (
    <Card title="Enroll the key on your account">
      <p>
        An ML-DSA key can&apos;t add itself, so your existing classical key signs this once. It stays in memory for
        this one transaction and is never saved. Use a testnet account only.
      </p>
      <Field
        label="Classical private key (ed25519:…)"
        type="password"
        autoComplete="off"
        value={classical}
        onChange={(e) => setClassical(e.target.value)}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button onClick={enroll} disabled={busy || !classical}>{busy ? "Enrolling…" : "Enroll key"}</Button>
    </Card>
  );
}

function Backup() {
  const { record, signer } = useOwner();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!record || !signer) return;
    setBusy(true);
    setError(null);
    try {
      downloadKeyfile(await addBackupKey(record.account_id, signer, passphrase), "backup");
      setDone(true);
      setPassphrase("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Backup key">
      <p>Adds a second ML-DSA key to your account and downloads it encrypted. Do this before removing any other key.</p>
      <RequireSigner>
        <Field
          label="Backup passphrase"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <div className="mt-2">
          <Button tone="ghost" onClick={create} disabled={busy || !passphrase}>
            {busy ? "Signing…" : "Create backup key"}
          </Button>
        </div>
      </RequireSigner>
      {done && <Notice tone="good">Backup key added and downloaded.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

function AgentKey() {
  const { record, signer } = useOwner();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rotate = async () => {
    if (!record || !signer) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const { agent_public_key } = await health();
      await rotateAgentKey({ accountId: record.account_id, signer }, agent_public_key);
      setDone(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Agent key">
      <p>Gives the agent service a key that can only call <Mono>agent_spend</Mono> on <Mono>{VAULT_ID}</Mono>, with a 0.25 NEAR gas budget.</p>
      <RequireSigner>
        <Button tone="ghost" onClick={rotate} disabled={busy}>{busy ? "Signing…" : "Set agent key"}</Button>
      </RequireSigner>
      {done && <Notice tone="good">Agent key set.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

function Funds() {
  const { record, signer } = useOwner();
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "deposit" | "withdraw") => {
    if (!record || !signer) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const ctx = { accountId: record.account_id, signer };
      const yocto = nearToYocto(amount);
      await (kind === "deposit" ? deposit(ctx, yocto) : withdraw(ctx, yocto));
      setNote(kind === "deposit" ? "Deposited." : "Withdrawn to your account.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Vault funds">
      <Field label="Amount (NEAR)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <RequireSigner>
        <div className="flex flex-wrap gap-2">
          <Button tone="ghost" onClick={() => run("deposit")} disabled={busy}>Deposit</Button>
          <Button tone="ghost" onClick={() => run("withdraw")} disabled={busy}>Withdraw</Button>
        </div>
      </RequireSigner>
      {note && <Notice tone="good">{note}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}
