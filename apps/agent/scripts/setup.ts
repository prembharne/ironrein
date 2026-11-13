// Creates the demo accounts, deploys and configures the vault, and writes env files.
//
//   Testnet: node --experimental-strip-types scripts/setup.ts
//   Sandbox: run scripts/sandbox.sh, then the same command with --sandbox
//
// Secrets go only to gitignored files and are never printed.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { actions, config, createFundedTestnetAccount, queryProtocolVersion, sendTx } from "@fastnear/api";
import { privateKeyFromRandom, publicKeyFromPrivate, signerFromPrivateKey } from "@fastnear/utils";
import { nearToYocto } from "@ironrein/shared";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WASM = join(ROOT, "contracts", "out", "ironrein_vault.wasm");
const sandbox = process.argv.includes("--sandbox");
const RPC = sandbox ? process.env.SANDBOX_RPC ?? "http://localhost:3030" : process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
const GAS = "30000000000000";

interface Acct {
  id: string;
  key: string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!existsSync(WASM)) fail(`No contract at ${WASM}. Run scripts/test-integration.sh first.`);
// A .env holding only NEAR_AI_KEY is fine: it's kept and rewritten with the accounts.
const envPath = join(ROOT, ".env");
if (existsSync(envPath) && readFileSync(envPath, "utf8").includes("VAULT_ACCOUNT_ID=") && !process.argv.includes("--force")) {
  fail("A .env already exists. Pass --force to replace it with a new vault.");
}

config({ networkId: "testnet", nodeUrl: RPC });

const version = await queryProtocolVersion();
console.log(`RPC ${RPC} is on protocol ${version}`);
if (version < 85) fail("ML-DSA needs protocol 85 or later.");

const suffix = randomBytes(3).toString("hex");

function assertOk(result: any, what: string) {
  const r = result?.result ?? result;
  const failure =
    r?.status?.Failure ?? r?.receipts_outcome?.find((o: any) => o.outcome?.status?.Failure)?.outcome.status.Failure;
  if (failure) fail(`${what} failed: ${JSON.stringify(failure)}`);
  return r;
}

/** The local node's root key, read from the container started by scripts/sandbox.sh. */
function sandboxRootKey(): string {
  const raw = execFileSync("docker", ["exec", "ironrein-sandbox", "cat", "/tmp/near/validator_key.json"], {
    encoding: "utf8",
  });
  return JSON.parse(raw).secret_key;
}

async function createAccount(role: string, sandboxBalanceNear: string): Promise<Acct> {
  const key = privateKeyFromRandom();
  const publicKey = publicKeyFromPrivate(key);
  if (sandbox) {
    const rootId = process.env.SANDBOX_ROOT_ID ?? "test.near";
    const rootKey = process.env.SANDBOX_ROOT_KEY ?? sandboxRootKey();
    const id = `${role}-${suffix}.${rootId}`;
    assertOk(
      await sendTx({
        signerId: rootId,
        signer: signerFromPrivateKey(rootKey),
        receiverId: id,
        actions: [
          actions.createAccount(),
          actions.transfer(nearToYocto(sandboxBalanceNear)),
          actions.addFullAccessKey({ publicKey }),
        ],
        waitUntil: "FINAL",
      }),
      `Creating ${id}`,
    );
    return { id, key };
  }
  const id = `ironrein-${role}-${suffix}.testnet`;
  await createFundedTestnetAccount({ newAccountId: id, publicKey });
  return { id, key };
}

const call = (from: Acct, receiverId: string, methodName: string, args: object) =>
  sendTx({
    signerId: from.id,
    signer: signerFromPrivateKey(from.key),
    receiverId,
    actions: [actions.functionCall({ methodName, args: args as Record<string, any>, gas: GAS, deposit: "0" })],
    waitUntil: "FINAL",
  });

console.log("Creating accounts…");
const owner = await createAccount("owner", "20");
const vault = await createAccount("vault", "15");
const merchant = await createAccount("merchant", "1");
const attacker = await createAccount("attacker", "1");

console.log(`Deploying the vault to ${vault.id}…`);
assertOk(
  await sendTx({
    signerId: vault.id,
    signer: signerFromPrivateKey(vault.key),
    receiverId: vault.id,
    actions: [
      actions.deployContract({ codeBase64: readFileSync(WASM).toString("base64") }),
      actions.functionCall({
        methodName: "new",
        args: { owner_id: owner.id },
        gas: GAS,
        deposit: "0",
      }),
    ],
    waitUntil: "FINAL",
  }),
  "Deploying the vault",
);

// Policy and agent key are signed classically here. Once the owner enrolls their
// ML-DSA key in the web app, every later owner action is post-quantum signed.
console.log("Setting the demo policy and the agent key…");
assertOk(
  await call(owner, vault.id, "set_policy", {
    policy: {
      per_tx_cap: nearToYocto("0.5"),
      daily_cap: nearToYocto("2"),
      allowlist: [merchant.id],
      expires_at: "0",
      min_reserve: nearToYocto("0.5"),
    },
  }),
  "set_policy",
);

const agentKey = privateKeyFromRandom();
assertOk(
  await call(owner, vault.id, "rotate_agent_key", {
    public_key: publicKeyFromPrivate(agentKey),
    allowance: nearToYocto("0.25"),
  }),
  "rotate_agent_key",
);

const env = {
  NEAR_NETWORK: "testnet",
  NEAR_RPC_URL: RPC,
  VAULT_ACCOUNT_ID: vault.id,
  OWNER_ACCOUNT_ID: owner.id,
  MERCHANT_ACCOUNT_ID: merchant.id,
  ATTACKER_ACCOUNT_ID: attacker.id,
  AGENT_PRIVATE_KEY: agentKey,
  MERCHANT_URL: "http://localhost:8788/report",
  NEAR_AI_KEY: process.env.NEAR_AI_KEY ?? "",
  NEAR_AI_MODEL: process.env.NEAR_AI_MODEL ?? "z-ai/glm-5.3-flash",
};
writeFileSync(join(ROOT, ".env"), Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");

const web = {
  NEXT_PUBLIC_NEAR_NETWORK: "testnet",
  NEXT_PUBLIC_NEAR_RPC_URL: RPC,
  NEXT_PUBLIC_VAULT_ACCOUNT_ID: vault.id,
  NEXT_PUBLIC_OWNER_ACCOUNT_ID: owner.id,
  NEXT_PUBLIC_AGENT_URL: "http://localhost:8787",
};
writeFileSync(
  join(ROOT, "apps", "web", ".env.local"),
  Object.entries(web).map(([k, v]) => `${k}=${v}`).join("\n") + "\n",
);

const keysDir = join(ROOT, ".ironrein-keys");
mkdirSync(keysDir, { recursive: true });
writeFileSync(
  join(keysDir, `${suffix}.json`),
  JSON.stringify({ owner, vault, merchant, attacker }, null, 2),
);

console.log(`
Done.
  Owner    ${owner.id}
  Vault    ${vault.id}
  Merchant ${merchant.id}
  Attacker ${attacker.id}

Wrote .env and apps/web/.env.local. Classical keys are in .ironrein-keys/${suffix}.json (gitignored).
The vault still has its deployer full-access key, for development. Lock it before calling it locked.`);
