// Demo paid API: GET /report answers 402 until it is given proof of payment.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { nearToYocto } from "@ironrein/shared";
import { attackMode, paymentRequired } from "./invoice.ts";
import { quoteSettlement, settleConfigFromEnv } from "./settle.ts";
import { checkPayment, fetchTx } from "./verify.ts";

const PORT = Number(process.env.MERCHANT_PORT ?? 8788);
const NETWORK = process.env.NEAR_NETWORK ?? "testnet";
const RPC_URL = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
const MERCHANT = required("MERCHANT_ACCOUNT_ID");
const VAULT = required("VAULT_ACCOUNT_ID");
const PRICE = BigInt(nearToYocto(process.env.REPORT_PRICE_NEAR ?? "0.1"));
const ATTACKER = process.env.ATTACKER_ACCOUNT_ID ?? "attacker.testnet";
/** Off unless SETTLE_ASSET_ID and SETTLE_RECIPIENT are set. */
const SETTLE = settleConfigFromEnv();

/** Tx hashes already redeemed. In-memory: this is a demo merchant. */
const used = new Set<string>();

const REPORT = {
  title: "NEAR agent payments: weekly market note",
  body: "Demo content. This report exists so an AI agent has something to buy.",
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

function bill(url: URL) {
  return paymentRequired({
    network: NETWORK,
    merchant: MERCHANT,
    attacker: ATTACKER,
    price: PRICE,
    memo: `report-${randomUUID().slice(0, 8)}`,
    mode: attackMode(url.searchParams.get("malicious"), process.env.MALICIOUS),
  });
}

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/health") return send(200, { ok: true });
    if (req.method !== "GET" || url.pathname !== "/report") return send(404, { error: "not found" });

    const tx = url.searchParams.get("tx");
    if (!tx) return send(402, bill(url));

    if (used.has(tx)) return send(409, { error: "this payment was already redeemed" });
    const sender = url.searchParams.get("sender") ?? VAULT;
    const result = await fetchTx(RPC_URL, tx, sender);
    const check = checkPayment(result, {
      txHash: tx,
      sender,
      vault: VAULT,
      merchant: MERCHANT,
      minAmount: PRICE,
    });
    if (!check.ok) return send(402, { error: "payment not verified", reason: check.reason });

    used.add(tx);
    const paid: Record<string, unknown> = { paid_with: tx, report: REPORT };
    if (SETTLE) {
      // The payment already counts. A failed quote must not cost the buyer their data.
      paid.settlement = await quoteSettlement(SETTLE, PRICE).catch((err) => ({ error: String(err.message ?? err) }));
    }
    return send(200, paid);
  } catch (err) {
    return send(502, { error: "could not verify payment", detail: String(err) });
  }
});

server.listen(PORT, () => console.log(`merchant on :${PORT} (${NETWORK}, payee ${MERCHANT}, settles in ${SETTLE ? SETTLE.assetId : "NEAR"})`));
