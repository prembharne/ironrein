// NEAR access for the agent: reads vault state, and sends agent_spend signed with
// the restricted function-call key. Anything else this key tries is refused by NEAR.
import { actions, config, queryAccount, sendTx, view } from "@fastnear/api";
import { publicKeyFromPrivate, signerFromPrivateKey } from "@fastnear/utils";
import type { Activity, Policy, SpendResult, VaultStatus } from "@leash/shared";

export interface SpendRequest {
  payee: string;
  amount: string;
  nonce: string;
  receipt_hash: string;
  memo: string;
}

export interface SpendOutcome extends SpendResult {
  /** False when NEAR refused the transaction outright, e.g. the key was revoked. */
  submitted: boolean;
  tx_hash?: string;
  error?: string;
  /** Set when the spend was signed inside the OutLayer enclave (sealed signer mode). */
  sealed?: { call_id: string | null; attestation_url: string | null };
}

export interface Chain {
  status(): Promise<VaultStatus>;
  policy(): Promise<Policy>;
  recent(limit?: number): Promise<Activity[]>;
  balance(accountId: string): Promise<bigint>;
  spend(req: SpendRequest): Promise<SpendOutcome>;
  tx(hash: string, sender: string): Promise<any>;
  vaultId: string;
  agentPublicKey: string;
}

const SPEND_GAS = "30000000000000";

/** Reads the contract's return value out of a final transaction result. */
export function parseSpendResult(result: any): SpendOutcome {
  const tx_hash: string | undefined = result?.transaction?.hash;
  const success = result?.status?.SuccessValue;
  if (typeof success !== "string") {
    return {
      ok: false,
      submitted: true,
      tx_hash,
      error: JSON.stringify(result?.status?.Failure ?? result?.status ?? "unknown status"),
    };
  }
  const value = JSON.parse(Buffer.from(success, "base64").toString("utf8")) as SpendResult;
  return { ok: value.ok, reason: value.reason, submitted: true, tx_hash };
}

export function createChain(opts: {
  networkId: string;
  rpcUrl: string;
  vaultId: string;
  /** Local agent key. Leave out in sealed signer mode. */
  agentPrivateKey?: string;
  /** Sealed signer mode: the key is in an enclave, which signs each spend. */
  sealed?: { agentPublicKey: string; spend: (req: SpendRequest) => Promise<SpendOutcome> };
}): Chain {
  config({ networkId: opts.networkId as "testnet" | "mainnet", nodeUrl: opts.rpcUrl });
  if (!opts.sealed && !opts.agentPrivateKey) throw new Error("createChain needs agentPrivateKey or sealed");
  const signer = opts.agentPrivateKey ? signerFromPrivateKey(opts.agentPrivateKey) : null;
  const callView = (methodName: string, args: object = {}) =>
    view({ contractId: opts.vaultId, methodName, args });

  // One spend at a time: each needs the next chain nonce and the next vault nonce.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    vaultId: opts.vaultId,
    agentPublicKey: opts.sealed?.agentPublicKey ?? publicKeyFromPrivate(opts.agentPrivateKey!),
    status: () => callView("get_status"),
    policy: () => callView("get_policy"),
    recent: (limit = 50) => callView("get_recent", { limit }),
    async balance(accountId) {
      const account: any = await queryAccount({ accountId });
      return BigInt(account.result?.amount ?? account.amount);
    },
    spend(req) {
      const run = async (): Promise<SpendOutcome> => {
        if (opts.sealed) return opts.sealed.spend(req);
        try {
          const result = await sendTx({
            signerId: opts.vaultId,
            signer: signer!,
            receiverId: opts.vaultId,
            actions: [
              actions.functionCall({
                methodName: "agent_spend",
                gas: SPEND_GAS,
                deposit: "0",
                args: { ...req },
              }),
            ],
            waitUntil: "FINAL",
          });
          return parseSpendResult(result.result ?? result);
        } catch (err) {
          return {
            ok: false,
            submitted: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      };
      const next = queue.then(run, run);
      queue = next;
      return next;
    },
    async tx(hash, sender) {
      const res = await fetch(opts.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "leash",
          method: "EXPERIMENTAL_tx_status",
          params: { tx_hash: hash, sender_account_id: sender, wait_until: "FINAL" },
        }),
      });
      const body: any = await res.json();
      if (body.error) throw new Error(body.error.cause?.name ?? "rpc error");
      return body.result;
    },
  };
}
