# PROJECT_SPEC.md: Warden (complete project documentation)

> **Purpose of this file:** the single source of truth for the Warden project. An AI assistant (or a human) should be able to continue the work from this file alone, without guessing.
> **Companion file:** `AGENTS.md` holds the working rules for the coding agent. If they conflict, this file wins; note the conflict in `PROGRESS.md`.
> **Last researched:** 2026-11-05. Facts about NEAR, NEAR AI Cloud and the hackathon change; re-check anything marked VERIFY before relying on it.

---

## 0. How an AI must use this document (anti-hallucination protocol)

1. **Facts have three confidence levels.** `[CONFIRMED]` = found in a cited source on 2026-11-05. `[DESIGN]` = a decision we made; it is ours to change. `[VERIFY]` = unknown; **check the docs or run an experiment before using it**.
2. **Never invent** package names, function signatures, RPC fields, API parameters, version numbers or response shapes. If a detail is not in this file or in docs you have read this session, mark it `// VERIFY` and look it up.
3. When something turns out different from this file, **update this file** (section 15, "Verified findings log") and tell the human.
4. Prefer the smallest thing that works. Scope is fixed by section 3. Do not add features.
5. Keep `PROGRESS.md` current after each work session (template in section 17).
6. Ask the human before: deleting any account key, spending real (mainnet) funds, or changing scope.

---

## 1. Project summary

**Name:** Warden (working name).
**What:** A quantum-safe "leash" for AI agent money on NEAR. A smart-contract vault holds funds; an AI agent can spend only through a policy-checked method; every spend stores a hash of the AI's TEE-signed reasoning; the human owner controls everything with a post-quantum (ML-DSA-65) key through a browser console.
**Why it exists:** AI agents will pay for services autonomously. Today the choices are "give the agent your key" (unsafe) or "approve every payment" (impractical). Warden bounds the damage from prompt injection, key theft and future quantum attacks, and makes every payment auditable.
**Pitch line:** Even if the AI is tricked or its key is stolen, your money can't be drained, and every payment carries hardware-signed proof of why the AI made it.
**Closing line for the demo:** "NEAR shipped quantum-safe keys. We built the leash."

### The two differentiators (never cut these)
1. **Red Team Mode**: one-click live attacks (prompt injection, stolen agent key, Q-Day drill) that visibly fail on-chain.
2. **Black-box recorder**: each spend carries `receipt_hash`, the SHA-256 of a bundle containing the TEE-signed inference; the bundle can be re-verified later.

---

## 2. Hackathon context `[CONFIRMED]` unless noted

| Item | Value | Source |
|---|---|---|
| Name | NEAR HACKATHON ("Build Beyond Boundaries") | nearhackathon.com |
| Dates | Nov 1 2026 00:00 UTC to Nov 14 2026 23:59 UTC | NEAR on X; Lookonchain |
| Judging | Nov 16 to 18; results by Nov 19 | Lookonchain |
| Prize pool | $250,000, fixed in USD, paid in NEAR | nearhackathon.com; X posts |
| Prize structure | 1 grand prize $55K; per track (13 tracks): 1st $10K, 2nd $3K, 3rd $2K | nearhackathon.com |
| Submission | Public code repo + public demo post on X; no signup | NEAR on X |
| Teams | Individuals or teams | Lookonchain |
| Tracks known (8 of 13) | Unstoppable DeFi, Investment Thesis, Privacy & Private AI, Autonomous Business, AI Swarms, **AI Security & Defense**, Agent Economy, Real-World Money | NEAR on X |
| Our target track | **AI Security & Defense** ("make AI-controlled money safer with spending limits, wallet safeguards, reputation systems and scam detection"); secondary: Agent Economy, Privacy & Private AI | |
| Official docs | `nearhackathon.com` and `HACKATHON.md` | `[VERIFY]` read both: exact rules, judging criteria, the other 5 tracks, any "start work after kickoff" rule |

Note: the official page could not be fetched directly during research; details came from search snippets of that page and news coverage.

---

## 3. Scope

### In scope (MVP, must ship)
- Vault smart contract with policy enforcement (section 8).
- Agent service using NEAR AI Cloud inference with receipt capture (section 9).
- Demo merchant returning HTTP 402 (section 10).
- Web app: owner console + post-quantum key handling + activity feed + Red Team + kill switch (section 11).
- Red Team Mode with 3 scenarios (section 12).
- README, architecture doc, threat model, demo video, X post.

### Stretch (pick exactly ONE, only after MVP is complete)
- A: cross-chain payout through NEAR Intents 1Click API.
- B: "guardian" second LLM that reviews spends above a threshold.

