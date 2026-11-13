// Cross-chain settlement through NEAR Intents (1Click API). The agent pays the merchant's
// allowlisted NEAR account, exactly as before. The merchant then converts what it received
// into the asset it wants, on the chain it wants. The agent never sees a deposit address,
// so hostile text can't redirect the cross-chain leg.
//
// Field names checked against https://1click.chaindefuser.com/docs/v0/openapi.yaml on
// 2026-11-11, and against a live dry quote.
//
// Quote mode only: every request sets `dry: true`, so 1Click returns live market pricing
// and no deposit address, and no funds move. NEAR Intents runs on mainnet and the demo
// vault is on testnet. A real swap means sending mainnet funds to the quote's
// depositAddress, which this code does not do.
import type { Settlement } from "@leash/shared";

export const ONE_CLICK_URL = "https://1click.chaindefuser.com";
/** NEAR as 1Click lists it (wNEAR on NEAR). */
export const NEAR_ASSET_ID = "nep141:wrap.near";
/** Refund address for dry quotes. Never used: a dry quote has no deposit to refund. */
const DRY_REFUND_TO = "example.near";

export interface SettleConfig {
  /** 1Click assetId the merchant wants, e.g. USDC on Base. */
  assetId: string;
  /** Merchant's address on the destination chain. */
  recipient: string;
  apiUrl?: string;
  slippageBps?: number;
}

/** Reads SETTLE_ASSET_ID and SETTLE_RECIPIENT. Returns null when settlement is off. */
export function settleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SettleConfig | null {
  const assetId = env.SETTLE_ASSET_ID;
  const recipient = env.SETTLE_RECIPIENT;
  if (!assetId || !recipient) return null;
  return { assetId, recipient, apiUrl: env.ONE_CLICK_URL };
}

interface Token {
  assetId: string;
  symbol: string;
  blockchain: string;
}

type Fetch = typeof fetch;

async function json(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`1Click ${res.status}: ${body.message ?? "request failed"}`);
  return body;
}

/** Asks 1Click what `amountYocto` of NEAR becomes in the merchant's asset right now. */
export async function quoteSettlement(
  cfg: SettleConfig,
  amountYocto: bigint,
  fetchImpl: Fetch = fetch,
): Promise<Settlement> {
  const api = cfg.apiUrl ?? ONE_CLICK_URL;
  const tokens: Token[] = await json(await fetchImpl(`${api}/v0/tokens`));
  const token = tokens.find((t) => t.assetId === cfg.assetId);
  if (!token) throw new Error(`1Click does not list asset ${cfg.assetId}`);

  const body = await json(
    await fetchImpl(`${api}/v0/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dry: true,
        swapType: "EXACT_INPUT",
        slippageTolerance: cfg.slippageBps ?? 100,
        originAsset: NEAR_ASSET_ID,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: cfg.assetId,
        amount: amountYocto.toString(),
        refundTo: DRY_REFUND_TO,
        refundType: "ORIGIN_CHAIN",
        recipient: cfg.recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    }),
  );
  const q = body.quote;
  if (!q?.amountOutFormatted || !q?.amountInFormatted) throw new Error("1Click quote is missing amounts");
  return {
    mode: "quote",
    provider: "NEAR Intents 1Click",
    amount_in: String(q.amountInFormatted),
    asset_in: "NEAR",
    amount_out: String(q.amountOutFormatted),
    min_amount_out: String(q.minAmountOut ?? ""),
    asset_out: token.symbol,
    chain_out: token.blockchain,
    asset_out_id: token.assetId,
    recipient: cfg.recipient,
    time_estimate_s: typeof q.timeEstimate === "number" ? q.timeEstimate : null,
    quoted_at: String(body.timestamp ?? new Date().toISOString()),
    quote_signature: typeof body.signature === "string" ? body.signature : null,
    correlation_id: typeof body.correlationId === "string" ? body.correlationId : null,
  };
}
