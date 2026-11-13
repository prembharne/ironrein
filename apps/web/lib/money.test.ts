import assert from "node:assert/strict";
import { test } from "node:test";
import type { Activity } from "@ironrein/shared";
import { moneyRows } from "./money.ts";

const ev = (kind: Activity["kind"], payee?: string, amount?: string): Activity => ({ kind, ts: "1", payee, amount });
const policy = { allowlist: ["merchant.testnet"] };

test("an approved payee is listed even before it has been paid", () => {
  assert.deepEqual(moneyRows([], policy), [
    { account: "merchant.testnet", role: "approved", received: 0n, paidCount: 0, refused: 0n, refusedCount: 0 },
  ]);
});

test("payments add up per account", () => {
  const [m] = moneyRows([ev("spend", "merchant.testnet", "100"), ev("spend", "merchant.testnet", "50")], policy);
  assert.equal(m.received, 150n);
  assert.equal(m.paidCount, 2);
});

test("a refused payee appears as blocked and has received nothing", () => {
  const rows = moneyRows([ev("rejected", "attacker.testnet", "9500"), ev("rejected", "attacker.testnet", "100")], policy);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], {
    account: "attacker.testnet", role: "blocked", received: 0n, paidCount: 0, refused: 9600n, refusedCount: 2,
  });
});

test("a refused payment to an approved payee counts as refused, not received", () => {
  const [m] = moneyRows([ev("rejected", "merchant.testnet", "999")], policy);
  assert.equal(m.role, "approved");
  assert.equal(m.received, 0n);
  assert.equal(m.refusedCount, 1);
});

test("approved payees come first and other events are ignored", () => {
  const rows = moneyRows(
    [ev("rejected", "attacker.testnet", "1"), ev("paused"), ev("withdraw", undefined, "5"), ev("spend", "merchant.testnet", "1")],
    policy,
  );
  assert.deepEqual(rows.map((r) => r.account), ["merchant.testnet", "attacker.testnet"]);
});