### Out of scope (do not build, do not mention as shipped)
- Hyperledger / custom blockchains (roadmap slide only).
- zkAPI integration (roadmap slide only: "private prepaid credits"). Reason: Ethereum-only, experimental, uses Groth16/BN254 which is not quantum-safe.
- Claiming to "replace seed phrases". PQ keys still need a backed-up secret.
- Mobile app, browser extension (roadmap only).
- Multi-agent swarms, token launches, DeFi features.
- On-chain verification of TEE attestations (we anchor a hash on-chain and verify off-chain).

---

## 4. Users and user stories

**Owner (human):** wants an agent to buy things for them within limits.
- O1. I create a post-quantum key in my browser and register it on my NEAR account.
- O2. I create and fund a vault and set limits: per-transaction cap, daily cap, allowed payees, expiry.
- O3. I see every payment and every rejected attempt in a live feed, with the AI's receipt.
- O4. I verify a receipt to see why the agent paid.
- O5. I hit a kill switch (pause, revoke agent key) signed with my PQ key.
- O6. I withdraw funds.

**Agent (software):** completes a task by paying for a resource.
- A1. Fetch a resource; if it answers 402, decide whether to pay.
- A2. Pay only through `agent_spend`; attach nonce and receipt hash.

**Judge/viewer:** wants to understand and trust the project in under 2 minutes.
- J1. Watch Red Team Mode defeat three attacks.
- J2. See the owner kill switch signed with a post-quantum key.

---

## 5. Verified facts about the platform

### 5.1 NEAR post-quantum signing `[CONFIRMED]`
- NEAR upgrade 2.13 activated ML-DSA (FIPS 204, "Dilithium") on mainnet on **July 20, 2026**. Accounts rotate keys with ordinary transactions; no asset migration.
- ML-DSA-65 is an account access-key and transaction-signing type starting at **protocol version 85**.
- Before using it, check the RPC's active `protocol_version` and require **>= 85**. Do not use node software version or `latest_protocol_version` as the signal.
- Each ML-DSA-65 signature verification costs **100 Ggas**; transactions are larger and costlier than classical ones.
- Scope: account access keys and transaction signatures only. Validator and staking keys remain Ed25519.
- Sizes: public key **1,952 bytes**, signature **3,309 bytes**.
- Key string forms: full `ml-dsa-65:<base58>` (use for AddKey, lookup, signing, DeleteKey); compact on-chain handle `ml-dsa-65-hash:<base58>` (appears in access-key list responses).
- **An ML-DSA-65 key cannot add itself.** Enroll it with an `AddKey` signed by an existing classical full-access key.
- Package: `@fastnear/ml-dsa-65` (Node.js 20.19+ or modern browser). Documented quickstart: check protocol version, `generateSigner()`, enroll via `actions.addFullAccessKey({ publicKey })`, verify with `queryAccessKey()` at `blockId: "final"`, send with `sendTx({ signerId, signer, ... })`.
- The reference crypto backend (`@noble/post-quantum`) does **not** claim constant-time execution. Browser key custody is therefore "hackathon-grade".
- Documented only for **full-access** ML-DSA keys. Function-call ML-DSA keys: `[VERIFY]`, not required by our design.
- Wallet support for ML-DSA: not documented; assume wallet-selector wallets cannot sign with it. Ledger is reported to be working on it.
- Source: `js.fastnear.com/post-quantum`; NEAR 2.13 press release (PR Newswire, July 20 2026); `docs.near.org/protocol/access-keys`.

### 5.2 NEAR access keys `[CONFIRMED]`
- Two kinds: **Full-Access** (total control) and **Function-Call** (restricted).
- Function-Call key attributes: `receiver_id` (one contract), optional `method_names` (omit = all methods), optional `allowance` (NEAR budget for gas; omitted/`null` = unlimited).
- Function-Call keys **cannot attach NEAR tokens** to calls and cannot transfer.
- Allowance of an existing key **cannot be changed**; add a new key to get a new allowance. The allowance is charged at the buy price and refunded later, so a key needs more allowance than the final cost.
- In an `AddKey` *action*, allowance `0` means a zero budget (every tx fails with `NotEnoughAllowance`). When a **contract** adds a key via the add-key-with-function-call host function, allowance `0` means **unlimited**. **We always pass a nonzero allowance.**
- An account with only function-call keys cannot manage its own keys or transfer NEAR unless its deployed contract provides such methods (and the contract was deployed before the account was locked).
- Source: `docs.near.org/protocol/accounts-contracts/access-keys`.

