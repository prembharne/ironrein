// Stores receipt bundles by hash, so anyone can later re-hash them against the chain.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { receiptHash, type ReceiptBundle } from "@ironrein/shared";

export interface ReceiptStore {
  save(bundle: ReceiptBundle): Promise<string>;
  load(hash: string): ReceiptBundle | null;
}

export function createReceiptStore(dir: string): ReceiptStore {
  mkdirSync(dir, { recursive: true });
  return {
    async save(bundle) {
      const hash = await receiptHash(bundle);
      writeFileSync(join(dir, `${hash}.json`), JSON.stringify(bundle, null, 2));
      return hash;
    },
    load(hash) {
      // The strict pattern also blocks path traversal through the URL parameter.
      if (!/^[0-9a-f]{64}$/.test(hash)) return null;
      try {
        return JSON.parse(readFileSync(join(dir, `${hash}.json`), "utf8"));
      } catch {
        return null;
      }
    },
  };
}
