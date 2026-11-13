# Sealed agent key (OutLayer TEE)

Optional mode. By default the agent's key is in `.env` on the machine that runs the model. In this mode the key is generated inside an [OutLayer](https://app.outlayer.ai/docs) enclave (Intel TDX) and stays there. The agent service asks the enclave to call `agent_spend`, then reads the vault's verdict from NEAR itself.

```
 Agent service (laptop)            OutLayer enclave                 Vault on NEAR
 model, receipts, no key   ──▶     leash-agent-signer.wasm   ──▶    agent_spend
                           HTTPS   holds PROTECTED_AGENT_KEY  signs  policy check
        ◀───────────────── tx hash ─────────┘
        reads the verdict from NEAR, not from the enclave
```

## What it changes, and what it doesn't

- **Changes:** there is no copy of the agent key on the laptop to steal. The key is created by OutLayer's keystore under the reserved `PROTECTED_` prefix, so no person sees it. Each call comes with an attestation URL for the code that ran.
- **Doesn't change:** the key is still a classical Ed25519 function-call key. The vault enforces every limit exactly as before. Whoever holds the OutLayer payment key can still ask the enclave to spend, inside the policy. You are now also trusting OutLayer and Intel TDX to keep the key.
- **The signer is deliberately small.** It has two operations, `public_key` and `spend`, and the only contract method it can name is `agent_spend`. See [agent-signer/src/lib.rs](agent-signer/src/lib.rs).

## Status

- The signer builds to WebAssembly (`wasm32-wasip2`, about 160 KB) and its logic has 7 unit tests.
- The agent's sealed mode has 5 tests against a stand-in for the OutLayer API.
- **Not run against OutLayer yet.** Deploying, creating the secret and creating a payment key need an OutLayer login, which only the account owner can do. The steps below follow OutLayer's docs as read on 2026-11-11. Menu names may differ.

## Build

```bash
cd enclave/agent-signer
rustup target add wasm32-wasip2
cargo test --lib
cargo build --target wasm32-wasip2 --release
```

The module is `target/wasm32-wasip2/release/leash-agent-signer.wasm`.

## Set up on OutLayer (testnet)

1. **Deploy the module.** With the OutLayer CLI: `outlayer upload <path to the .wasm>`, then `outlayer deploy leash-agent-signer <the URL it printed>`. Your project is then `<your account>/leash-agent-signer`.
2. **Create the sealed key.** On the dashboard's Secrets page, bind a secret to that project, profile `default`, and add an auto-generated secret named `PROTECTED_AGENT_KEY` of type ED25519. For the access condition, choose "One build only" with this module's SHA-256 if you want the key usable by this exact code and nothing else.
3. **Create a payment key.** On the Payment Keys page, restrict it to this project and set a small per-call limit. It pays OutLayer for compute. It cannot move vault funds outside the policy.
4. **Put these in `.env`:**
   ```
   OUTLAYER_PROJECT=<your account>/leash-agent-signer
   OUTLAYER_PAYMENT_KEY=<owner:nonce:secret>
   OUTLAYER_SECRETS_ACCOUNT=<your account>
   ```
5. **Read the public key:** `pnpm --filter agent run sealed-key`. Add the line it prints (`AGENT_PUBLIC_KEY=...`) to `.env`, and remove `AGENT_PRIVATE_KEY`.
6. **Register it on the vault.** Restart the agent, open Setup in the web app and set the agent key. The owner signs `rotate_agent_key` with the ML-DSA key, which also removes the old laptop key from the vault.
7. **Check:** `http://localhost:8787/health` shows `"signer": "outlayer_tee"`. Run a paid task. The steps list a line "Signed inside the OutLayer enclave" with the attestation URL.

To go back, remove the `OUTLAYER_*` lines, restore `AGENT_PRIVATE_KEY`, and set the agent key again in Setup.

## Red Team in this mode

Scenario 2 (stolen key) then models a thief who holds the payment key instead of the agent key. The result is the same: only allowlisted payees, up to the daily cap. Scenario 3 (Q-Day) works unchanged: after the owner revokes the key, the enclave's call is refused by NEAR.
