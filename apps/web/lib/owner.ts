// Everything the owner signs. All vault changes go through sendAsOwner with the
// ML-DSA-65 signer. The classical key is used only to enroll the first ML-DSA key.
import { actions, config, queryAccessKey, queryProtocolVersion, sendTx } from "@fastnear/api";
import { generateSigner, signerFromSeed } from "@fastnear/ml-dsa-65";
import { signerFromPrivateKey } from "@fastnear/utils";
import type { Policy } from "@leash/shared";
import { NETWORK, RPC_URL, VAULT_ID } from "./config";
import { isMissingKeyError } from "./keyMissing";
import { encryptSeed, type KeyRecord } from "./keystore";

export type OwnerSigner = ReturnType<typeof generateSigner>;

const GAS = "30000000000000";
const MIN_PROTOCOL = 85;
/** Budget for the agent key's gas, 0.25 NEAR. Refresh by rotating. */
export const AGENT_ALLOWANCE = "250000000000000000000000";

let configured = false;
function ensureConfig() {
  if (!configured) {
    config({ networkId: NETWORK, nodeUrl: RPC_URL });
    configured = true;
  }
}

async function assertMlDsaActive() {
  ensureConfig();
  const version = await queryProtocolVersion();
  if (version < MIN_PROTOCOL) {
    throw new Error(`This RPC is on protocol ${version}. ML-DSA needs ${MIN_PROTOCOL} or later.`);
  }
}

export function unlockFromSeed(seed: Uint8Array): OwnerSigner {
  return signerFromSeed(seed);
}

/** Creates a key and encrypts it. Nothing is enrolled on-chain yet. */
export async function createKey(accountId: string, passphrase: string) {
  const signer = generateSigner();
  const seed = signer.exportSeed();
  if (!seed) throw new Error("This signer has no exportable seed.");
  try {
    const record = await encryptSeed(seed, passphrase, {
      account_id: accountId,
      public_key: signer.publicKey,
    });
    return { signer, record };
  } finally {
    seed.fill(0);
  }
}

export async function isEnrolled(accountId: string, publicKey: string): Promise<boolean> {
  ensureConfig();
  try {
    const res: any = await queryAccessKey({ accountId, publicKey, blockId: "final" });
    return !(res?.error || res?.result?.error);
  } catch (err) {
    // The library throws when the key is not on the account yet. That means "no", not a failed check.
    if (isMissingKeyError(err)) return false;
    throw err;
  }
}

/** An ML-DSA key can't add itself: a classical full-access key signs this AddKey. */
export async function enrollWithClassicalKey(accountId: string, publicKey: string, classicalKey: string) {
  await assertMlDsaActive();
  const signer = signerFromPrivateKey(classicalKey);
  await sendTx({
    signerId: accountId,
    signer,
    receiverId: accountId,
    actions: [actions.addFullAccessKey({ publicKey })],
    waitUntil: "FINAL",
  });
  if (!(await isEnrolled(accountId, publicKey))) {
    throw new Error("AddKey finished, but the key isn't on the account yet. Check again shortly.");
  }
}

/** A second ML-DSA key, in an encrypted file. Keep it before removing any other key. */
export async function addBackupKey(
  accountId: string,
  primary: OwnerSigner,
  passphrase: string,
): Promise<KeyRecord> {
  await assertMlDsaActive();
  const backup = generateSigner();
  const seed = backup.exportSeed();
  if (!seed) throw new Error("This signer has no exportable seed.");
  try {
    const record = await encryptSeed(seed, passphrase, {
      account_id: accountId,
      public_key: backup.publicKey,
    });
    await sendTx({
      signerId: accountId,
      signer: primary,
      receiverId: accountId,
      actions: [actions.addFullAccessKey({ publicKey: backup.publicKey })],
      waitUntil: "FINAL",
    });
    return record;
  } finally {
    seed.fill(0);
    backup.destroy();
  }
}

export interface OwnerTx {
  hash: string;
  raw: unknown;
}

function failureOf(result: any): string | null {
  const status = result?.status ?? result?.final_execution_status;
  if (status?.Failure) return JSON.stringify(status.Failure);
  for (const o of result?.receipts_outcome ?? []) {
    if (o?.outcome?.status?.Failure) return JSON.stringify(o.outcome.status.Failure);
  }
  return null;
}

async function sendAsOwner(
  accountId: string,
  signer: OwnerSigner,
  calls: Array<{ method: string; args?: object; deposit?: string }>,
): Promise<OwnerTx> {
  await assertMlDsaActive();
  const res: any = await sendTx({
    signerId: accountId,
    signer,
    receiverId: VAULT_ID,
    actions: calls.map((c) =>
      actions.functionCall({
        methodName: c.method,
        args: c.args ?? {},
        gas: GAS,
        deposit: c.deposit ?? "0",
      }),
    ),
    waitUntil: "FINAL",
  });
  const result = res?.result ?? res;
  const failure = failureOf(result);
  if (failure) throw new Error(`The vault refused this: ${failure}`);
  return { hash: result?.transaction?.hash, raw: result };
}

type Ctx = { accountId: string; signer: OwnerSigner };

export const setPolicy = ({ accountId, signer }: Ctx, policy: Policy) =>
  sendAsOwner(accountId, signer, [{ method: "set_policy", args: { policy } }]);

export const deposit = ({ accountId, signer }: Ctx, yocto: string) =>
  sendAsOwner(accountId, signer, [{ method: "deposit", deposit: yocto }]);

export const withdraw = ({ accountId, signer }: Ctx, amount: string) =>
  sendAsOwner(accountId, signer, [{ method: "withdraw", args: { amount, to: accountId } }]);

export const rotateAgentKey = ({ accountId, signer }: Ctx, publicKey: string) =>
  sendAsOwner(accountId, signer, [
    { method: "rotate_agent_key", args: { public_key: publicKey, allowance: AGENT_ALLOWANCE } },
  ]);

/** Kill switch: pauses and, when a key is present, revokes it in a single transaction. */
export const killSwitch = ({ accountId, signer }: Ctx, agentKey: string | null) =>
  sendAsOwner(accountId, signer, [
    { method: "pause" },
    ...(agentKey ? [{ method: "revoke_agent_key", args: { public_key: agentKey } }] : []),
  ]);

/** Undoes the kill switch and issues the agent a working key again. */
export const recover = ({ accountId, signer }: Ctx, agentKey: string) =>
  sendAsOwner(accountId, signer, [
    { method: "unpause" },
    { method: "rotate_agent_key", args: { public_key: agentKey, allowance: AGENT_ALLOWANCE } },
  ]);
