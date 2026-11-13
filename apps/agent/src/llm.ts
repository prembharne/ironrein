// NEAR AI Cloud client. Uses fetch rather than the OpenAI SDK because signature
// checking needs the exact request and response bytes, which an SDK would hide.
// Flow per docs.near.ai/cloud/verification/cloud-api/response-signatures.
import { randomBytes } from "node:crypto";
import { sha256Hex, type TeeEvidence } from "@ironrein/shared";

export interface Completion {
  rawRequest: string;
  rawResponse: string;
  body: any;
  tee: TeeEvidence;
}

export interface Preflight {
  nonce: string | null;
  raw: string | null;
  error: string | null;
}

export interface Llm {
  model: string;
  preflight(): Promise<Preflight>;
  complete(messages: unknown[], tools: unknown[], preflight: Preflight): Promise<Completion>;
}

const SIGNING_ALGO = "ecdsa";
const SIGNATURE_RETRIES = 3;
const SIGNATURE_RETRY_MS = 1500;
// A completion that hangs would freeze a task or a Red Team run, so give up and ask again.
const COMPLETION_TIMEOUT_MS = Number(process.env.NEAR_AI_TIMEOUT_MS ?? 45_000);
const COMPLETION_ATTEMPTS = 3;

export function createLlm(opts: { apiKey: string; model: string; baseUrl?: string }): Llm {
  const baseUrl = opts.baseUrl ?? "https://cloud-api.near.ai/v1";
  const auth = { Authorization: `Bearer ${opts.apiKey}` };

  async function fetchSignature(id: string): Promise<{ data: any; error: string | null }> {
    let lastError = "no signature returned";
    for (let attempt = 0; attempt < SIGNATURE_RETRIES; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, SIGNATURE_RETRY_MS));
      const res = await fetch(
        `${baseUrl}/signature/${encodeURIComponent(id)}?signing_algo=${SIGNING_ALGO}`,
        { headers: { ...auth, Accept: "application/json" } },
      );
      if (!res.ok) {
        lastError = `signature endpoint returned ${res.status}`;
        continue;
      }
      const data: any = await res.json();
      if (data.error_code || !data.signature) {
        lastError = data.message ?? data.error_code ?? lastError;
        continue;
      }
      return { data, error: null };
    }
    return { data: null, error: lastError };
  }

  return {
    model: opts.model,

    async preflight() {
      const nonce = randomBytes(32).toString("hex");
      const query = new URLSearchParams({
        signing_algo: SIGNING_ALGO,
        nonce,
        model: opts.model,
        provider: "near",
      });
      try {
        const res = await fetch(`${baseUrl}/attestation/report?${query}`, {
          headers: { ...auth, Accept: "application/json", "x-no-aliasing": "true" },
        });
        const raw = await res.text();
        if (!res.ok) return { nonce, raw: null, error: `attestation returned ${res.status}` };
        return { nonce, raw, error: null };
      } catch (err) {
        return { nonce, raw: null, error: String(err) };
      }
    },

    async complete(messages, tools, preflight) {
      const rawRequest = JSON.stringify({
        model: opts.model,
        messages,
        tools,
        tool_choice: "auto",
        stream: false,
      });
      // The same bytes are sent on each attempt, so the receipt's request hash still matches.
      let res: Response | undefined;
      let rawResponse = "";
      for (let attempt = 1; ; attempt++) {
        try {
          res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              ...auth,
              "content-type": "application/json",
              "x-no-aliasing": "true",
              "Accept-Encoding": "identity",
            },
            body: rawRequest,
            signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
          });
          rawResponse = await res.text();
          break;
        } catch (err) {
          if (attempt >= COMPLETION_ATTEMPTS) {
            throw new Error(
              `NEAR AI Cloud did not answer after ${COMPLETION_ATTEMPTS} tries of ${COMPLETION_TIMEOUT_MS / 1000}s (${err instanceof Error ? err.name : err})`,
            );
          }
        }
      }
      if (!res.ok) {
        throw new Error(`NEAR AI Cloud returned ${res.status}: ${rawResponse.slice(0, 300)}`);
      }
      const body = JSON.parse(rawResponse);
      const { data, error } = await fetchSignature(body.id);

      const tee: TeeEvidence = {
        signature_kind: data?.signature_kind ?? body.signature_kind ?? null,
        signing_algo: data?.signing_algo ?? null,
        signing_address: data?.signing_address ?? null,
        text: data?.text ?? null,
        signature: data?.signature ?? null,
        attestation_nonce: preflight.nonce,
        attestation_raw: preflight.raw,
        request_sha256: await sha256Hex(rawRequest),
        response_sha256: await sha256Hex(rawResponse),
        unavailable_reason: error ?? preflight.error,
      };
      return { rawRequest, rawResponse, body, tee };
    },
  };
}
