// Read-only vault access through plain RPC. No keys involved.
import type { Activity, Policy, VaultStatus } from "@warden/shared";
import { RPC_URL, VAULT_ID } from "./config";

async function viewCall<T>(method_name: string, args: object = {}): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "warden",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: VAULT_ID,
        method_name,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.cause?.name ?? body.error.message ?? "RPC error");
  if (body.result?.error) throw new Error(body.result.error);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result)));
}

export const getStatus = () => viewCall<VaultStatus>("get_status");
export const getPolicy = () => viewCall<Policy>("get_policy");
export const getRecent = (limit = 50) => viewCall<Activity[]>("get_recent", { limit });

export function onChainHashes(activity: Activity[]): Set<string> {
  return new Set(activity.flatMap((a) => (a.receipt_hash ? [a.receipt_hash] : [])));
}
