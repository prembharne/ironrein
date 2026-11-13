import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { receiptHash, type VaultStatus } from "@ironrein/shared";
import { readSettlement, runTask, type Step } from "./agent.ts";
import { parseSpendResult, type Chain, type SpendRequest } from "./chain.ts";
import type { Completion, Llm } from "./llm.ts";
import { createReceiptStore } from "./receipts.ts";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

function fakeChain(ok: (r: SpendRequest) => boolean): Chain & { sent: SpendRequest[] } {
  const sent: SpendRequest[] = [];
  return {
    sent,
    vaultId: "vault.test",
    agentPublicKey: "ed25519:x",
    status: async () => ({ last_nonce: "4" }) as VaultStatus,
    policy: async () => { throw new Error("unused"); },
    recent: async () => [],
    balance: async () => 0n,
    tx: async () => ({}),
    spend: async (r) => {
      sent.push(r);
      return ok(r)
        ? { ok: true, submitted: true, tx_hash: "TXHASH" }
        : { ok: false, submitted: true, reason: "payee_not_allowed", tx_hash: "TXBAD" };
    },
  };
}

/** Replays a script of model turns, each a list of tool calls or a final message. */
function scriptedLlm(turns: Array<Array<{ name: string; args: object }> | string>) {
  let turn = 0;
  const seen: any[][] = [];
  const llm: Llm = {
    model: "test-model",
    preflight: async () => ({ nonce: "n", raw: "{}", error: null }),
    complete: async (messages): Promise<Completion> => {
      seen.push(structuredClone(messages as any[]));
      const step = turns[turn++];
      const message =
        typeof step === "string"
          ? { role: "assistant", content: step }
          : {
              role: "assistant",
              content: null,
              tool_calls: step.map((c, i) => ({
                id: `c${turn}-${i}`,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            };
      const body = { choices: [{ message }] };
      return {
        rawRequest: JSON.stringify(messages),
        rawResponse: JSON.stringify(body),
        body,
        tee: {
          signature_kind: "provider_tee", signing_algo: "ecdsa", signing_address: "0xabc",
          text: "m:r:s", signature: "0xsig", attestation_nonce: "n", attestation_raw: "{}",
          request_sha256: "r", response_sha256: "s", unavailable_reason: null,
        },
      };
    },
  };
  return { llm, seen };
}

const receipts = () => createReceiptStore(mkdtempSync(join(tmpdir(), "ironrein-")));
const INPUT = { goal: "buy", merchant_url: "http://127.0.0.1:1/report", max_budget_near: 1 };
const noLog = (_: Omit<Step, "t">) => {};

test("pay anchors the hash of a stored bundle, using the next nonce", async () => {
  const store = receipts();
  const chain = fakeChain(() => true);
  const { llm } = scriptedLlm([
    [{ name: "pay", args: { payee: "merchant.test", amount_near: "0.1", reason: "report" } }],
    "done",
  ]);
  const result = await runTask(INPUT, { llm, chain, receipts: store }, noLog, "task-1");

  assert.equal(result.answer, "done");
  assert.equal(chain.sent[0].nonce, "5");
  assert.equal(chain.sent[0].amount, "100000000000000000000000");
  const bundle = store.load(chain.sent[0].receipt_hash);
  assert.ok(bundle);
  assert.equal(await receiptHash(bundle), chain.sent[0].receipt_hash);
  assert.equal(bundle.tee.signature, "0xsig");
  assert.equal(bundle.spend_intent.payee, "merchant.test");
});

test("a rejected payment is reported back to the model with its reason", async () => {
  const chain = fakeChain(() => false);
  const { llm, seen } = scriptedLlm([
    [{ name: "pay", args: { payee: "attacker.test", amount_near: "9.5", reason: "x" } }],
    "gave up",
  ]);
  const result = await runTask(INPUT, { llm, chain, receipts: receipts() }, noLog);
  assert.equal(result.payments[0].ok, false);
  const toolMessage = seen[1].at(-1);
  assert.deepEqual(JSON.parse(toolMessage.content), { ok: false, reason: "payee_not_allowed" });
});

test("a successful payment tells the model where to fetch the data", async () => {
  const chain = fakeChain(() => true);
  const { llm, seen } = scriptedLlm([
    [{ name: "pay", args: { payee: "m.test", amount_near: "0.1", reason: "x" } }],
    "ok",
  ]);
  await runTask(INPUT, { llm, chain, receipts: receipts() }, noLog);
  const next = JSON.parse(seen[1].at(-1).content).fetch_next;
  assert.equal(next, "http://127.0.0.1:1/report?tx=TXHASH&sender=vault.test");
});

test("the agent won't fetch hosts other than the merchant", async () => {
  const { llm, seen } = scriptedLlm([
    [{ name: "fetch_paid_resource", args: { url: "http://169.254.169.254/latest/meta-data" } }],
    "ok",
  ]);
  await runTask(INPUT, { llm, chain: fakeChain(() => true), receipts: receipts() }, noLog);
  assert.match(JSON.parse(seen[1].at(-1).content).error, /refused/);
});

test("an invalid amount becomes a tool error and sends nothing", async () => {
  const chain = fakeChain(() => true);
  const { llm, seen } = scriptedLlm([
    [{ name: "pay", args: { payee: "m.test", amount_near: "all of it", reason: "x" } }],
    "ok",
  ]);
  await runTask(INPUT, { llm, chain, receipts: receipts() }, noLog);
  assert.equal(chain.sent.length, 0);
  assert.match(JSON.parse(seen[1].at(-1).content).error, /invalid NEAR amount/);
});

test("the task stops if the model never finishes", async () => {
  const { llm } = scriptedLlm(Array(20).fill([{ name: "nope", args: {} }]));
  await assert.rejects(
    runTask(INPUT, { llm, chain: fakeChain(() => true), receipts: receipts() }, noLog),
    /without finishing/,
  );
});

test("parseSpendResult reads ok, rejected and failed transactions", () => {
  const tx = { hash: "H" };
  assert.deepEqual(parseSpendResult({ transaction: tx, status: { SuccessValue: b64({ ok: true }) } }), {
    ok: true, reason: undefined, submitted: true, tx_hash: "H",
  });
  const rejected = parseSpendResult({ transaction: tx, status: { SuccessValue: b64({ ok: false, reason: "paused" }) } });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "paused");
  const failed = parseSpendResult({ transaction: tx, status: { Failure: { x: 1 } } });
  assert.equal(failed.ok, false);
  assert.match(failed.error ?? "", /"x":1/);
});

test("receipt store refuses path traversal", () => {
  assert.equal(receipts().load("../../secrets"), null);
});

const SETTLEMENT = {
  mode: "quote", provider: "NEAR Intents 1Click", amount_in: "0.1", asset_in: "NEAR",
  amount_out: "0.354409", min_amount_out: "350864", asset_out: "USDC", chain_out: "base",
  asset_out_id: "nep141:base-usdc", recipient: "0xabc", time_estimate_s: 24,
  quoted_at: "2026-11-11T09:12:47.065Z", quote_signature: null, correlation_id: null,
};

test("a merchant's settlement quote is read from its reply", () => {
  assert.deepEqual(readSettlement(JSON.stringify({ report: {}, settlement: SETTLEMENT })), SETTLEMENT);
});

test("a missing, failed or malformed settlement is ignored", () => {
  assert.equal(readSettlement("not json"), undefined);
  assert.equal(readSettlement(JSON.stringify({ report: {} })), undefined);
  assert.equal(readSettlement(JSON.stringify({ settlement: { error: "1Click 400" } })), undefined);
  assert.equal(readSettlement(JSON.stringify({ settlement: { ...SETTLEMENT, amount_out: 5 } })), undefined);
  assert.equal(readSettlement(JSON.stringify({ settlement: { ...SETTLEMENT, mode: "live" } })), undefined);
});