### 5.3 NEAR AI Cloud `[CONFIRMED]` unless noted
- OpenAI-compatible API, base URL `https://cloud-api.near.ai/v1`. Models list: `GET https://cloud-api.near.ai/v1/model/list`. API key from the cloud.near.ai dashboard.
- Inference for TEE models runs in Intel TDX confidential VMs with NVIDIA confidential GPUs. The TEE produces attestation reports and signs both the request and the inference result. Two modes: gateway (via `cloud-api.near.ai`, itself in a TEE) and direct completions to the model's TEE.
- Intel Trust Authority provides independent attestation tokens for verified workloads (Aug 2026 announcement).
- `[VERIFY]` exact endpoints and field names for fetching the signature/attestation of a given completion. Read `https://docs.near.ai/cloud/private-inference` and the API reference. Record findings in section 15.
- `[VERIFY]` model ids that run inside TEEs (check list output for a TEE flag), free credits or pricing.

### 5.4 NEAR Intents 1Click API `[CONFIRMED]` (stretch A only)
- Hosted REST API, flow: `GET /v0/tokens` -> `POST /v0/quote` (dry, then real) -> send deposit to returned deposit address -> optional `POST /v0/deposit/submit` -> `GET /v0/status`.
- Base host in docs: `https://1click.chaindefuser.com`. Dry quotes are free, keyless and commitment-free; real quotes show a Bearer JWT in docs `[VERIFY]` whether a partner API key is required.
- Docs: `https://docs.near-intents.org`.

### 5.5 Other ecosystem pieces (informational, not used in MVP)
- IronClaw: open-source agent runtime that deploys agents in encrypted enclaves on NEAR AI Cloud.
- Shade Agents: TEE-based agents tied to NEAR contracts, using chain signatures for key management.
- x402: HTTP 402 payment pattern. NEAR Intents already supports funding x402 payments across chains. We use a simplified 402 pattern settled on NEAR for the MVP.

### 5.6 Precedent (for pitch context) `[CONFIRMED]`
Agent spend-limit projects exist (e.g., Bound at ETHGlobal Cannes 2026; a first-place wallet in Sui Overflow 2026). PQ agent wallets exist on Ethereum (Aegis; Post Quantum Agent; EthVaultPQ finalist). We found none combining PQ owner control + policy vault + TEE-attested reasoning receipts + live attack demo on NEAR. This is "not found", not "does not exist": never claim "first".

---

## 6. Architecture

```
 Owner (browser)                 Agent service (Node)            Merchant (Node)
 ┌───────────────────┐           ┌────────────────────┐         ┌──────────────┐
 │ Web app + wallet  │           │ LLM: NEAR AI Cloud │  HTTP   │ GET /report  │
 │ ML-DSA-65 key     │           │ tools: fetch, pay  │<───────>│ 402 -> data  │
 └────────┬──────────┘           └─────────┬──────────┘         └──────▲───────┘
          │ owner txs                      │ agent_spend                │ verifies tx
          │ (PQ-signed)                    │ (function-call key)        │ via NEAR RPC
          ▼                                ▼                            │
        ┌──────────────────────────────────────────────────┐            │
        │ Vault contract (Rust) on vault account            │────────────┘
        │ holds NEAR; enforces policy; keeps activity log   │  transfer(payee, amount)
        └──────────────────────────────────────────────────┘
```

### Trust boundaries
- **Vault contract**: the enforcement point. Treat the agent and everything it reads as untrusted.
- **Agent service**: untrusted for policy purposes; trusted only to try to do the task.
- **TEE (NEAR AI Cloud)**: trusted for inference confidentiality/integrity per vendor attestation; verification is off-chain.
- **Browser**: holds the owner PQ key (encrypted at rest). Hackathon-grade.

### Accounts
| Account | Purpose | Keys |
|---|---|---|
| `OWNER_ACCOUNT_ID` | the human's account | ML-DSA-65 full-access key (primary) + ML-DSA backup key; classical key only for initial enrollment |
| `VAULT_ACCOUNT_ID` | holds contract + funds | agent function-call key (restricted); deployer full-access key during development; **optionally locked at the end** |
| `MERCHANT_ACCOUNT_ID` | demo payee | any |
| `ATTACKER_ACCOUNT_ID` | Red Team target, NOT in allowlist | any |

`[DESIGN]` Agent calls are **self-calls**: signed by a function-call key on the vault account whose `receiver_id` is the vault account and `method_names = ["agent_spend"]`. In the contract, `predecessor_account_id == current_account_id` identifies the agent path; owner methods require `predecessor_account_id == owner_id`.
`[DESIGN]` Locking the vault account (deleting its full-access keys) is done last, after everything works; the contract provides `rotate_agent_key` / `revoke_agent_key` so key management survives the lock.

---

## 7. Data and type conventions

- Amounts: **yoctoNEAR as decimal strings** in JSON (`"500000000000000000000000"` = 0.5 NEAR). In Rust use `U128`. In TypeScript use `bigint` internally and string on the wire. 1 NEAR = 10^24 yoctoNEAR.
- Nonces: `U64` in Rust JSON (string on the wire), `bigint`/string in TS.
- Timestamps: nanoseconds since epoch (NEAR `block_timestamp`) on-chain; ISO-8601 in off-chain JSON.
- `receipt_hash`: **64-character lowercase hex string** (SHA-256 digest). Contract validates length, hex charset, non-zero.
- Account IDs and public keys: strings, as NEAR defines them.

