import assert from "node:assert/strict";
import { test } from "node:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { receiptHash, sha256Hex, type ReceiptBundle } from "@warden/shared";
import { recoverEip191Signer, verifyBundle } from "./verifyReceipt.ts";

// Private key 1 has this well-known Ethereum address.
const SK = new Uint8Array(32);
SK[31] = 1;
const ADDRESS = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";

function sign(text: string): string {
  const body = new TextEncoder().encode(text);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const hash = keccak_256(new Uint8Array([...prefix, ...body]));
  const recovered = secp256k1.sign(hash, SK, { prehash: false, format: "recovered" });
  const v = recovered[0];
  return `0x${Buffer.from(recovered.slice(1)).toString("hex")}${(v + 27).toString(16)}`;
}

async function bundle(over: Partial<ReceiptBundle["tee"]> = {}): Promise<ReceiptBundle> {
  const raw_request = '{"model":"m"}';
  const raw_response = '{"id":"chat-1"}';
  const request_sha256 = await sha256Hex(raw_request);
  const response_sha256 = await sha256Hex(raw_response);
  const text = `m:${request_sha256}:${response_sha256}`;
  return {
    version: 1,
    task_id: "t",
    created_at: "2026-11-05T00:00:00.000Z",
    model: "m",
    raw_request,
    raw_response,
    tee: {
      signature_kind: "provider_tee",
      signing_algo: "ecdsa",
      signing_address: ADDRESS,
      text,
      signature: sign(text),
      attestation_nonce: "n",
      attestation_raw: "{}",
      request_sha256,
      response_sha256,
      unavailable_reason: null,
      ...over,
    },
    spend_intent: { payee: "p", amount: "1", nonce: "1", memo: "m", reason: "r" },
  };
}

const state = (checks: Awaited<ReturnType<typeof verifyBundle>>, label: RegExp) =>
  checks.find((c) => label.test(c.label))?.state;

test("recovers the known address", () => {
  assert.equal(recoverEip191Signer("hello", sign("hello")), ADDRESS);
});

test("a tampered text recovers to a different address", () => {
  assert.notEqual(recoverEip191Signer("hello!", sign("hello")), ADDRESS);
});

test("a good bundle passes every check it can make, and never claims the quote", async () => {
  const b = await bundle();
  const checks = await verifyBundle(b, await receiptHash(b), true);
  for (const c of checks) {
    if (c.label === "Attestation quote") assert.equal(c.state, "unavailable");
    else assert.equal(c.state, "pass", c.label);
  }
});

test("an edited bundle fails against the anchored hash", async () => {
  const b = await bundle();
  const hash = await receiptHash(b);
  b.spend_intent.payee = "attacker";
  assert.equal(state(await verifyBundle(b, hash, true), /matches its hash/), "fail");
});

test("an edited conversation fails even with a recomputed bundle hash", async () => {
  const b = await bundle();
  b.raw_response = '{"id":"forged"}';
  const checks = await verifyBundle(b, await receiptHash(b), true);
  assert.equal(state(checks, /request and response match/), "fail");
});

test("a signature over a different completion fails", async () => {
  const other = "m:aaaa:bbbb";
  const b = await bundle({ text: other, signature: sign(other) });
  const checks = await verifyBundle(b, await receiptHash(b), true);
  assert.equal(state(checks, /covers this request/), "fail");
});

test("a signature from another signer fails", async () => {
  const b = await bundle({ signing_address: "0x0000000000000000000000000000000000000001" });
  const checks = await verifyBundle(b, await receiptHash(b), true);
  assert.equal(state(checks, /recovers to/), "fail");
});

test("a missing signature is shown as unavailable, not as a pass", async () => {
  const b = await bundle({ signature: null, text: null, unavailable_reason: "signature endpoint returned 404" });
  const checks = await verifyBundle(b, await receiptHash(b), true);
  const check = checks.find((c) => c.label === "TEE signature");
  assert.equal(check?.state, "unavailable");
  assert.match(check?.detail ?? "", /404/);
});

test("a hash missing from the chain fails that check", async () => {
  const b = await bundle();
  assert.equal(state(await verifyBundle(b, await receiptHash(b), false), /anchored/), "fail");
});
