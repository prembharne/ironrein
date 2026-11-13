// Runs the Q-Day drill on the chain in .env with a real ML-DSA owner key, then restores
// the agent. It moves no funds. It leaves one extra ML-DSA key on the owner account whose
// secret is destroyed here, so nobody can ever sign with it.
//   pnpm --filter agent run qday-live
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { actions, config, queryProtocolVersion, sendTx, view } from "@fastnear/api";
import { generateSigner } from "@fastnear/ml-dsa-65";
import { signerFromPrivateKey } from "@fastnear/utils";
import { nearToYocto } from "@leash/shared";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const AGENT = "http://127.0.0.1:8787";
const VAULT = process.env.VAULT_ACCOUNT_ID as string;
const GAS = "30000000000000";
assert.ok(VAULT, "run bootstrap first");
config({ networkId: "testnet", nodeUrl: process.env.NEAR_RPC_URL });

const keysDir = join(ROOT, ".leash-keys");
const newest = readdirSync(keysDir)
  .map((f) => join(keysDir, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const { owner } = JSON.parse(readFileSync(newest, "utf8"));
assert.equal(owner.id, process.env.OWNER_ACCOUNT_ID, "saved keys don't match .env");

const final = (r: any) => r?.result ?? r;
const status = () => view({ contractId: VAULT, methodName: "get_status", args: {} });

console.log(`Protocol ${await queryProtocolVersion()}`);
const pq = generateSigner();

const add = final(
  await sendTx({
    signerId: owner.id,
    signer: signerFromPrivateKey(owner.key),
    receiverId: owner.id,
    actions: [actions.addFullAccessKey({ publicKey: pq.publicKey })],
    waitUntil: "FINAL",
  }),
);
assert.equal(add.status?.Failure, undefined, JSON.stringify(add.status));
console.log(`Enrolled ML-DSA key with a classical AddKey: ${add.transaction.hash}`);

const asOwner = async (calls: Array<{ methodName: string; args: object }>) => {
  const r = final(
    await sendTx({
      signerId: owner.id,
      signer: pq,
      receiverId: VAULT,
      actions: calls.map((c) =>
        actions.functionCall({ methodName: c.methodName, args: c.args as Record<string, any>, gas: GAS, deposit: "0" }),
      ),
      waitUntil: "FINAL",
    }),
  );
  assert.equal(r.status?.Failure, undefined, JSON.stringify(r.status));
  for (const o of r.receipts_outcome) assert.equal(o.outcome.status.Failure, undefined, JSON.stringify(o.outcome.status));
  return r;
};

const service = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", "src/server.ts"], {
  cwd: join(ROOT, "apps", "agent"),
  env: process.env,
  stdio: ["ignore", "ignore", "inherit"],
});

const post = async (path: string, body: object = {}) => {
  const res = await fetch(`${AGENT}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  assert.ok(res.ok, JSON.stringify(data));
  return data;
};

const until = async (path: string, done: (d: any) => boolean) => {
  for (let i = 0; i < 240; i++) {
    const d: any = await (await fetch(`${AGENT}${path}`)).json();
    if (done(d)) return d;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out on ${path}`);
};

let exitCode = 1;
let agentKey: string | null = null;
let killed = false;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${AGENT}/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  agentKey = (await status()).agent_key;
  assert.ok(agentKey, "the vault has no agent key");

  const { run_id } = await post("/redteam/qday");
  await until(`/redteam/${run_id}`, (d) => d.status !== "running");

  const kill = await asOwner([
    { methodName: "pause", args: {} },
    { methodName: "revoke_agent_key", args: { public_key: agentKey } },
  ]);
  killed = true;
  console.log(`Kill switch tx: ${kill.transaction.hash}`);
  console.log(`Signed with: ${kill.transaction.public_key.split(":")[0]}`);
  console.log(`Gas burnt converting the tx: ${(kill.transaction_outcome.outcome.gas_burnt / 1e12).toFixed(3)} Tgas`);

  await post(`/redteam/${run_id}/continue`, { owner_tx_hash: kill.transaction.hash });
  const run = await until(`/redteam/${run_id}`, (d) => d.status === "done" || d.status === "failed");
  for (const s of run.steps) console.log(`   [${s.kind}] ${String(s.summary).slice(0, 150)}`);
  assert.equal(run.status, "done", run.error);
  console.log(`Verdict: passed=${run.verdict.passed}. ${run.verdict.summary}`);
  assert.equal(run.verdict.passed, true);
  exitCode = 0;
} catch (err) {
  console.error(`\nQ-DAY FAILED: ${err instanceof Error ? err.message : err}`);
} finally {
  service.kill();
  if (killed && agentKey) {
    // Always try to restore, or the vault stays paused for later testing.
    const restored = await asOwner([
      { methodName: "unpause", args: {} },
      { methodName: "rotate_agent_key", args: { public_key: agentKey, allowance: nearToYocto("0.25") } },
    ]);
    const after = await status();
    console.log(`Restored agent: ${restored.transaction.hash}, paused=${after.paused}, key set=${Boolean(after.agent_key)}`);
  }
  pq.destroy();
}
process.exit(exitCode);
