// Asks the enclave signer for the public half of the sealed agent key, so you can put it
// in .env as AGENT_PUBLIC_KEY. Prints the public key only.
//   pnpm --filter agent run sealed-key
import { callEnclave, sealedConfigFromEnv } from "../src/sealed.ts";

// The public key is what this script is fetching, so a placeholder satisfies the config check.
const cfg = sealedConfigFromEnv({ AGENT_PUBLIC_KEY: "unknown-yet", ...process.env });
if (!cfg) throw new Error("OUTLAYER_PROJECT is not set");

const reply = await callEnclave(cfg, { op: "public_key" });
const publicKey = reply.output?.public_key;
if (typeof publicKey !== "string") throw new Error(`enclave did not return a key: ${JSON.stringify(reply.output)}`);
console.log(`AGENT_PUBLIC_KEY=${publicKey}`);
if (reply.attestation_url) console.log(`Attestation for this call: ${reply.attestation_url}`);
