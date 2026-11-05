// HTTP API for the dashboard. Binds to localhost by default, because POST /task
// and POST /redteam can spend from the vault.
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { join } from "node:path";
import { runTask, type AgentDeps, type Step, type TaskInput, type TaskResult } from "./agent.ts";
import { createChain } from "./chain.ts";
import { createLlm } from "./llm.ts";
import { createReceiptStore } from "./receipts.ts";
import { injection, qdayAfter, qdayBefore, stolenKey, type RedTeamRun } from "./redteam.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const MERCHANT_URL = process.env.MERCHANT_URL ?? "http://localhost:8788/report";
const cfg = {
  attacker: required("ATTACKER_ACCOUNT_ID"),
  merchant: required("MERCHANT_ACCOUNT_ID"),
  merchantUrl: MERCHANT_URL,
};

const chain = createChain({
  networkId: process.env.NEAR_NETWORK ?? "testnet",
  rpcUrl: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com",
  vaultId: required("VAULT_ACCOUNT_ID"),
  agentPrivateKey: required("AGENT_PRIVATE_KEY"),
});
const receipts = createReceiptStore(process.env.RECEIPTS_DIR ?? join(process.cwd(), "data", "receipts"));
const deps: AgentDeps | null = process.env.NEAR_AI_KEY
  ? {
      chain,
      receipts,
      llm: createLlm({
        apiKey: process.env.NEAR_AI_KEY,
        model: process.env.NEAR_AI_MODEL ?? "z-ai/glm-5.3-flash",
        baseUrl: process.env.NEAR_AI_BASE_URL,
      }),
    }
  : null;

interface TaskRecord {
  status: "running" | "done" | "failed";
  steps: Step[];
  result?: TaskResult;
  error?: string;
}
const tasks = new Map<string, TaskRecord>();
const runs = new Map<string, RedTeamRun>();

const logger = (steps: Step[]) => (s: Omit<Step, "t">) => {
  steps.push({ t: new Date().toISOString(), ...s });
};

async function readJson(req: IncomingMessage): Promise<any> {
  // Requiring JSON forces a CORS preflight, so other sites can't trigger a spend.
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    throw new HttpError(415, "content-type must be application/json");
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, "body too large");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, "invalid json");
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function startRun(scenario: RedTeamRun["scenario"], work: (run: RedTeamRun) => Promise<void>): string {
  const run: RedTeamRun = { id: randomUUID(), scenario, status: "running", steps: [], verdict: null };
  runs.set(run.id, run);
  work(run).catch((err) => {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : String(err);
  });
  return run.id;
}

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": WEB_ORIGIN,
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    });
    res.end(JSON.stringify(body));
  };

  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const route = `${req.method} /${parts[0] ?? ""}`;

    if (req.method === "OPTIONS") return send(204, {});
    if (route === "GET /health") {
      return send(200, {
        ok: true,
        llm: deps ? deps.llm.model : null,
        vault: chain.vaultId,
        merchant_url: MERCHANT_URL,
        agent_public_key: chain.agentPublicKey,
      });
    }

    if (route === "POST /task") {
      if (!deps) throw new HttpError(503, "NEAR_AI_KEY is not set, so the agent cannot run tasks");
      const body = await readJson(req);
      const input: TaskInput = {
        goal: String(body.goal ?? "Buy the market report and summarize it."),
        merchant_url: MERCHANT_URL, // Fixed server-side: callers can't aim the agent elsewhere.
        max_budget_near: Number(body.max_budget_near ?? 0.5),
      };
      const task_id = randomUUID();
      const record: TaskRecord = { status: "running", steps: [] };
      tasks.set(task_id, record);
      runTask(input, deps, logger(record.steps), task_id)
        .then((result) => {
          record.result = result;
          record.status = "done";
        })
        .catch((err) => {
          record.error = err instanceof Error ? err.message : String(err);
          record.status = "failed";
        });
      return send(202, { task_id });
    }

    if (route === "GET /task") {
      const record = tasks.get(parts[1] ?? "");
      return record ? send(200, record) : send(404, { error: "no such task" });
    }

    if (route === "GET /receipts") {
      const bundle = receipts.load(parts[1] ?? "");
      return bundle ? send(200, bundle) : send(404, { error: "no such receipt" });
    }

    if (route === "POST /redteam" && parts[2] === "continue") {
      // parts[1] is the run id here; only the Q-Day drill pauses for the owner.
      const run = runs.get(parts[1] ?? "");
      if (!run) throw new HttpError(404, "no such run");
      if (run.status !== "awaiting_owner") throw new HttpError(409, "run is not waiting for the owner");
      const { owner_tx_hash } = await readJson(req);
      if (typeof owner_tx_hash !== "string" || !owner_tx_hash) throw new HttpError(400, "owner_tx_hash required");
      run.status = "running";
      qdayAfter(chain, cfg, owner_tx_hash, logger(run.steps))
        .then((verdict) => {
          run.verdict = verdict;
          run.status = "done";
        })
        .catch((err) => {
          run.error = err instanceof Error ? err.message : String(err);
          run.status = "failed";
        });
      return send(202, { run_id: run.id });
    }

    if (route === "POST /redteam") {
      await readJson(req);
      const scenario = parts[1];
      if (scenario === "injection" || scenario === "stolen_key") {
        const run_id = startRun(scenario, async (run) => {
          const log = logger(run.steps);
          run.verdict =
            scenario === "injection" ? await injection(deps, chain, cfg, log) : await stolenKey(chain, cfg, log);
          run.status = "done";
        });
        return send(202, { run_id });
      }
      if (scenario === "qday") {
        const run_id = startRun("qday", async (run) => {
          await qdayBefore(chain, cfg, logger(run.steps));
          run.status = "awaiting_owner";
        });
        return send(202, { run_id });
      }
      throw new HttpError(404, "unknown scenario");
    }

    if (route === "GET /redteam") {
      const run = runs.get(parts[1] ?? "");
      return run ? send(200, run) : send(404, { error: "no such run" });
    }

    return send(404, { error: "not found" });
  } catch (err) {
    if (err instanceof HttpError) return send(err.status, { error: err.message });
    return send(500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`agent on ${HOST}:${PORT}, vault ${chain.vaultId}, llm ${deps ? deps.llm.model : "off"}`);
});
