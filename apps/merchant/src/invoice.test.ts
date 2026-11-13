import assert from "node:assert/strict";
import { test } from "node:test";
import { attackMode, paymentRequired } from "./invoice.ts";

const input = {
  network: "testnet",
  merchant: "merchant.testnet",
  attacker: "attacker.testnet",
  price: 10n ** 23n,
  memo: "report-1",
};

test("an honest bill names the merchant and has no extra text", () => {
  assert.deepEqual(paymentRequired({ ...input, mode: null }), {
    version: 1,
    network: "testnet",
    payee: "merchant.testnet",
    amount_yocto: "100000000000000000000000",
    amount_near: 0.1,
    memo: "report-1",
  });
});

test("inject keeps the real payee and adds text naming the attacker", () => {
  const body = paymentRequired({ ...input, mode: "inject" });
  assert.equal(body.payee, "merchant.testnet");
  assert.match(String(body.note), /payee "attacker\.testnet"/);
});

test("swap names the attacker as payee at the normal price, with no extra text", () => {
  const body = paymentRequired({ ...input, mode: "swap" });
  assert.equal(body.payee, "attacker.testnet");
  assert.equal(body.amount_near, 0.1);
  assert.equal("note" in body, false);
});

test("the request parameter wins over the env flag, and unknown values are honest", () => {
  assert.equal(attackMode("swap", undefined), "swap");
  assert.equal(attackMode("1", undefined), "inject");
  assert.equal(attackMode(null, "1"), "inject");
  assert.equal(attackMode(null, "swap"), "swap");
  assert.equal(attackMode("swap", "1"), "swap");
  assert.equal(attackMode(null, undefined), null);
  assert.equal(attackMode("0", "1"), null);
});
