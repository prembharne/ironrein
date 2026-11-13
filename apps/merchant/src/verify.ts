// Checks that a NEAR transaction really paid the merchant from the vault.

export interface ExpectedPayment {
  txHash: string;
  sender: string;
  vault: string;
  merchant: string;
  minAmount: bigint;
}

/** Decides from a final `tx` RPC result. Pure, so it can be tested without a node. */
export function checkPayment(result: any, e: ExpectedPayment): { ok: boolean; reason?: string } {
  if (e.sender !== e.vault) return { ok: false, reason: "sender is not the vault" };
  if (result?.transaction?.signer_id !== e.vault) {
    return { ok: false, reason: "transaction was not signed by the vault" };
  }
  if (result?.status?.SuccessValue === undefined) {
    return { ok: false, reason: "transaction did not succeed" };
  }
  // A SuccessValue on the tx does not prove the transfer: the contract returns
  // {ok:false} for a rejected spend, and a transfer receipt can fail separately.
  for (const r of result.receipts_outcome ?? []) {
    if (r?.outcome?.status?.Failure) return { ok: false, reason: "a receipt failed" };
  }

  const succeeded = new Set(
    (result.receipts_outcome ?? [])
      .filter((r: any) => r?.outcome?.status?.Failure === undefined)
      .map((r: any) => r.id),
  );
  const paid = (result.receipts ?? []).some((receipt: any) => {
    if (receipt.predecessor_id !== e.vault || receipt.receiver_id !== e.merchant) return false;
    if (!succeeded.has(receipt.receipt_id)) return false;
    const actions = receipt.receipt?.Action?.actions ?? [];
    return actions.some(
      (a: any) => a?.Transfer?.deposit !== undefined && BigInt(a.Transfer.deposit) >= e.minAmount,
    );
  });
  return paid ? { ok: true } : { ok: false, reason: "no matching transfer to the merchant" };
}

export async function fetchTx(rpcUrl: string, txHash: string, sender: string): Promise<any> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "leash",
      method: "EXPERIMENTAL_tx_status",
      params: { tx_hash: txHash, sender_account_id: sender, wait_until: "FINAL" },
    }),
  });
  const body: any = await res.json();
  if (body.error) throw new Error(body.error.cause?.name ?? body.error.message ?? "rpc error");
  return body.result;
}