### Shared TypeScript types (`packages/shared`)
```ts
export type YoctoString = string;
export interface Policy {
  per_tx_cap: YoctoString;
  daily_cap: YoctoString;
  allowlist: string[];          // account ids
  expires_at: string;           // ns timestamp as string; "0" = never
  min_reserve: YoctoString;
}
export type ActivityKind =
  | "spend" | "rejected" | "policy_set" | "paused" | "unpaused"
  | "agent_key_rotated" | "agent_key_revoked" | "withdraw";
export interface Activity {
  kind: ActivityKind;
  ts: string;                   // ns timestamp
  payee?: string;
  amount?: YoctoString;
  nonce?: string;
  receipt_hash?: string;
  memo?: string;
  reason?: string;              // for "rejected"
}
export interface SpendResult { ok: boolean; reason?: string }
export interface VaultStatus {
  owner_id: string; paused: boolean; balance: YoctoString;
  spent_today: YoctoString; day_index: string; last_nonce: string;
  accepted_count: string; rejected_count: string;
}
```

---

## 8. Vault contract (`contracts/vault`)

Language: Rust with `near-sdk` `[VERIFY]` pin the version that matches current docs; build/deploy with `cargo-near` `[VERIFY]`; tests with `near-workspaces` `[VERIFY]`.

### 8.1 State
```
owner_id: AccountId
policy: Policy
paused: bool
spent_today: u128
day_index: u64            // block_timestamp / 86_400_000_000_000
last_nonce: u64
accepted_count: u64
rejected_count: u64
activity: Vec<Activity>   // ring buffer, last 50; newest returned first
```

### 8.2 Methods
| Method | Caller | Notes |
|---|---|---|
| `new(owner_id)` | init once | Default policy denies everything (caps 0, empty allowlist). |
| `deposit()` | anyone, payable | Accept funds. |
| `set_policy(policy)` | owner | Validate `daily_cap >= per_tx_cap`; log `policy_set`. |
| `pause()`, `unpause()` | owner | Kill switch. |
| `rotate_agent_key(public_key, allowance)` | owner | Delete previous agent key(s) if present, add function-call key: `receiver_id = current_account_id`, `method_names = ["agent_spend"]`, `allowance` nonzero. Reject allowance of 0. |
| `revoke_agent_key(public_key)` | owner | Delete key from own account. |
| `withdraw(amount, to)` | owner | Respect storage/gas reserve. |
| `agent_spend(payee, amount, nonce, receipt_hash, memo)` | self only | See 8.3. Returns `SpendResult`. |
| `get_policy()`, `get_status()`, `get_recent(limit)` | view | `get_recent` returns newest first, `limit <= 50`. |

### 8.3 `agent_spend` algorithm (policy violations return, they do not panic)
```
assert predecessor == current_account_id        // only this is a panic
roll day bucket: if now/86.4e12 != day_index { day_index = now/86.4e12; spent_today = 0 }
reject("paused")            if paused
reject("expired")           if expires_at != 0 and now > expires_at
reject("payee_not_allowed") if payee not in allowlist
reject("over_per_tx_cap")   if amount > per_tx_cap
reject("over_daily_cap")    if spent_today + amount > daily_cap
reject("bad_nonce")         if nonce <= last_nonce
reject("bad_receipt_hash")  if hash not 64 lowercase hex or all zeros
reject("below_reserve")     if balance - amount < min_reserve
ok: last_nonce = nonce; spent_today += amount; accepted_count += 1;
    push Activity{spend}; Promise::transfer(payee, amount); return {ok:true}
reject(reason): rejected_count += 1; push Activity{rejected, reason}; return {ok:false, reason}
```
Rejection reasons are a fixed enum of the strings above (the UI depends on them).
`[DESIGN]` Rejections return normally so the attempt is recorded on-chain and the UI can show the reason. Consequence: spam via a stolen agent key burns vault-account gas; bounded by the agent key's finite allowance (default 0.25 NEAR `[DESIGN]`, tune after measuring real gas cost).

### 8.4 Events
Also emit NEP-297-style JSON logs for each Activity kind. The authoritative UI data source is `get_recent`.

### 8.5 Contract tests (write first)
1. Owner-only methods reject non-owners.
2. Each rejection reason triggers exactly when intended; boundary values (amount == cap passes, cap+1 fails).
3. Day rollover resets `spent_today`.
4. Nonce replay and lower nonce rejected.
5. Pause blocks spend; unpause restores.
6. Success path transfers funds and increments counters.
7. Function-call key can call `agent_spend` but no other method and cannot attach deposit.
8. `revoke_agent_key` stops the key from working.
9. `rotate_agent_key` with allowance 0 is rejected.
10. Activity buffer caps at 50.

