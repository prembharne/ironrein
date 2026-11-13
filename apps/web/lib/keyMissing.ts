/**
 * True when NEAR is saying "that access key isn't on the account", as opposed to the
 * request failing. The api library throws in both cases, so the message is all we have.
 * Seen on testnet: {"name":"contract_error","message":"access key ed25519:... does not exist while viewing"}.
 */
export function isMissingKeyError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err ?? "");
  return /access key .*does not exist|UNKNOWN_ACCESS_KEY/i.test(text);
}
