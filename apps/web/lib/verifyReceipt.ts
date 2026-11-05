// Re-verifies a receipt in the browser. What each check proves is spelled out in
// its label, because none of these verify the Intel/NVIDIA attestation quote itself.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { receiptHash, sha256Hex, type ReceiptBundle } from "@warden/shared";

export type CheckState = "pass" | "fail" | "unavailable";

export interface Check {
  label: string;
  state: CheckState;
  detail: string;
}

const hexToBytes = (hex: string) => {
  const clean = hex.replace(/^0x/, "");
  if (clean.length % 2 || /[^0-9a-fA-F]/.test(clean)) throw new Error("not hex");
  return Uint8Array.from(clean.match(/../g) ?? [], (b) => parseInt(b, 16));
};
const bytesToHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Ethereum personal_sign (EIP-191) recovery, as the docs specify for ecdsa. */
export function recoverEip191Signer(text: string, signatureHex: string): string {
  const body = new TextEncoder().encode(text);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix);
  message.set(body, prefix.length);

  const sig = hexToBytes(signatureHex);
  if (sig.length !== 65) throw new Error(`expected a 65-byte signature, got ${sig.length}`);
  const v = sig[64] >= 27 ? sig[64] - 27 : sig[64];
  const point = secp256k1.Signature.fromBytes(sig.slice(0, 64), "compact")
    .addRecoveryBit(v)
    .recoverPublicKey(keccak_256(message));
  return `0x${bytesToHex(keccak_256(point.toBytes(false).slice(1)).slice(-20))}`;
}

export async function verifyBundle(
  bundle: ReceiptBundle,
  expectedHash: string,
  onChain: boolean | null,
): Promise<Check[]> {
  const checks: Check[] = [];
  const actual = await receiptHash(bundle);
  checks.push({
    label: "Bundle matches its hash",
    state: actual === expectedHash ? "pass" : "fail",
    detail: actual === expectedHash ? "Recomputed in this browser." : `Recomputed ${actual}`,
  });
  checks.push({
    label: "Hash is anchored on-chain",
    state: onChain === null ? "unavailable" : onChain ? "pass" : "fail",
    detail:
      onChain === null
        ? "Could not read the vault."
        : onChain
          ? "Found in the vault's recent activity."
          : "Not in the vault's last 50 entries. It may be older, or this bundle was never submitted.",
  });

  const reqHash = await sha256Hex(bundle.raw_request);
  const resHash = await sha256Hex(bundle.raw_response);
  const { tee } = bundle;
  const bytesMatch = reqHash === tee.request_sha256 && resHash === tee.response_sha256;
  checks.push({
    label: "Stored request and response match their hashes",
    state: bytesMatch ? "pass" : "fail",
    detail: bytesMatch ? "Exact bytes are intact." : "The stored conversation was altered.",
  });

  if (!tee.signature || !tee.text || !tee.signing_address) {
    checks.push({
      label: "TEE signature",
      state: "unavailable",
      detail: tee.unavailable_reason ?? "NEAR AI Cloud returned no signature for this completion.",
    });
  } else {
    const signed = tee.text.includes(reqHash) && tee.text.includes(resHash);
    checks.push({
      label: "Signed text covers this request and response",
      state: signed ? "pass" : "fail",
      detail: signed ? tee.text : `Signed text was: ${tee.text}`,
    });
    if (tee.signing_algo !== "ecdsa") {
      checks.push({
        label: "TEE signature",
        state: "unavailable",
        detail: `This page only checks ecdsa, and the receipt uses ${tee.signing_algo}.`,
      });
    } else {
      try {
        const signer = recoverEip191Signer(tee.text, tee.signature);
        const match = signer.toLowerCase() === tee.signing_address.toLowerCase();
        checks.push({
          label: "Signature recovers to the signing address",
          state: match ? "pass" : "fail",
          detail: match ? `${signer} (${tee.signature_kind ?? "unknown kind"})` : `Recovered ${signer}`,
        });
      } catch (err) {
        checks.push({ label: "Signature recovers to the signing address", state: "fail", detail: String(err) });
      }
    }
  }

  checks.push({
    label: "Attestation quote",
    state: "unavailable",
    detail: tee.attestation_raw
      ? "Attestation attached, not independently verified in-app. Check it with the NEAR AI Cloud verifier."
      : (tee.unavailable_reason ?? "No attestation was captured."),
  });
  return checks;
}