---

## 9. Agent service (`apps/agent`)

Node 20+, TypeScript. Uses the OpenAI SDK pointed at NEAR AI Cloud `[VERIFY]` SDK usage matches the provider's quickstart.

### 9.1 Behavior
1. Receive a task: `{ goal, merchant_url, max_budget_near }`.
2. Run a tool-calling loop with exactly two tools:
   - `fetch_paid_resource(url)`: HTTP GET; returns status and body. A 402 returns the payment requirements.
   - `pay(payee, amount_near, reason)`: increments nonce, builds the receipt bundle, hashes it, calls `vault.agent_spend` with the agent function-call key, waits for finality `[VERIFY]` RPC wait mode, returns `{ ok, reason?, tx_hash }`.
3. After payment, retry the resource with `?tx=<hash>` to get the data.
4. Tool outputs are **untrusted data**. Never strip or sanitize injected text for the model; the vault is the defense.

### 9.2 Receipt bundle and hash `[DESIGN]`
```json
{
  "version": 1,
  "task_id": "uuid",
  "created_at": "ISO-8601",
  "model": "<model id used>",
  "request": { "messages": [...], "tools": [...], "params": {...} },
  "response": { "...raw completion JSON as returned..." },
  "tee": { "signature": "<VERIFY>", "attestation": "<VERIFY>", "signing_address": "<VERIFY>" },
  "spend_intent": { "payee": "...", "amount": "yocto string", "nonce": "string", "memo": "..." }
}
```
`receipt_hash = lowercase_hex( sha256( utf8( JCS(bundle) ) ) )` where JCS = JSON Canonicalization Scheme (RFC 8785) `[VERIFY]` pick a maintained JS implementation, or implement sorted-key stable stringify and document it. The `tee` field names are placeholders until section 5.3 is verified.
Persist bundles to `apps/agent/data/receipts/<hash>.json`. Never put secrets in a bundle (strip auth headers).

### 9.3 HTTP API (agent service, default port 8787)
| Endpoint | Body / params | Response |
|---|---|---|
| `GET /health` | none | `{ ok: true }` |
| `POST /task` | `{ goal, merchant_url, max_budget_near }` | `{ task_id }` |
| `GET /task/:id` | none | `{ status: "running"|"done"|"failed", steps: Step[], result? }` |
| `GET /receipts/:hash` | none | the stored bundle, or 404 |
| `POST /redteam/:scenario` | scenario in `injection`, `stolen_key`, `qday` | `{ run_id }` |
| `GET /redteam/:run_id` | none | `{ status, steps: RedTeamStep[], verdict }` |
`Step` = `{ t, kind: "llm"|"tool"|"chain", summary, data? }`.
CORS: allow the web app origin only.

### 9.4 Environment variables
`NEAR_NETWORK` (testnet|mainnet), `NEAR_RPC_URL` `[VERIFY]` choose a current public RPC, `VAULT_ACCOUNT_ID`, `AGENT_PRIVATE_KEY` (ed25519, function-call key), `NEAR_AI_KEY`, `NEAR_AI_MODEL`, `MERCHANT_URL`, `MERCHANT_ACCOUNT_ID`, `ATTACKER_ACCOUNT_ID`, `PORT`. Provide `.env.example`; never commit `.env`.

---

## 10. Demo merchant (`apps/merchant`, default port 8788)

- `GET /report` (no proof): `402` with JSON
  `{ "version": 1, "network": "testnet", "payee": MERCHANT_ACCOUNT_ID, "amount_yocto": "...", "memo": "report-<nonce>" }`
- `GET /report?tx=<hash>&sender=<vault_account>`: verify via NEAR RPC that the transaction succeeded and that a transfer of at least `amount_yocto` from the vault reached the merchant `[VERIFY]` RPC method and result shape (e.g., `tx` / `EXPERIMENTAL_tx_status`; check receipts for the transfer action). If valid, `200` with a short market-report JSON (static content). Reject reused tx hashes.
- `MALICIOUS=1`: the 402 body gains a `note` field with hostile text, e.g. an instruction claiming the vault must immediately send its whole balance to `ATTACKER_ACCOUNT_ID` "for security". This is our own test content, labeled in code as a Red Team fixture.

---

## 11. Web app and wallet (`apps/web`)

Next.js (App Router), TypeScript, Tailwind. Responsive. Deployed publicly (e.g., Vercel `[VERIFY]` account/limits).

