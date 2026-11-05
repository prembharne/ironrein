# Warden

Spending limits for AI agents that hold money, enforced by a NEAR smart contract.

An AI agent that can pay for things can be tricked into paying the wrong party, and its key can be stolen. Warden keeps the money in a vault contract that the agent can only reach through one policy-checked method. Prompt injection and key theft are limited to what the policy allows. The owner controls the vault with a post-quantum (ML-DSA-65) key, and each payment anchors a hash of the AI inference behind it.

Built at NEAR HACKATHON for the AI Security & Defense track. All code here was written during the hackathon window.

## How it works

```
 Owner (browser)                 Agent service (Node)            Merchant (Node)
 ML-DSA-65 key                   NEAR AI Cloud model             402 paid API
      │ set_policy, pause,            │ agent_spend, signed           ▲
      │ revoke, withdraw              │ with a function-call key      │ checks the tx
      ▼                               ▼                               │ over RPC
 ┌────────────────────────────────────────────────────┐               │
 │ Vault contract (Rust): holds NEAR, enforces policy │───transfer────┘
 └────────────────────────────────────────────────────┘
```

- **The vault decides, not the model.** `agent_spend` checks pause state, expiry, payee allowlist, per-payment cap, daily cap, nonce, receipt hash and reserve. A violation is recorded on-chain and returns a reason.
- **The agent key is restricted by NEAR itself.** It's a function-call key that can only call `agent_spend`, can't attach funds, and has a finite gas budget.
- **The owner signs with ML-DSA-65.** NEAR verifies these signatures natively from protocol 85.
- **Each spend carries a receipt hash.** It's the SHA-256 of a bundle holding the exact model request and response plus NEAR AI Cloud's TEE signature and attestation, when available.

| Part | Path |
|---|---|
| Vault contract | [contracts/vault](contracts/vault/src/lib.rs) |
| Agent service and Red Team | [apps/agent](apps/agent/src) |
| Demo merchant | [apps/merchant](apps/merchant/src) |
| Owner console | [apps/web](apps/web) |
| Types and receipt hashing | [packages/shared](packages/shared/src/index.ts) |

More detail: [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), [demo script](docs/DEMO.md).

## Red Team Mode

Three one-click attacks. Verdicts are computed from on-chain results.

1. **Prompt injection.** The merchant's reply tells the agent to send the whole vault to an attacker. If the model refuses, the same transfer is sent to the vault directly and labeled as such. You see `REJECTED (payee_not_allowed)`, and the attacker receives nothing.
2. **Stolen agent key.** The attacker tries draining to their own account, then exceeding the per-payment cap, then spending the maximum to the allowlisted merchant. Their own account gains nothing, and spending stops at the daily cap. This really spends testnet NEAR.
3. **Q-Day drill.** Assume the classical agent key is broken. The owner signs pause and revoke with the ML-DSA key. The drill checks the signature type on-chain, then shows NEAR refusing the old key.

## Try it

Needs Node 22.9+, pnpm and Docker. On Windows, run the `bash` commands from Git Bash.

### Check the code, no accounts needed

```bash
pnpm install
```
```bash
pnpm -r --if-present test
```
You should see every suite pass: shared 5, merchant 10, agent 8, web 15.

```bash
bash scripts/test-integration.sh
```
This builds the contract with `cargo-near` into `contracts/out/` and runs it on a real sandbox node. You should see `9 passed`. The vault's 35 unit tests run with `cargo test --lib` in `contracts/vault`.

### Run the whole system on a local chain

After the integration script has run once:

```bash
bash scripts/sandbox.sh
```
```bash
pnpm --filter agent run bootstrap --sandbox
```
```bash
pnpm --filter agent e2e
```
You should see `All 12 checks passed`. This signs real ML-DSA transactions and runs the real agent and merchant. The model is scripted, so real TEE signatures aren't exercised here.

### Run on testnet

```bash
NEAR_AI_KEY=your_key pnpm --filter agent run bootstrap
```
This creates four testnet accounts and writes `.env` and `apps/web/.env.local`. Then run each of these in its own terminal:

```bash
pnpm --filter merchant dev
```
```bash
pnpm --filter agent dev
```
```bash
pnpm --filter web dev
```

Open http://localhost:3000/setup, create your owner key, and enroll it with the owner key saved in `.warden-keys/`. Then go to Activity and click **Run paid task**. You should see the payment in the feed, and **Verify receipt** opens its checks. Red Team is at `/redteam`.

## Honest limitations

- **The agent key is classical (Ed25519).** Warden limits the damage if it's broken; it doesn't make the key quantum-safe.
- **A thief can still spend up to the daily cap** on allowlisted payees before the owner reacts.
- **Attestation is not verified on-chain or in-app.** Only a hash is anchored on-chain. The browser checks the bundle hash and the signature against the signing address, but not the Intel/NVIDIA quote, and the page says so. A signature with `signature_kind: gateway` proves less than `provider_tee`.
- **Key custody is hackathon-grade.** Browser ML-DSA is not constant-time, JavaScript can't guarantee memory erasure, and hardware wallets don't support ML-DSA yet.
- **The vault keeps its deployer key by default.** Setup leaves a full-access key on the vault for development, so it isn't locked until you delete that key yourself.
- **The activity buffer holds 50 entries.** A stolen key can push old entries out with rejected calls. Event logs remain in chain history.
- **The merchant is demo-grade.** Redeemed payments are remembered in memory only.
- **Testnet only.** Not audited.

## Roadmap

Private prepaid credits, custom chains, a browser extension for key isolation, hardware wallet support, and token-level spend mandates.

## Libraries and AI-generated code

- **Libraries:** near-sdk, near-workspaces, cargo-near, `@fastnear/api`, `@fastnear/ml-dsa-65`, `@fastnear/utils`, `@noble/curves`, `@noble/hashes`, Next.js, React, Tailwind CSS.
- **AI-generated code:** this project was built with Claude Code, which wrote most of the code under human direction.
- **External services:** NEAR AI Cloud for TEE inference.

## License

[MIT](LICENSE)
