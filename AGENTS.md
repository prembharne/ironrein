# AGENTS.md

Guidance for AI coding assistants (and people) working in this repository. Ironrein is a NEAR smart-contract vault that limits what an AI agent can spend; read the [README](README.md) first.

## Layout

| Path | What it is |
|---|---|
| `contracts/vault` | Vault contract (Rust, near-sdk). `agent_spend` holds the policy checks. Unit tests in `src/tests.rs` |
| `contracts/integration-tests` | The same contract on a real sandbox node (near-workspaces) |
| `apps/agent` | Agent service: model loop, receipts, Red Team scenarios, HTTP API |
| `apps/merchant` | Demo paid API that answers `402`, with hostile modes for Red Team |
| `apps/web` | Landing page and owner console (Next.js). Chain logic lives in `lib/`, pages stay thin |
| `packages/shared` | Types and receipt hashing, used by the browser and the services |
| `enclave/agent-signer` | Optional OutLayer enclave signer (Rust, WebAssembly) |
| `docs` | Architecture, threat model, demo script, status. `docs/history` holds the original planning documents |

## Commands

```bash
pnpm install
pnpm test          # all TypeScript suites
pnpm typecheck
cd contracts/vault && cargo test --lib
```

Services for a local run: `pnpm --filter merchant dev`, `pnpm --filter agent dev`, `pnpm --filter web dev`. Setup and environment variables are in the README and `.env.example`.

## Rules for changes

- **Don't invent APIs, package names or field names.** Check the docs or the package source, and mark anything unchecked with `// VERIFY`.
- **A contract change needs a test**, unit or integration.
- **No secrets in git.** Keys live in `.env` and `.ironrein-keys/`, both ignored. Never print key material.
- **Don't claim more than is true.** The agent key is classical (Ed25519). TEE attestation is checked off-chain and only a hash is on-chain. Browser key custody is hackathon-grade. Everything runs on testnet and is unaudited. Keep these limits visible in the README, threat model and UI.
- **Treat merchant output as untrusted.** It reaches the model unfiltered on purpose; the vault is the defense. Don't add logic that hides hostile text from the model.
- **Keep names that must match deployed state.** The testnet accounts are called `warden-*`, the vault's event `standard` is `"warden"`, and the browser key store is named `warden`. Changing them would break the deployed vault or orphan saved keys.