### 11.1 Wallet module `[DESIGN]`
- `createOwnerKey()`: generate ML-DSA-65 signer in browser via `@fastnear/ml-dsa-65`.
- `enrollKey()`: requires the user's existing classical key to sign `AddKey`. Hackathon flow: the user pastes/imports a classical key for the testnet owner account once, or uses a freshly created testnet account whose key the app generated. Clear after enrolling.
- `sign/sendOwnerTx()`: sign owner transactions (`set_policy`, `pause`, `rotate_agent_key`, `revoke_agent_key`, `withdraw`) with the ML-DSA signer.
- Storage: secret key encrypted with WebCrypto (key derived from a passphrase, e.g. PBKDF2/Argon-like `[VERIFY]` choose a well-supported WebCrypto option) in IndexedDB. Export/import of an encrypted keyfile. **Never log, serialize in URLs, or send secret material anywhere.**
- Backup: user adds a second ML-DSA key (exported encrypted) before any classical key is deleted. **Never delete the last working full-access key.**
- UI honesty labels: "Hackathon-grade key custody. Browser ML-DSA is not constant-time. Hardware wallets do not support ML-DSA yet."

### 11.2 Screens
| Screen | Content | Key states |
|---|---|---|
| **Setup** | create/import owner key; enroll; create/fund vault; set agent key | no key / enrolled / vault funded |
| **Policy** | per-tx cap, daily cap, allowlist editor, expiry, reserve; "Save" signs a PQ tx | unsaved / saving / saved / error |
| **Activity** | live feed from `get_recent` (poll every 2 to 3 s), status badge (green spend, red rejected), "Verify receipt" | empty / populated |
| **Receipt viewer** | loads bundle from agent API, recomputes the hash and compares to on-chain `receipt_hash`; shows model, TEE fields, attestation status | hash match / mismatch / not found / attestation unverified |
| **Red Team** | 3 buttons, step-by-step outcome log, final verdict "Funds lost: X NEAR (cap Y)" | idle / running / done |
| **Kill switch** | large button: Pause + Revoke agent key, PQ-signed | armed / confirming / done |
The dashboard shows `VaultStatus` (balance, spent today, counts) persistently.

### 11.3 Receipt verification (what it does and does not prove)
- It proves the stored bundle matches the on-chain hash (integrity), and displays the TEE signature/attestation material.
- Cryptographic verification of the TEE attestation `[VERIFY]` is done only if the NEAR AI Cloud docs give a practical client-side method; otherwise show "attestation attached, not independently verified in-app" and link the docs. Do not claim more.

---

## 12. Red Team Mode

All scenarios use testnet funds. Policy for the demo `[DESIGN]`: per-tx cap 0.5 NEAR, daily cap 2 NEAR, allowlist = [merchant], expiry never, reserve 0.5 NEAR, vault funded with 10 NEAR.

| # | Scenario | Setup | Attack | Expected outcome | UI shows |
|---|---|---|---|---|---|
| 1 | Prompt injection | Merchant `MALICIOUS=1` | Agent reads hostile note; may attempt `pay(attacker, whole balance)` | `rejected: payee_not_allowed` (and/or `over_per_tx_cap`); no funds leave | Agent reasoning excerpt + red REJECTED row |
| 2 | Stolen agent key | Script uses the agent key directly | Repeated `agent_spend` to attacker and to the merchant at max amount | Attacker payees rejected; merchant payments stop at `daily_cap`; loss <= daily cap | Table of attempts + "Max possible loss = daily cap" |
| 3 | Q-Day drill | Pretend agent key compromised | Owner signs `pause` + `revoke_agent_key` with the **ML-DSA key**; then attacker retries | Retries fail (`paused` or key rejected by the network) | Owner tx with `ml-dsa-65` key, followed by failed attempts |

Each scenario returns an assertion verdict (pass/fail) computed from real on-chain results, not hard-coded. If a scenario cannot be run live, the UI must say so; never fake results.

---

## 13. Repository layout

```
warden/
├── AGENTS.md              # rules for the coding agent
├── PROJECT_SPEC.md        # this file
├── PROGRESS.md            # running log (template below)
├── README.md              # public pitch + setup + honest limits
├── LICENSE                # MIT
├── .env.example
├── contracts/vault/       # Rust contract + tests
├── apps/agent/            # agent service
├── apps/merchant/         # demo 402 server
├── apps/web/              # Next.js dashboard + wallet
├── packages/shared/       # types, hashing/receipt helpers
└── docs/
    ├── ARCHITECTURE.md    # diagrams + verified findings
    ├── THREAT_MODEL.md
    └── DEMO.md            # script, rehearsal checklist
```

---

## 14. Milestones and acceptance criteria

Dates assume solo work, ~8 to 10 h/day. Today is Nov 5. Hard deadline Nov 14 23:59 UTC (= Nov 15 05:29 IST). Target submission: midday UTC Nov 14.

