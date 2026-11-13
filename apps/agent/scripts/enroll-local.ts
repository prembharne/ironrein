// Local testing helper: enrolls an ML-DSA public key on the sandbox owner account,
// using the classical key saved by setup. The key is used, never printed.
//   node --env-file=../../.env --experimental-strip-types scripts/enroll-local.ts <pubkey-file>
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { actions, config, sendTx } from "@fastnear/api";
import { signerFromPrivateKey } from "@fastnear/utils";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rpc = process.env.NEAR_RPC_URL ?? "";
if (!rpc.includes("localhost")) throw new Error("This helper is only for a local sandbox.");

const dir = join(ROOT, ".ironrein-keys");
const newest = readdirSync(dir)
  .map((f) => join(dir, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const { owner } = JSON.parse(readFileSync(newest, "utf8"));
const publicKey = readFileSync(process.argv[2], "utf8").trim();

config({ networkId: "testnet", nodeUrl: rpc });
const result: any = await sendTx({
  signerId: owner.id,
  signer: signerFromPrivateKey(owner.key),
  receiverId: owner.id,
  actions: [actions.addFullAccessKey({ publicKey })],
  waitUntil: "FINAL",
});
const status = (result.result ?? result).status;
console.log(status?.Failure ? `Failed: ${JSON.stringify(status.Failure)}` : `Enrolled on ${owner.id}`);
