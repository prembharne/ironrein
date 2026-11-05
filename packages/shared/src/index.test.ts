import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalJson, nearToYocto, sha256Hex, yoctoToNear } from "./index.ts";

test("nearToYocto converts without float error", () => {
  assert.equal(nearToYocto("0.5"), "500000000000000000000000");
  assert.equal(nearToYocto(2), "2000000000000000000000000");
  assert.equal(nearToYocto("0.000000000000000000000001"), "1");
  assert.throws(() => nearToYocto("-1"));
  assert.throws(() => nearToYocto("1e3"));
  assert.throws(() => nearToYocto("0.0000000000000000000000001"));
});

test("yoctoToNear formats and trims", () => {
  assert.equal(yoctoToNear("500000000000000000000000"), "0.5");
  assert.equal(yoctoToNear("2000000000000000000000000"), "2");
  assert.equal(yoctoToNear("1"), "0");
  assert.equal(yoctoToNear("1", 24), "0.000000000000000000000001");
});

test("canonicalJson sorts keys at every depth and ignores insertion order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [true, null], c: "x" } }), '{"a":{"c":"x","d":[true,null]},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
  assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
});

test("canonicalJson refuses numbers it cannot encode identically", () => {
  assert.throws(() => canonicalJson({ a: 1.5 }));
  assert.throws(() => canonicalJson({ a: Number.NaN }));
});

test("sha256Hex matches the known vector", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
