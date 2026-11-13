import assert from "node:assert/strict";
import { test } from "node:test";
import { isMissingKeyError } from "./keyMissing.ts";

test("NEAR's answer for a key that is not on the account counts as missing", () => {
  const real = new Error(
    '{"code":null,"name":"contract_error","message":"access key ed25519:6ScV does not exist while viewing","data":{}}',
  );
  assert.equal(isMissingKeyError(real), true);
  assert.equal(isMissingKeyError({ cause: { name: "UNKNOWN_ACCESS_KEY" } }), true);
  assert.equal(isMissingKeyError("access key ml-dsa-65-hash:abc does not exist while viewing"), true);
});

test("a network or server failure does not count as missing", () => {
  assert.equal(isMissingKeyError(new Error("Failed to fetch")), false);
  assert.equal(isMissingKeyError(new Error("rpc request failed with 400 Bad Request")), false);
  assert.equal(isMissingKeyError(undefined), false);
});
