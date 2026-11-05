import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptSeed, encryptSeed, parseKeyfile } from "./keystore.ts";

const meta = { account_id: "owner.testnet", public_key: "ml-dsa-65:abc" };
const seed = new Uint8Array(32).fill(7);
const PASS = "correct horse battery";

test("seed round-trips and the record holds no plaintext", async () => {
  const record = await encryptSeed(seed, PASS, meta);
  assert.deepEqual(await decryptSeed(record, PASS), seed);
  assert.ok(!JSON.stringify(record).includes(Buffer.from(seed).toString("base64")));
});

test("wrong passphrase fails", async () => {
  const record = await encryptSeed(seed, PASS, meta);
  await assert.rejects(decryptSeed(record, "not the right one"), /Wrong passphrase/);
});

test("relabeling a keyfile to another account fails", async () => {
  const record = await encryptSeed(seed, PASS, meta);
  await assert.rejects(decryptSeed({ ...record, account_id: "evil.testnet" }, PASS), /altered/);
});

test("short passphrases are refused", async () => {
  await assert.rejects(encryptSeed(seed, "short", meta), /at least 10/);
});

test("each encryption uses a fresh salt and iv", async () => {
  const a = await encryptSeed(seed, PASS, meta);
  const b = await encryptSeed(seed, PASS, meta);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
});

test("parseKeyfile accepts its own output and refuses other JSON", async () => {
  const record = await encryptSeed(seed, PASS, meta);
  assert.deepEqual(parseKeyfile(JSON.stringify(record)), record);
  assert.throws(() => parseKeyfile('{"version":1}'), /not a Warden keyfile/);
});
