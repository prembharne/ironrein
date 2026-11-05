// Checks the live NEAR AI Cloud flow the agent depends on: attestation, a tool-calling
// completion, and the signature. Prints field names and public values, never the API key.
//   pnpm --filter agent run probe
import { recoverEip191Signer } from "../../web/lib/verifyReceipt.ts";
import { TOOLS } from "../src/agent.ts";
import { createLlm } from "../src/llm.ts";

const apiKey = process.env.NEAR_AI_KEY;
if (!apiKey) throw new Error("NEAR_AI_KEY is not set");
const model = process.env.NEAR_AI_MODEL ?? "z-ai/glm-5.3-flash";
const llm = createLlm({ apiKey, model });

console.log(`Model: ${model}\n`);

console.log("1. Attestation");
const preflight = await llm.preflight();
if (!preflight.raw) {
  console.log(`   unavailable: ${preflight.error}`);
} else {
  const report = JSON.parse(preflight.raw);
  console.log(`   top-level fields: ${Object.keys(report).join(", ")}`);
  const gateway = report.gateway_attestation;
  console.log(`   gateway fields: ${gateway ? Object.keys(gateway).join(", ") : "none"}`);
  console.log(`   gateway signer: ${gateway?.signing_address} (${gateway?.signing_algo})`);
  console.log(`   nonce echoed: ${gateway?.request_nonce === preflight.nonce}`);
  const models: any[] = report.model_attestations ?? [];
  console.log(`   model attestations: ${models.length}`);
  for (const m of models) {
    console.log(`     signer ${m.signing_address} (${m.signing_algo}), nonce echoed: ${m.request_nonce === preflight.nonce}, nvidia: ${Boolean(m.nvidia_payload)}`);
  }
  console.log(`   report size: ${preflight.raw.length} bytes`);
}

console.log("\n2. Completion with tools");
const { body, tee } = await llm.complete(
  [
    { role: "system", content: "You buy data for your owner." },
    { role: "user", content: "Fetch http://localhost:8788/report" },
  ],
  TOOLS,
  preflight,
);
console.log(`   response fields: ${Object.keys(body).join(", ")}`);
console.log(`   id: ${body.id}`);
const message = body.choices?.[0]?.message;
console.log(`   tool calls: ${JSON.stringify(message?.tool_calls?.map((c: any) => c.function.name) ?? [])}`);

console.log("\n3. Signature");
console.log(`   kind: ${tee.signature_kind}`);
console.log(`   algo: ${tee.signing_algo}`);
console.log(`   signer: ${tee.signing_address}`);
console.log(`   signed text: ${tee.text}`);
console.log(`   unavailable reason: ${tee.unavailable_reason}`);

if (tee.signature && tee.text) {
  console.log(`   text has request hash: ${tee.text.includes(tee.request_sha256)}`);
  console.log(`   text has response hash: ${tee.text.includes(tee.response_sha256)}`);
  const recovered = recoverEip191Signer(tee.text, tee.signature);
  console.log(`   recovered: ${recovered}`);
  console.log(`   recovered matches signer: ${recovered.toLowerCase() === tee.signing_address?.toLowerCase()}`);
  if (preflight.raw) {
    const report = JSON.parse(preflight.raw);
    const known = [report.gateway_attestation, ...(report.model_attestations ?? [])]
      .map((a: any) => a?.signing_address?.toLowerCase());
    console.log(`   signer is in the attestation report: ${known.includes(tee.signing_address?.toLowerCase())}`);
  }
}