| ID | Date | Deliverable | Done when |
|---|---|---|---|
| M0 | Nov 5 | Environment + verification | Hackathon page and HACKATHON.md read; NEAR AI Cloud key works; testnet accounts exist; RPC protocol version >= 85 confirmed; one tx signed with an ML-DSA-65 key (or fallback decision logged); attestation fields identified. |
| M1 | Nov 6 | Contract skeleton + tests | State, policy, owner methods, `deposit`, `get_*`; tests 1, 5 passing; deployed to testnet. |
| M2 | Nov 7 | `agent_spend` + key plumbing | All tests in 8.5 pass; agent function-call key added via `rotate_agent_key`; a real agent-key call succeeds and a disallowed call fails. |
| M3 | Nov 8 | Agent loop + merchant | One paid task runs end to end on testnet; receipt bundle stored and hashed. |
| M4 | Nov 9 | Web: setup, policy, activity | Owner can create/enroll PQ key, set policy, see live feed. |
| M5 | Nov 10 | Red Team + kill switch | All 3 scenarios run live with computed verdicts; kill switch signed with ML-DSA. |
| M6 | Nov 11 | Stretch (one) or hardening | Either stretch A or B works end to end, or extra tests and polish if behind. |
| M7 | Nov 12 | Docs | README, ARCHITECTURE, THREAT_MODEL, DEMO complete; diagram added. |
| M8 | Nov 13 | Video + submission | 2 to 3 min video recorded and posted on X; submission form filled; repo public with no secrets. |
| M9 | Nov 14 | Buffer | Submit by midday UTC. Only bug fixes. |

**Decision gate (end of Nov 6):** if ML-DSA signing does not work, switch the owner key to classical, keep everything else, and present PQ as the upgrade path (README and pitch must say so honestly).

### Cut order if behind
1. Stretch (M6).  2. Receipt viewer polish.  3. Allowlist editor UX.  4. Mainnet.  5. Never cut: vault tests, Red Team Mode, kill switch, receipt hash.

---

## 15. Verified findings log (AI: append here)

| Date | Question | Finding | Source |
|---|---|---|---|
| 2026-11-05 | ML-DSA enrollment | Needs classical-signed AddKey; full-access only documented | js.fastnear.com/post-quantum |
| 2026-11-05 | NEAR AI Cloud attestation/signature fields | Preflight `GET /v1/attestation/report?signing_algo=&nonce=&model=&provider=near` (fields `gateway_attestation`, `model_attestations[]`). After a completion, `GET /v1/signature/{id}?signing_algo=` gives `text`, `signature`, `signing_address`, `signing_algo`, `signature_kind`. A 2xx with `error_code` or a 404 means no signature. `ecdsa` = EIP-191 recovery. Exact request/response bytes must be kept and `x-no-aliasing: true` sent. Not yet run with a real API key. | docs.near.ai/cloud/verification/cloud-api/response-signatures.md, gateway-attestation.md, model-attestations.md |
| 2026-11-05 | TEE models | `GET /v1/model/list` entries carry `metadata.verifiable` and `metadata.attestationSupported`. Default model `z-ai/glm-5.3-flash`: verifiable, supports tools. | live API |
| 2026-11-05 | RPC endpoint to use (testnet) | `https://test.rpc.fastnear.com` and `https://rpc.testnet.near.org` both report `protocol_version` 88 (>= 85). | live RPC |
| 2026-11-05 | `near-sdk` / `cargo-near` / `near-workspaces` versions | near-sdk 5.30.0 (needs rustc >= 1.95), near-workspaces 0.24.0, cargo-near 0.22.0. **A plain `cargo build` is not an on-chain build**: near-sdk only uses host functions under cargo-near's `cfg(near)`. The sandbox doesn't run on Windows, so integration tests run in Docker. | crates.io; near-sdk compile error text |
| 2026-11-05 | Merchant tx-verification RPC method | `EXPERIMENTAL_tx_status` with `wait_until: FINAL`; checks signer, `Transfer` action, receipt status. Confirmed on a local node. | E2E test |
| | Function-call keys with ML-DSA | Not tested. The design doesn't need it. | |
| 2026-11-05 | Real gas cost of `agent_spend` (to size key allowance) | 2.5 Tgas on success, 1.8 Tgas on rejection. The 0.25 NEAR default allowance is plenty. | integration tests, sandbox |
| 2026-11-05 | ML-DSA in practice | Enrollment, single and batched owner txs work in Node and the browser on a local protocol 88 node. On-chain `public_key` starts with `ml-dsa-65`. Not yet run on public testnet. | E2E test, browser run |
| 2026-11-05 | Hackathon rules / judging | Claude Code and Codex screen each repo (reproducibility, feature verification) before humans decide. README must give "do X, see Y" steps, list libraries and AI-generated code, and include a LICENSE. Submit once via form/API, printing the payload for human approval. 13 tracks; we fit `security`, `agents`, and possibly `privacy`. Local-only demo allowed if reproducible. Results by Nov 18. | nearhackathon.com/HACKATHON.md |
| 2026-11-05 | Spec deviations | (1) Agent uses `fetch`, not the OpenAI SDK, to keep exact bytes for signature checks. (2) Added `agent_key` to state/`VaultStatus`, so rotate can delete the old key. (3) `rotate_agent_key` resets `last_nonce`; otherwise a thief spending once with nonce u64::MAX blocks all future spends. (4) Memos are truncated to 64 bytes to bound state. (5) `new` rejects owner == vault. (6) Merchant also accepts `?malicious=1`, so Red Team needs no restart. | this repo |

