import { AGENT_URL } from "./config";

export interface Step {
  t: string;
  kind: "llm" | "tool" | "chain";
  summary: string;
  data?: unknown;
}

export interface Verdict {
  passed: boolean;
  summary: string;
  funds_lost_yocto: string;
  max_loss_yocto?: string;
}

export interface Run {
  id: string;
  scenario: string;
  status: "running" | "awaiting_owner" | "done" | "failed";
  steps: Step[];
  verdict: Verdict | null;
  error?: string;
}

export interface Task {
  status: "running" | "done" | "failed";
  steps: Step[];
  result?: { answer: string | null };
  error?: string;
}

async function call<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(`${AGENT_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Agent service returned ${res.status}`);
  return data;
}

export const health = () =>
  call<{ ok: boolean; llm: string | null; agent_public_key: string; merchant_url: string }>("/health");
export const startTask = (goal: string) => call<{ task_id: string }>("/task", { goal });
export const getTask = (id: string) => call<Task>(`/task/${id}`);
export const startRedTeam = (scenario: string) => call<{ run_id: string }>(`/redteam/${scenario}`, {});
export const getRun = (id: string) => call<Run>(`/redteam/${id}`);
export const continueRun = (id: string, owner_tx_hash: string) =>
  call<{ run_id: string }>(`/redteam/${id}/continue`, { owner_tx_hash });
export const getReceipt = (hash: string) => call<any>(`/receipts/${hash}`);
