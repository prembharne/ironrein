// Encrypted at-rest storage for the owner's ML-DSA seed. The passphrase derives an
// AES-GCM key with PBKDF2; plaintext only ever lives in memory.
// Hackathon-grade custody: browser JS can't guarantee memory erasure or constant time.

export interface KeyRecord {
  version: 1;
  account_id: string;
  public_key: string;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const ITERATIONS = 600_000;
const MIN_PASSPHRASE = 10;
const DB_NAME = "warden";
const STORE = "owner-keys";
const PRIMARY = "primary";

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSeed(
  seed: Uint8Array,
  passphrase: string,
  meta: { account_id: string; public_key: string },
): Promise<KeyRecord> {
  if (passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  // Binding the metadata means a keyfile can't be relabeled to another account.
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(meta) },
    key,
    seed as BufferSource,
  );
  return {
    version: 1,
    ...meta,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(new Uint8Array(ciphertext)),
  };
}

function additionalData(meta: { account_id: string; public_key: string }) {
  return new TextEncoder().encode(`warden-key-v1|${meta.account_id}|${meta.public_key}`);
}

export async function decryptSeed(record: KeyRecord, passphrase: string): Promise<Uint8Array> {
  const key = await deriveKey(passphrase, fromB64(record.salt), record.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromB64(record.iv) as BufferSource,
        additionalData: additionalData(record),
      },
      key,
      fromB64(record.ciphertext) as BufferSource,
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error("Wrong passphrase, or the keyfile was altered.");
  }
}

export function parseKeyfile(text: string): KeyRecord {
  const r = JSON.parse(text);
  const fields = ["account_id", "public_key", "salt", "iv", "ciphertext"];
  if (r?.version !== 1 || r.kdf !== "PBKDF2-SHA256" || !Number.isSafeInteger(r.iterations)) {
    throw new Error("This is not a Warden keyfile.");
  }
  if (fields.some((f) => typeof r[f] !== "string")) throw new Error("This keyfile is incomplete.");
  return r as KeyRecord;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const saveRecord = (record: KeyRecord) => withStore("readwrite", (s) => s.put(record, PRIMARY));
export const loadRecord = () => withStore<KeyRecord | undefined>("readonly", (s) => s.get(PRIMARY));

export function downloadKeyfile(record: KeyRecord, label: string) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `warden-${label}-${record.account_id}.keyfile`;
  a.click();
  URL.revokeObjectURL(url);
}
