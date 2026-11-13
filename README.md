# Ironrein

**Quantum-safe spending limits for AI agents that hold money, enforced by a NEAR smart contract.**

Even if the AI is tricked or its key is stolen, your money can't be drained, and every payment carries a TEE-signed record of why the AI paid.

Built at NEAR HACKATHON for the **AI Security & Defense** track. **Live site:** https://ironrein.vercel.app (reads the testnet vault).

## The problem

AI agents are starting to pay for things on their own. Today you either hand the agent your key, so a trick or a theft empties the wallet, or you approve every payment yourself, so it isn't autonomous. And agents do get tricked: in our tests, real models paid an attacker's account in 13 of 14 runs when a bill simply named that account as payee.

## What Ironrein does

The money sits in a vault contract on NEAR. The agent never holds it. It can only ask the vault to pay, and the vault checks the owner's rules first: approved payees, a per-payment limit, a daily limit, and a pause switch. Anything else is refused and recorded on-chain.

| Threat | What happens |
|---|---|
| The AI is tricked into paying an attacker | The vault refuses: the attacker is not on the allowlist |
| The agent's key is stolen | It can only call one method, under the same limits. Worst case is one day's cap to approved payees |
| A quantum computer breaks the agent's classical key | The owner signs pause and revoke with a post-quantum ML-DSA key, and NEAR refuses the old key |
| "Why did the AI pay?" | Each payment anchors a hash of the exact model request and response, with the model's TEE signature |

**Red Team Mode** runs these attacks live from the dashboard and shows each result from the chain.

## Demo

