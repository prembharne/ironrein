// Types shared by the agent, merchant and web app, plus receipt hashing.
// Hashing uses WebCrypto so the browser recomputes hashes with the same code.

export type YoctoString = string;

export interface Policy {
  per_tx_cap: YoctoString;
  daily_cap: YoctoString;
  allowlist: string[];
  /** Nanosecond timestamp as a string; "0" means never. */
  expires_at: string;
  min_reserve: YoctoString;
}

export type ActivityKind =
  | "spend"
  | "rejected"
  | "policy_set"
  | "paused"
  | "unpaused"
  | "agent_key_rotated"
  | "agent_key_revoked"
  | "withdraw";

export interface Activity {
  kind: ActivityKind;
  ts: string;
  payee?: string;
  amount?: YoctoString;
  nonce?: string;
  receipt_hash?: string;
  memo?: string;
  reason?: string;
}

export interface SpendResult {
  ok: boolean;
  reason?: string;
}

export interface VaultStatus {
  owner_id: string;
  paused: boolean;
  balance: YoctoString;
  spent_today: YoctoString;
  day_index: string;
  last_nonce: string;
  accepted_count: string;
  rejected_count: string;
  agent_key: string | null;
}

/** TEE evidence for one completion. Field names follow docs.near.ai/cloud/verification. */
export interface TeeEvidence {
  /** "provider_tee" binds to the model TEE; "gateway" only to the gateway. Null if unavailable. */
  signature_kind: string | null;
  signing_algo: string | null;
  signing_address: string | null;
  /** The signed text, as returned by GET /v1/signature/{id}. */
  text: string | null;
  signature: string | null;
  /** Client nonce used for the attestation report fetched before the completion. */
  attestation_nonce: string | null;
  /** Raw body of GET /v1/attestation/report, fetched before the completion. */
  attestation_raw: string | null;
  /** sha256 of the exact request and response bytes, for comparison with `text`. */
  request_sha256: string;
  response_sha256: string;
  /** Why evidence is missing, if it is. Shown as-is in the UI. */
  unavailable_reason: string | null;
}

export interface ReceiptBundle {
  version: 1;
  task_id: string;
  created_at: string;
  model: string;
  /** Exact bytes sent to and received from the model, so the sha256 values can be rechecked. */
  raw_request: string;
  raw_response: string;
  tee: TeeEvidence;
  spend_intent: {
    payee: string;
    amount: YoctoString;
    nonce: string;
    memo: string;
    reason: string;
  };
}

export const REJECTION_REASONS = [
  "paused",
  "expired",
  "payee_not_allowed",
  "over_per_tx_cap",
  "over_daily_cap",
  "bad_nonce",
  "bad_receipt_hash",
  "below_reserve",
] as const;

const YOCTO_DECIMALS = 24;

export function nearToYocto(near: string | number): YoctoString {
  const text = String(near).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`invalid NEAR amount: ${text}`);
  const [whole, frac = ""] = text.split(".");
  if (frac.length > YOCTO_DECIMALS) throw new Error(`too many decimals: ${text}`);
  return BigInt(whole + frac.padEnd(YOCTO_DECIMALS, "0")).toString();
}

export function yoctoToNear(yocto: YoctoString, maxDecimals = 4): string {
  const value = BigInt(yocto).toString().padStart(YOCTO_DECIMALS + 1, "0");
  const whole = value.slice(0, -YOCTO_DECIMALS);
  const frac = value.slice(-YOCTO_DECIMALS).slice(0, maxDecimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/**
 * Deterministic JSON: object keys sorted by UTF-16 code unit, no whitespace. This
 * matches RFC 8785 for the values in a bundle (strings, integers, booleans, null,
 * arrays, objects). Non-integer numbers are refused rather than risk a mismatch.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`canonicalJson only accepts safe integers, got ${value}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`canonicalJson cannot encode ${typeof value}`);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function receiptHash(bundle: ReceiptBundle): Promise<string> {
  return sha256Hex(canonicalJson(bundle));
}

/** What the merchant turns a NEAR payment into on another chain, via NEAR Intents. */
export interface Settlement {
  /** "quote": live pricing from a 1Click dry run. No funds moved. */
  mode: "quote";
  provider: string;
  /** Decimal amounts, as formatted by 1Click. */
  amount_in: string;
  asset_in: string;
  amount_out: string;
  /** Smallest units of the destination asset, after slippage. */
  min_amount_out: string;
  asset_out: string;
  chain_out: string;
  asset_out_id: string;
  recipient: string;
  time_estimate_s: number | null;
  quoted_at: string;
  quote_signature: string | null;
  correlation_id: string | null;
}
