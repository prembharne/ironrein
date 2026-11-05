import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPayment, type ExpectedPayment } from "./verify.ts";

const expected: ExpectedPayment = {
  txHash: "h",
  sender: "vault.testnet",
  vault: "vault.testnet",
  merchant: "merchant.testnet",
  minAmount: 100n,
};

function tx(overrides: { deposit?: string; to?: string; from?: string; failed?: boolean; signer?: string } = {}) {
  const { deposit = "100", to = "merchant.testnet", from = "vault.testnet", failed = false, signer = "vault.testnet" } = overrides;
  return {
    transaction: { signer_id: signer },
    status: { SuccessValue: "e30=" },
    receipts: [
      {
        receipt_id: "r1",
        predecessor_id: from,
        receiver_id: to,
        receipt: { Action: { actions: [{ Transfer: { deposit } }] } },
      },
    ],
    receipts_outcome: [{ id: "r1", outcome: { status: failed ? { Failure: {} } : { SuccessValue: "" } } }],
  };
}

test("accepts a real payment", () => assert.deepEqual(checkPayment(tx(), expected), { ok: true }));
test("accepts an overpayment", () => assert.equal(checkPayment(tx({ deposit: "101" }), expected).ok, true));
test("rejects underpayment", () => assert.equal(checkPayment(tx({ deposit: "99" }), expected).ok, false));
test("rejects payment to someone else", () => assert.equal(checkPayment(tx({ to: "other.testnet" }), expected).ok, false));
test("rejects payment from someone else", () => assert.equal(checkPayment(tx({ from: "other.testnet" }), expected).ok, false));
test("rejects another signer", () => assert.equal(checkPayment(tx({ signer: "other.testnet" }), expected).ok, false));
test("rejects a failed transfer receipt", () => assert.equal(checkPayment(tx({ failed: true }), expected).ok, false));
test("rejects a claimed sender that is not the vault", () =>
  assert.equal(checkPayment(tx(), { ...expected, sender: "other.testnet" }).ok, false));
test("rejects a vault-rejected spend, which has no transfer", () => {
  const rejected = { ...tx(), receipts: [], receipts_outcome: [] };
  assert.equal(checkPayment(rejected, expected).ok, false);
});
test("rejects a failed transaction", () => {
  const failed = { ...tx(), status: { Failure: {} } };
  assert.equal(checkPayment(failed, expected).ok, false);
});