- Live site: https://ironrein.vercel.app. The agent service can spend, so it isn't hosted; paid tasks and Red Team run locally (see "Try it").
- Walkthrough and what to say: [docs/DEMO.md](docs/DEMO.md).
- Testnet vault: `warden-vault-1d4de2.testnet` ([explorer](https://testnet.nearblocks.io/address/warden-vault-1d4de2.testnet)).

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
- **The merchant can settle on another chain.** The agent pays the merchant's allowlisted NEAR account, and the merchant prices that payment in the asset it wants (USDC on Base in the demo) with a live NEAR Intents quote. The agent never handles a deposit address, so an injection can't redirect the cross-chain leg.
- **You can see where the money is.** The Activity page lists the vault, each approved payee and every account someone tried to pay, with live balances, what each one received from the vault and what was refused. All of it is read from the chain.
- **Each spend carries a receipt hash.** It's the SHA-256 of a bundle holding the exact model request and response plus NEAR AI Cloud's TEE signature and attestation, when available.

| Part | Path |
|---|---|
| Vault contract | [contracts/vault](contracts/vault/src/lib.rs) |
| Agent service and Red Team | [apps/agent](apps/agent/src) |
| Demo merchant | [apps/merchant](apps/merchant/src) |
| Landing page and owner console | [apps/web](apps/web) |
| Enclave signer for the sealed agent key (optional) | [enclave/agent-signer](enclave/agent-signer/src/lib.rs) |
| Types and receipt hashing | [packages/shared](packages/shared/src/index.ts) |

More detail: [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), [demo script](docs/DEMO.md).

## Red Team Mode

Three one-click attacks. Verdicts are computed from on-chain results.

1. **Tricked agent.** A hostile merchant tries twice. First its reply tells the agent to send the whole vault to an attacker (prompt injection); in our runs every verifiable model on NEAR AI Cloud ignored that. Then its bill simply names the attacker's account as payee at the normal price (payee swap). The models we tried paid that account in 13 runs of 14, because nothing in the bill looks like an instruction. You see `REJECTED (payee_not_allowed)`, and the attacker receives nothing. If the model attempts neither, the drain is sent to the vault directly and labeled as such.
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
You should see every suite pass: shared 5, merchant 19, agent 17, web 42.

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

To use the real model on that same chain, put `NEAR_AI_KEY=your_key` in `.env` and run this. It uses NEAR AI credits:

```bash
pnpm --filter agent run live
```
You should see a paid task, passing receipt checks with a real TEE signature, and `Live check passed`.

### Run on testnet

Put `NEAR_AI_KEY=your_key` in a `.env` file at the repo root, then:

```bash
pnpm --filter agent run bootstrap
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

Open http://localhost:3000/setup, create your owner key, and enroll it with the classical owner key saved in `.ironrein-keys/`. This needs a NEAR testnet account and a deployed vault, which the bootstrap command above creates. Creating them from the app, and approving the post-quantum key from a connected wallet instead of pasting a key, is on the roadmap. Existing NEAR wallets don't sign with ML-DSA yet, so the owner console holds that key in the browser. Then go to Activity and click **Run paid task**. You should see the payment in the feed, and **Verify receipt** opens its checks. Red Team is at `/redteam`. The landing page is at http://localhost:3000/.

## Cross-chain settlement (NEAR Intents)

Set these in `.env` and restart the merchant:

```
SETTLE_ASSET_ID=nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near
SETTLE_RECIPIENT=<the merchant's address on Base>
```

After each verified payment the merchant asks the NEAR Intents 1Click API what the NEAR it received becomes in that asset, and returns the answer with the data. The Activity page shows it under the task, for example `0.1 NEAR → 0.35 USDC on Base`. Asset ids come from `https://1click.chaindefuser.com/v0/tokens`.

This is a quote, not a swap. Every request is a dry run, so the price is live and no funds move. NEAR Intents runs on mainnet and this vault is on testnet.

## Sealed agent key (OutLayer TEE, optional)

By default the agent's key is in `.env` on the machine that runs the model. In sealed mode the key is generated inside an OutLayer enclave (Intel TDX) and never leaves it: a small signer in [enclave/agent-signer](enclave/agent-signer/src/lib.rs) holds it and can only call `agent_spend`. The agent service reads the vault's verdict from NEAR, not from the enclave. Setup steps and limits are in [enclave/README.md](enclave/README.md).

The signer builds and is unit-tested, and the agent's sealed mode is tested against a stand-in for the OutLayer API. It has not been run against OutLayer itself.

## Deployed on testnet

**Live site:** https://ironrein.vercel.app (landing page and owner console, reading the testnet vault). The agent and merchant are not hosted, because the agent service can spend. On the hosted site, paid tasks and Red Team work only for someone running those two services locally with the site listed in `WEB_ORIGIN`.

The project was renamed from Warden to Ironrein after these accounts were created. NEAR accounts can't be renamed, so on-chain names still say `warden`, and the deployed vault's event logs use `"standard": "warden"`.

- **Vault:** `warden-vault-1d4de2.testnet`
- **Example ML-DSA kill switch transaction:** `Ffeo5W5zzEBVayU3dbXNc4dTwhRtdHubbDPHFtMqWBvS`, signed by `warden-owner-1d4de2.testnet`

With `.env` in place, `pnpm --filter agent run live` runs a paid task and the injection with the real model, and `pnpm --filter agent run qday-live` runs the Q-Day drill with a real ML-DSA key. The drill leaves an extra ML-DSA key on the owner account, with its secret destroyed.

## Honest limitations

- **The agent key is classical (Ed25519).** Ironrein limits the damage if it's broken; it doesn't make the key quantum-safe.
- **Sealed mode moves trust, it doesn't remove it.** The key is still classical, and you then trust OutLayer and Intel TDX to keep it. Whoever holds the OutLayer payment key can still spend inside the policy. This mode is untested against the live service.
- **A thief can still spend up to the daily cap** on allowlisted payees before the owner reacts.
- **Attestation is not verified on-chain or in-app.** Only a hash is anchored on-chain. The browser checks the bundle hash, the signature against the signing address, and that signer against the report fetched before inference, but not the Intel/NVIDIA quote itself, and the page says so. A signature with `signature_kind: gateway` proves less than `provider_tee`.
- **Key custody is hackathon-grade.** Browser ML-DSA is not constant-time, JavaScript can't guarantee memory erasure, and hardware wallets don't support ML-DSA yet.
- **The vault keeps its deployer key by default.** Setup leaves a full-access key on the vault for development, so it isn't locked until you delete that key yourself.
- **The activity buffer holds 50 entries.** A stolen key can push old entries out with rejected calls. Event logs remain in chain history.
- **Cross-chain settlement is a live quote only.** No funds cross chains in the demo, and a real swap would also trust the NEAR Intents solvers and the 1Click service.
- **The merchant is demo-grade.** Redeemed payments are remembered in memory only.
- **Testnet only.** Not audited.

## Roadmap

Create the account and vault from the app, wallet-approved enrollment of the post-quantum key, an agent key sealed in a TEE, in-app verification of the TEE attestation quote, a browser extension for key isolation, hardware wallet support, private prepaid credits and token-level spend mandates.

## Libraries and AI-generated code

- **Libraries:** near-sdk, near-workspaces, cargo-near, `@fastnear/api`, `@fastnear/ml-dsa-65`, `@fastnear/utils`, `@noble/curves`, `@noble/hashes`, Next.js, React, Tailwind CSS, Inter Tight (Google Fonts).
- **AI-generated code:** this project was built during the hackathon with Claude Code, which wrote most of the code under human direction. The landing page (`apps/web/components/landing`) started as a Google AI Studio template; its files keep their Apache-2.0 headers. The console reuses its theme.
- **External services:** NEAR AI Cloud for TEE inference, NEAR Intents 1Click API for settlement quotes, OutLayer for the optional sealed agent key.

## License

[MIT](LICENSE)
