// Runs the real model against the chain in .env: one paid task and the prompt injection,
// then verifies the receipt with the same code the receipt page uses. Uses NEAR AI credits.
//   pnpm --filter agent run live
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, view } from "@fastnear/api";
import { verifyBundle } from "../../web/lib/verifyReceipt.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const AGENT = "http://127.0.0.1:8787";
const env = process.env as Record<string, string>;
assert.ok(env.NEAR_AI_KEY, "NEAR_AI_KEY is not set");
assert.ok(env.VAULT_ACCOUNT_ID, "run bootstrap first");
config({ networkId: "testnet", nodeUrl: env.NEAR_RPC_URL });

const start = (name: string) =>
  spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", "src/server.ts"], {
    cwd: join(ROOT, "apps", name),
    env: process.env,
    stdio: ["ignore", "ignore", "inherit"],
  });

async function waitFor(url: string) {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not come up`);
}

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

async function finish(path: string) {
  for (let i = 0; i < 480; i++) {
    const d: any = await (await fetch(`${AGENT}${path}`)).json();
    if (d.status === "done" || d.status === "failed") return d;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out on ${path}`);
}

const printSteps = (steps: any[]) => {
  for (const s of steps) console.log(`   [${s.kind}] ${String(s.summary).slice(0, 160)}`);
};

const services = [start("merchant"), start("agent")];
let exitCode = 1;
try {
  await waitFor("http://127.0.0.1:8788/health");
  await waitFor(`${AGENT}/health`);

  console.log("1. Paid task with the real model");
  const { task_id } = await post("/task", { goal: "Buy the market report and summarize it." });
  const task = await finish(`/task/${task_id}`);
  printSteps(task.steps);
  assert.equal(task.status, "done", task.error);
  console.log(`   Answer: ${String(task.result.answer).slice(0, 300)}`);
  const payment = task.result.payments.find((p: any) => p.ok);
  assert.ok(payment, "the model should have paid the merchant");

  console.log("\n2. Receipt checks");
  const bundle = await (await fetch(`${AGENT}/receipts/${payment.receipt_hash}`)).json();
  const recent: any[] = await view({
    contractId: env.VAULT_ACCOUNT_ID,
    methodName: "get_recent",
    args: { limit: 50 },
  });
  const anchored = recent.some((a) => a.receipt_hash === payment.receipt_hash);
  const checks = await verifyBundle(bundle, payment.receipt_hash, anchored);
  for (const c of checks) console.log(`   ${c.state.padEnd(11)} ${c.label}: ${c.detail.slice(0, 110)}`);
  assert.ok(checks.every((c) => c.state !== "fail"), "a receipt check failed");
  assert.ok(checks.find((c) => /recovers/.test(c.label))?.state === "pass", "real signature must verify");

  console.log("\n3. Prompt injection with the real model");
  const { run_id } = await post("/redteam/injection");
  const run = await finish(`/redteam/${run_id}`);
  printSteps(run.steps);
  assert.equal(run.status, "done", run.error);
  console.log(`   Verdict: passed=${run.verdict.passed}. ${run.verdict.summary}`);
  assert.equal(run.verdict.passed, true);
  exitCode = 0;
  console.log("\nLive check passed.");
} catch (err) {
  console.error(`\nLIVE CHECK FAILED: ${err instanceof Error ? err.message : err}`);
} finally {
  for (const s of services) s.kill();
}
process.exit(exitCode);
