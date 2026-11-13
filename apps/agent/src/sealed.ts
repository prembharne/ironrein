// Sealed signer mode: the agent key lives inside an OutLayer TEE (enclave/agent-signer),
// not on this machine. This service asks the enclave to call agent_spend and then reads
// the vault's verdict from the chain itself.
//
// Request and response fields follow https://app.outlayer.ai/docs/https-api, read on
// 2026-11-11. This path has NOT been run against OutLayer yet: it needs a deployed
// project, a sealed secret and a payment key, which only the account owner can create.
import type { SpendOutcome, SpendRequest } from "./chain.ts";
import { parseSpendResult } from "./chain.ts";

export const OUTLAYER_TESTNET_API = "https://testnet-api.outlayer.ai";

export interface SealedConfig {
  apiUrl: string;
  /** "<project_owner>/<project_name>" as deployed on OutLayer. */
  project: string;
  /** OutLayer payment key, "owner:nonce:secret". Pays for enclave calls only. */
  paymentKey: string;
  /** Which stored secret holds PROTECTED_AGENT_KEY. */
  secretsProfile: string;
  secretsAccount: string;
  /** Public half of the sealed key, as the enclave reported it. */
  agentPublicKey: string;
}

/** Sealed mode is on when OUTLAYER_PROJECT is set. Then the rest must be set too. */
export function sealedConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SealedConfig | null {
  if (!env.OUTLAYER_PROJECT) return null;
  const need = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`OUTLAYER_PROJECT is set, so ${name} must be set too`);
    return value;
  };
  if (!/^[^/\s]+\/[^/\s]+$/.test(env.OUTLAYER_PROJECT)) {
    throw new Error("OUTLAYER_PROJECT must look like owner.testnet/project-name");
  }
  return {
    apiUrl: env.OUTLAYER_API_URL ?? OUTLAYER_TESTNET_API,
    project: env.OUTLAYER_PROJECT,
    paymentKey: need("OUTLAYER_PAYMENT_KEY"),
    secretsProfile: env.OUTLAYER_SECRETS_PROFILE ?? "default",
    secretsAccount: need("OUTLAYER_SECRETS_ACCOUNT"),
    agentPublicKey: need("AGENT_PUBLIC_KEY"),
  };
}

export interface EnclaveReply {
  output: any;
  call_id: string | null;
  /** Where OutLayer serves the TDX attestation for this call. */
  attestation_url: string | null;
}

/** Runs the enclave signer once with `input` and returns what it printed. */
export async function callEnclave(cfg: SealedConfig, input: object, fetchImpl: typeof fetch = fetch): Promise<EnclaveReply> {
  const res = await fetchImpl(`${cfg.apiUrl}/call/${cfg.project}`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Payment-Key": cfg.paymentKey },
    body: JSON.stringify({
      input,
      secrets_ref: { profile: cfg.secretsProfile, account_id: cfg.secretsAccount },
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body.status !== "completed") {
    throw new Error(`OutLayer ${res.status}: ${body.error ?? body.status ?? "call failed"}`);
  }
  // VERIFY: the docs show `output` as a string. Accept an already-parsed object too.
  const output = typeof body.output === "string" ? JSON.parse(body.output) : body.output;
  return {
    output,
    call_id: typeof body.call_id === "string" ? body.call_id : null,
    attestation_url: typeof body.attestation_url === "string" ? new URL(body.attestation_url, cfg.apiUrl).toString() : null,
  };
}

/**
 * A replacement for the local-key spend. The enclave signs and submits; the verdict comes
 * from the transaction on NEAR, never from what the enclave says about it.
 */
export function createSealedSpend(
  cfg: SealedConfig,
  vaultId: string,
  readTx: (hash: string, sender: string) => Promise<any>,
  fetchImpl: typeof fetch = fetch,
): (req: SpendRequest) => Promise<SpendOutcome> {
  return async (req) => {
    let reply: EnclaveReply;
    try {
      reply = await callEnclave(cfg, { op: "spend", vault: vaultId, ...req }, fetchImpl);
    } catch (err) {
      return { ok: false, submitted: false, error: err instanceof Error ? err.message : String(err) };
    }
    const sealed = { call_id: reply.call_id, attestation_url: reply.attestation_url };
    const txHash = reply.output?.tx_hash;
    if (typeof txHash !== "string" || !txHash) {
      // The enclave could not submit, e.g. NEAR refused a revoked key.
      return { ok: false, submitted: false, error: String(reply.output?.error ?? "enclave returned no transaction"), sealed };
    }
    try {
      return { ...parseSpendResult(await readTx(txHash, vaultId)), tx_hash: txHash, sealed };
    } catch (err) {
      return { ok: false, submitted: true, tx_hash: txHash, error: `could not read the transaction: ${err instanceof Error ? err.message : err}`, sealed };
    }
  };
}
