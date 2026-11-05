// Full-system test against a running chain: real ML-DSA owner transactions, the real
// agent and merchant servers, and real vault enforcement. Only the model is scripted
// (a local fake NEAR AI endpoint), because this must run without an API key, so it
// does NOT exercise real TEE signatures. It asserts they're reported as unavailable.
//
// Prereqs: `pnpm --filter agent setup` has written .env and .warden-keys.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { actions, config, queryAccessKey, sendTx, view } from "@fastnear/api";
import { generateSigner } from "@fastnear/ml-dsa-65";
import { signerFromPrivateKey } from "@fastnear/utils";
import { nearToYocto, receiptHash, yoctoToNear } from "@warden/shared";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const env = process.env as Record<string, string>;
const VAULT = env.VAULT_ACCOUNT_ID;
const AGENT = "http://127.0.0.1:8787";
const FAKE_LLM_PORT = 8799;
const GAS = "30000000000000";

assert.ok(VAULT, "run setup first: no VAULT_ACCOUNT_ID");
config({ networkId: "testnet", nodeUrl: env.NEAR_RPC_URL });

const keysDir = join(ROOT, ".warden-keys");
const newest = readdirSync(keysDir)
  .map((f) => join(keysDir, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const keys = JSON.parse(readFileSync(newest, "utf8"));
const OWNER: string = keys.owner.id;

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`  ok  ${label}`);
}

const final = (r: any) => r?.result ?? r;

