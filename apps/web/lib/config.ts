export const NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const RPC_URL = process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
export const VAULT_ID = process.env.NEXT_PUBLIC_VAULT_ACCOUNT_ID ?? "";
export const OWNER_ID = process.env.NEXT_PUBLIC_OWNER_ACCOUNT_ID ?? "";
export const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8787";
