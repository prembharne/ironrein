import assert from "node:assert/strict";
import { test } from "node:test";
import { callEnclave, createSealedSpend, sealedConfigFromEnv, OUTLAYER_TESTNET_API, type SealedConfig } from "./sealed.ts";

const cfg: SealedConfig = {
  apiUrl: "http://outlayer.test",
  project: "owner.testnet/ironrein-agent-signer",
  paymentKey: "owner.testnet:1:test-secret",
  secretsProfile: "default",
  secretsAccount: "owner.testnet",
  agentPublicKey: "ed25519:pub",
};
const REQ = { payee: "merchant.testnet", amount: "100", nonce: "5", receipt_hash: "ab".repeat(32), memo: "report" };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; headers: any; body: any }> = [];
  const impl = async (url: any, init?: any) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status });
  };
  return { impl: impl as typeof fetch, calls };
}
const completed = (output: unknown) => ({ call_id: "c1", status: "completed", output, attestation_url: "/attestations/by-call/c1" });

test("sealed mode is off without OUTLAYER_PROJECT and strict once it is set", () => {
  assert.equal(sealedConfigFromEnv({}), null);
  assert.throws(() => sealedConfigFromEnv({ OUTLAYER_PROJECT: "a.testnet/p" }), /OUTLAYER_PAYMENT_KEY must be set/);
  assert.throws(() => sealedConfigFromEnv({ OUTLAYER_PROJECT: "nope" }), /must look like/);
  const full = sealedConfigFromEnv({
    OUTLAYER_PROJECT: "a.testnet/p", OUTLAYER_PAYMENT_KEY: "k", OUTLAYER_SECRETS_ACCOUNT: "a.testnet", AGENT_PUBLIC_KEY: "ed25519:x",
  });
  assert.equal(full?.apiUrl, OUTLAYER_TESTNET_API);
  assert.equal(full?.secretsProfile, "default");
});

test("the enclave is called with the payment key, the input and the secret reference", async () => {
  const { impl, calls } = fakeFetch(200, completed(JSON.stringify({ public_key: "ed25519:pub" })));
  const reply = await callEnclave(cfg, { op: "public_key" }, impl);
  assert.equal(calls[0].url, "http://outlayer.test/call/owner.testnet/ironrein-agent-signer");
  assert.equal(calls[0].headers["X-Payment-Key"], cfg.paymentKey);
  assert.deepEqual(calls[0].body, { input: { op: "public_key" }, secrets_ref: { profile: "default", account_id: "owner.testnet" } });
  assert.deepEqual(reply.output, { public_key: "ed25519:pub" });
  assert.equal(reply.attestation_url, "http://outlayer.test/attestations/by-call/c1");
});

test("the verdict comes from the chain, not from the enclave's reply", async () => {
  const { impl, calls } = fakeFetch(200, completed({ tx_hash: "TX1", ok: true }));
  const readTx = async (hash: string, sender: string) => {
    assert.deepEqual([hash, sender], ["TX1", "vault.testnet"]);
    return { transaction: { hash: "TX1" }, status: { SuccessValue: b64({ ok: false, reason: "payee_not_allowed" }) } };
  };
  const outcome = await createSealedSpend(cfg, "vault.testnet", readTx, impl)(REQ);
  assert.deepEqual(calls[0].body.input, { op: "spend", vault: "vault.testnet", ...REQ });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "payee_not_allowed");
  assert.equal(outcome.submitted, true);
  assert.equal(outcome.tx_hash, "TX1");
  assert.deepEqual(outcome.sealed, { call_id: "c1", attestation_url: "http://outlayer.test/attestations/by-call/c1" });
});

test("a spend NEAR refuses inside the enclave is reported as not submitted", async () => {
  const { impl } = fakeFetch(200, completed({ error: "access key not found" }));
  const outcome = await createSealedSpend(cfg, "vault.testnet", async () => { throw new Error("unused"); }, impl)(REQ);
  assert.equal(outcome.submitted, false);
  assert.equal(outcome.ok, false);
  assert.match(outcome.error ?? "", /access key not found/);
});

test("an OutLayer failure is reported, never treated as a payment", async () => {
  const { impl } = fakeFetch(402, { status: "failed", error: "insufficient balance" });
  const outcome = await createSealedSpend(cfg, "vault.testnet", async () => ({}), impl)(REQ);
  assert.deepEqual(outcome, { ok: false, submitted: false, error: "OutLayer 402: insufficient balance" });
});