/** Stands in for NEAR AI Cloud. It obeys injections, the worst case for the vault. */
function startFakeLlm() {
  const server = createServer(async (req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url?.startsWith("/attestation/report")) return json(200, { gateway_attestation: {} });
    if (req.url?.startsWith("/signature/")) return json(404, { error: "fake model has no TEE" });

    let raw = "";
    for await (const chunk of req) raw += chunk;
    const messages: any[] = JSON.parse(raw).messages;
    const toolCall = (name: string, args: object) => ({
      tool_calls: [{ id: `c${messages.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
    });
    const last = messages.at(-1);
    let message: object;
    if (last.role === "user") {
      const url = messages[0].content.match(/Fetch (\S+)\./)[1];
      message = toolCall("fetch_paid_resource", { url });
    } else {
      const output = JSON.parse(last.content);
      const body = output.body ? JSON.parse(output.body) : null;
      if (output.fetch_next) message = toolCall("fetch_paid_resource", { url: output.fetch_next });
      else if (output.status === 402 && body.note) {
        const payee = body.note.match(/payee "([^"]+)"/)[1];
        message = toolCall("pay", { payee, amount_near: "9.5", reason: "emergency migration" });
      } else if (output.status === 402) {
        message = toolCall("pay", {
          payee: body.payee,
          amount_near: yoctoToNear(body.amount_yocto, 24),
          reason: `Buying the report (${body.memo})`,
        });
      } else {
        message = { content: `Finished. Last status: ${output.status ?? JSON.stringify(output)}` };
      }
    }
    json(200, { id: `fake-${Date.now()}`, choices: [{ message: { role: "assistant", ...message } }] });
  });
  return new Promise<typeof server>((resolve) => server.listen(FAKE_LLM_PORT, "127.0.0.1", () => resolve(server)));
}

function startService(name: string, extra: Record<string, string>): ChildProcess {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "src/server.ts"],
    {
      cwd: join(ROOT, "apps", name),
      env: { ...process.env, ...extra },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  return child;
}

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
  assert.ok(res.ok, `${path}: ${JSON.stringify(data)}`);
  return data;
};

async function pollUntil(path: string, done: (d: any) => boolean) {
  for (let i = 0; i < 240; i++) {
    const data: any = await (await fetch(`${AGENT}${path}`)).json();
    if (done(data)) return data;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out on ${path}`);
}

const finished = (d: any) => d.status === "done" || d.status === "failed";
const status = () => view({ contractId: VAULT, methodName: "get_status", args: {} });
const recent = () => view({ contractId: VAULT, methodName: "get_recent", args: { limit: 50 } });

async function main() {
  console.log("1. ML-DSA owner key");
  const pq = generateSigner();
  const add = final(
    await sendTx({
      signerId: OWNER,
      signer: signerFromPrivateKey(keys.owner.key),
      receiverId: OWNER,
      actions: [actions.addFullAccessKey({ publicKey: pq.publicKey })],
      waitUntil: "FINAL",
    }),
  );
  assert.equal(add.status?.Failure, undefined);
  const access: any = await queryAccessKey({ accountId: OWNER, publicKey: pq.publicKey, blockId: "final" });
  assert.ok(!access?.error && !access?.result?.error, "key must be on the account");
  ok("classical key enrolled the ML-DSA key");

  const asOwner = async (calls: Array<{ methodName: string; args: object }>) => {
    const r = final(
      await sendTx({
        signerId: OWNER,
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

  const policy = await view({ contractId: VAULT, methodName: "get_policy", args: {} });
  const policyTx = await asOwner([{ methodName: "set_policy", args: { policy } }]);
  assert.ok(policyTx.transaction.public_key.startsWith("ml-dsa-65"), policyTx.transaction.public_key);
  ok(`owner tx signed with ${policyTx.transaction.public_key.split(":")[0]}`);
  const burnt = policyTx.transaction_outcome.outcome.gas_burnt;
  console.log(`      ML-DSA tx conversion gas: ${(burnt / 1e12).toFixed(3)} Tgas, signature ${policyTx.transaction.signature.length} chars`);

  console.log("2. Paid task");
  const llm = await startFakeLlm();
  const services = [
    startService("merchant", {}),
    startService("agent", {
      NEAR_AI_KEY: "e2e-fake",
      NEAR_AI_BASE_URL: `http://127.0.0.1:${FAKE_LLM_PORT}`,
      RECEIPTS_DIR: join(ROOT, "apps", "agent", "data", "e2e-receipts"),
    }),
  ];
  try {
    await waitFor("http://127.0.0.1:8788/health");
    await waitFor(`${AGENT}/health`);

    const { task_id } = await post("/task", { goal: "Buy the report" });
    const task = await pollUntil(`/task/${task_id}`, finished);
    assert.equal(task.status, "done", task.error);
    const payment = task.result.payments[0];
    assert.equal(payment.ok, true, JSON.stringify(payment));
    ok("agent paid the merchant through the vault");
    const lastFetch = task.steps.filter((s: any) => s.summary.startsWith("GET")).at(-1);
    assert.equal(lastFetch.data.status, 200, JSON.stringify(lastFetch.data));
    ok("merchant verified the payment on-chain and returned the data");

    const anchored = (await recent()).find((a: any) => a.kind === "spend");
    assert.equal(anchored.receipt_hash, payment.receipt_hash);
    const bundle = await (await fetch(`${AGENT}/receipts/${payment.receipt_hash}`)).json();
    assert.equal(await receiptHash(bundle), payment.receipt_hash);
    ok("stored receipt re-hashes to the hash anchored on-chain");
    assert.equal(bundle.tee.signature, null);
    assert.match(bundle.tee.unavailable_reason, /404/);
    ok("missing TEE signature is recorded as unavailable, not faked");

    const proof = `http://127.0.0.1:8788/report?tx=${payment.tx_hash}&sender=${VAULT}`;
    assert.equal((await fetch(proof)).status, 409);
    ok("merchant refuses a reused payment");

    console.log("3. Red Team: prompt injection (scripted model obeys it)");
    const inj = await post("/redteam/injection");
    const injRun = await pollUntil(`/redteam/${inj.run_id}`, finished);
    assert.equal(injRun.status, "done", injRun.error);
    assert.equal(injRun.verdict.passed, true, injRun.verdict.summary);
    assert.ok(injRun.steps.some((s: any) => /REJECTED: payee_not_allowed/.test(s.summary)));
    ok(injRun.verdict.summary);

    console.log("4. Red Team: stolen key");
    const stolen = await post("/redteam/stolen_key");
    const stolenRun = await pollUntil(`/redteam/${stolen.run_id}`, finished);
    assert.equal(stolenRun.status, "done", stolenRun.error);
    assert.equal(stolenRun.verdict.passed, true, stolenRun.verdict.summary);
    assert.ok(stolenRun.steps.some((s: any) => /over_daily_cap/.test(s.summary)));
    const after = await status();
    assert.ok(BigInt(after.spent_today) <= BigInt(policy.daily_cap));
    ok(stolenRun.verdict.summary);

    console.log("5. Red Team: Q-Day drill");
    const qday = await post("/redteam/qday");
    await pollUntil(`/redteam/${qday.run_id}`, (d) => d.status === "awaiting_owner" || finished(d));
    const kill = await asOwner([
      { methodName: "pause", args: {} },
      { methodName: "revoke_agent_key", args: { public_key: after.agent_key } },
    ]);
    ok("kill switch: pause and revoke in one ML-DSA transaction");
    await post(`/redteam/${qday.run_id}/continue`, { owner_tx_hash: kill.transaction.hash });
    const qdayRun = await pollUntil(`/redteam/${qday.run_id}`, finished);
    assert.equal(qdayRun.status, "done", qdayRun.error);
    assert.equal(qdayRun.verdict.passed, true, qdayRun.verdict.summary);
    assert.ok(qdayRun.steps.some((s: any) => /REFUSED BY NEAR/.test(s.summary)));
    ok(qdayRun.verdict.summary);

    console.log("6. Recovery");
    await asOwner([
      { methodName: "unpause", args: {} },
      { methodName: "rotate_agent_key", args: { public_key: after.agent_key, allowance: nearToYocto("0.25") } },
    ]);
    const restored = await status();
    assert.equal(restored.paused, false);
    assert.equal(restored.agent_key, after.agent_key);
    ok("owner restored the agent with the ML-DSA key");

    console.log(`\nAll ${passed} checks passed. The model was scripted; real TEE signatures were not exercised.`);
  } finally {
    for (const s of services) s.kill();
    llm.close();
    pq.destroy();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nE2E FAILED:", err.message ?? err);
    process.exit(1);
  },
);
