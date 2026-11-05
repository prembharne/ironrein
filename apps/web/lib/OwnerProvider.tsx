"use client";
// Holds the unlocked signer in memory for this tab only. Reloading locks it again.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { decryptSeed, loadRecord, saveRecord, type KeyRecord } from "./keystore";
import { unlockFromSeed, type OwnerSigner } from "./owner";

interface OwnerState {
  record: KeyRecord | null;
  signer: OwnerSigner | null;
  ready: boolean;
  adopt(record: KeyRecord, signer?: OwnerSigner): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  lock(): void;
}

const Ctx = createContext<OwnerState | null>(null);

export function OwnerProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<KeyRecord | null>(null);
  const [signer, setSigner] = useState<OwnerSigner | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadRecord()
      .then((r) => setRecord(r ?? null))
      .catch(() => setRecord(null))
      .finally(() => setReady(true));
  }, []);

  const adopt = useCallback(async (next: KeyRecord, nextSigner?: OwnerSigner) => {
    await saveRecord(next);
    setRecord(next);
    setSigner(nextSigner ?? null);
  }, []);

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!record) throw new Error("No key on this device yet.");
      const seed = await decryptSeed(record, passphrase);
      try {
        const next = unlockFromSeed(seed);
        if (next.publicKey !== record.public_key) {
          next.destroy();
          throw new Error("This keyfile's secret doesn't match its public key.");
        }
        setSigner(next);
      } finally {
        seed.fill(0);
      }
    },
    [record],
  );

  const lock = useCallback(() => {
    setSigner((s) => {
      s?.destroy();
      return null;
    });
  }, []);

  const value = useMemo(
    () => ({ record, signer, ready, adopt, unlock, lock }),
    [record, signer, ready, adopt, unlock, lock],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOwner(): OwnerState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useOwner must be inside OwnerProvider");
  return value;
}