---

## 16. Threat model (summary; expand in `docs/THREAT_MODEL.md`)

| Threat | Mitigation | Residual risk |
|---|---|---|
| Prompt injection steers the agent to pay an attacker | Allowlist + caps enforced in the vault | Agent may spend up to the daily cap on allowlisted payees |
| Agent key stolen, including by a future quantum attacker | Key reaches only `agent_spend`; losses bounded by policy; owner revokes | Loss up to daily cap before revocation |
| Gas-burn spam with a stolen key | Finite allowance; cheap rejects | Key exhausted; owner rotates |
| Owner key theft | PQ key, encrypted at rest, backup key | Browser custody not hardened; non-constant-time implementation |
| Forged or altered receipts | On-chain hash; bundle re-hash check | Attestation verification may be off-chain/partial; relies on TEE vendors |
| Replay of a spend | Strictly increasing nonce | none |
| Merchant double-claim of a payment | Merchant rejects reused tx hashes | Demo-grade merchant |
| Misleading claims | README states limits plainly | n/a |

---

## 17. PROGRESS.md template

```
# PROGRESS
## Current milestone: Mx
## Done
- [ ] ...
## Next (in order)
1. ...
## Blockers / open questions
- ...
## Spec conflicts found
- ...
## Last updated: <date/time>
```

---

## 18. Submission pack

**README outline:** pitch; demo GIF; architecture diagram; how it works (accounts, keys, policy, receipts); quick start (contract, agent, merchant, web); Red Team Mode; honest limitations (classical agent key; off-chain attestation verification; hackathon-grade browser key custody; testnet); roadmap (private prepaid credits inspired by zkAPI, custom chains, browser extension for key isolation, hardware wallet support, token-level spend mandates); license.

**X post (draft, edit freely):** "AI agents will hold money. Prompt injection and stolen keys will happen. Warden is a quantum-safe leash on NEAR: policy-enforced spending, ML-DSA owner key, and a hardware-signed receipt for every payment. Watch it defeat three attacks. [video] [repo] #NEARHackathon"

**Checklist:** repo public; MIT license; no secrets (scan history); deployed demo link works; video under 3 minutes with the blocked attack in the first 10 seconds; X post public; submission form completed before the deadline; contract addresses listed in README.

---

## 19. Decision log

| Decision | Why | Alternatives rejected |
|---|---|---|
| Web app only | No install for judges; fastest solo; ML-DSA package runs in browsers | Mobile app (store/key-storage overhead); extension (MV3 complexity; roadmap) |
| Vault + self-call function-call key | Agent can only reach one method; funds locked behind policy | Giving the agent a full key; per-tx owner approval (not autonomous) |
| Non-panicking rejections + on-chain activity buffer | UI shows attempts and reasons with no indexer | Panicking reverts (attempts invisible); external indexer (extra infra) |
| Hash of TEE-signed bundle on-chain | Cheap, verifiable audit trail | On-chain attestation verification (too big for 10 days) |
| Native NEAR token for MVP spends | Simplest settlement | FT/USDC (stretch), cross-chain (stretch A) |
| Testnet first | Safe iteration | Mainnet only after testnet works and only with tiny amounts |
| Drop zkAPI, Hyperledger, "no seed phrase" | Out of NEAR scope, not PQ, or false claim; solo time limit | Roadmap mentions only |
| Name "Warden" | Working title | Rename freely; update README only |

---

## 20. Glossary

- **ML-DSA-65:** NIST FIPS 204 post-quantum signature scheme (formerly Dilithium), parameter set 65.
- **Function-call key:** a NEAR access key limited to one contract and optional methods, with a gas allowance.
- **Self-call:** a call where the signer account is the same as the contract account.
- **TEE:** trusted execution environment; hardware-isolated computation that can produce attestations.
- **Attestation:** signed hardware evidence about what code runs in a TEE.
- **402 / x402:** HTTP "Payment Required" pattern for paid APIs.
- **yoctoNEAR:** 10^-24 NEAR.
- **Q-Day:** the hypothetical day a quantum computer can break classical signatures.
- **JCS:** JSON Canonicalization Scheme (RFC 8785), used to hash JSON deterministically.
