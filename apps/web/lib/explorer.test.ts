import assert from "node:assert/strict";
import { test } from "node:test";
import type { Activity } from "@leash/shared";
import { matchTxs, type VaultTx } from "./explorer.ts";

// Real data from warden-vault-1d4de2.testnet on 2026-11-05 (events from get_recent, txs from NearBlocks).
const tx = (hash: string, ts: string, methods: string[], status = true): VaultTx => ({
  transaction_hash: hash,
  block_timestamp: ts,
  signer_account_id: "x",
  actions: methods.map((method) => ({ action: "FUNCTION_CALL", method })),
  outcomes: { status },
});
const TXS = [
  tx("UNPAUSE", "1793897161044782985", ["unpause", "rotate_agent_key"]),
  tx("KILL", "1793897151289620828", ["pause", "revoke_agent_key"]),
  tx("REJ2", "1793897147108972573", ["agent_spend"]),
  tx("REJ1", "1793897128700848772", ["agent_spend"]),
  tx("PAY2", "1793897112279008365", ["agent_spend"]),
  tx("PAY1", "1793897085870751317", ["agent_spend"]),
  tx("ROT", "1793896923176809524", ["rotate_agent_key"]),
  tx("POL", "1793896919034971507", ["set_policy"]),
];
const ev = (kind: Activity["kind"], ts: string): Activity => ({ kind, ts });
const EVENTS = [
  ev("agent_key_rotated", "1793897161584000000"),
  ev("unpaused", "1793897161584000000"),
  ev("agent_key_revoked", "1793897151918000000"),
  ev("paused", "1793897151918000000"),
  ev("rejected", "1793897147108972573"),
  ev("rejected", "1793897128700848772"),
  ev("spend", "1793897112279008365"),
  ev("spend", "1793897085870751317"),
  ev("agent_key_rotated", "1793896923808000000"),
  ev("policy_set", "1793896919537000000"),
];

test("every real event pairs with the transaction that produced it", () => {
  assert.deepEqual(matchTxs(EVENTS, TXS), ["UNPAUSE", "UNPAUSE", "KILL", "KILL", "REJ2", "REJ1", "PAY2", "PAY1", "ROT", "POL"]);
});

test("an event never pairs with a transaction that came after it", () => {
  assert.deepEqual(matchTxs([ev("spend", "1793897085000000000")], TXS), [null]);
});

test("a failed transaction is never used", () => {
  assert.deepEqual(matchTxs([ev("policy_set", "1793896919537000000")], [tx("BAD", "1793896919034971507", ["set_policy"], false)]), [null]);
});

test("each call in a transaction pairs with at most one event", () => {
  const two = [ev("spend", "1793897085870751317"), ev("spend", "1793897085870751317")];
  assert.deepEqual(matchTxs(two, [tx("ONE", "1793897085870751317", ["agent_spend"])]), ["ONE", null]);
});

test("an event too long after any matching transaction stays unpaired", () => {
  assert.deepEqual(matchTxs([ev("policy_set", "1793900000000000000")], TXS), [null]);
});
