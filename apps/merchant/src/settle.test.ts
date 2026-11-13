import assert from "node:assert/strict";
import { test } from "node:test";
import { quoteSettlement, settleConfigFromEnv, NEAR_ASSET_ID } from "./settle.ts";

const USDC_BASE = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const cfg = { assetId: USDC_BASE, recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", apiUrl: "http://1click.test" };

// Shapes copied from real 1Click responses on 2026-11-11.
const TOKENS = [
  { assetId: NEAR_ASSET_ID, decimals: 24, blockchain: "near", symbol: "wNEAR" },
  { assetId: USDC_BASE, decimals: 6, blockchain: "base", symbol: "USDC" },
];
const QUOTE = {
  quote: {
    amountIn: "100000000000000000000000",
    amountInFormatted: "0.1",
    amountOut: "354409",
    amountOutFormatted: "0.354409",
    minAmountOut: "350864",
    timeEstimate: 24,
  },
  signature: "ed25519:sig",
  timestamp: "2026-11-11T09:12:47.065Z",
  correlationId: "c195e3cb",
};

function fakeFetch(quote: { status: number; body: unknown } = { status: 201, body: QUOTE }) {
  const calls: Array<{ url: string; body?: any }> = [];
  const impl = async (url: any, init?: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    const reply = String(url).endsWith("/v0/tokens") ? { status: 200, body: TOKENS } : quote;
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
  return { impl: impl as typeof fetch, calls };
}

test("settlement is off unless both the asset and the recipient are set", () => {
  assert.equal(settleConfigFromEnv({}), null);
  assert.equal(settleConfigFromEnv({ SETTLE_ASSET_ID: USDC_BASE }), null);
  assert.deepEqual(settleConfigFromEnv({ SETTLE_ASSET_ID: USDC_BASE, SETTLE_RECIPIENT: "0xabc" }), {
    assetId: USDC_BASE,
    recipient: "0xabc",
    apiUrl: undefined,
  });
});

test("a quote reports what the merchant would receive, on which chain", async () => {
  const { impl, calls } = fakeFetch();
  const s = await quoteSettlement(cfg, 10n ** 23n, impl);
  assert.equal(s.mode, "quote");
  assert.equal(s.amount_in, "0.1");
  assert.equal(s.amount_out, "0.354409");
  assert.equal(s.asset_out, "USDC");
  assert.equal(s.chain_out, "base");
  assert.equal(s.recipient, cfg.recipient);
  assert.equal(s.time_estimate_s, 24);
  assert.equal(s.quote_signature, "ed25519:sig");
  assert.equal(calls.length, 2);
});

test("the request is always a dry run from NEAR to the merchant's own address", async () => {
  const { impl, calls } = fakeFetch();
  await quoteSettlement(cfg, 10n ** 23n, impl);
  const body = calls[1].body;
  assert.equal(body.dry, true);
  assert.equal(body.originAsset, NEAR_ASSET_ID);
  assert.equal(body.destinationAsset, USDC_BASE);
  assert.equal(body.amount, "100000000000000000000000");
  assert.equal(body.recipient, cfg.recipient);
  assert.equal(body.recipientType, "DESTINATION_CHAIN");
  assert.equal(body.swapType, "EXACT_INPUT");
});

test("an asset 1Click doesn't list is refused before asking for a quote", async () => {
  const { impl, calls } = fakeFetch();
  await assert.rejects(quoteSettlement({ ...cfg, assetId: "nep141:nope" }, 1n, impl), /does not list/);
  assert.equal(calls.length, 1);
});

test("a 1Click error carries its message", async () => {
  const { impl } = fakeFetch({ status: 400, body: { message: "recipient is not valid" } });
  await assert.rejects(quoteSettlement(cfg, 1n, impl), /1Click 400: recipient is not valid/);
});
