# PROGRESS

## Current milestone: paid task and Red Team 1 pass live on testnet from the running services. Owner-key screens still need the human's browser

## Done
- [x] Vault contract: 35 unit tests, 9 integration tests on a real sandbox node
- [x] Merchant: 10 tests
- [x] Agent loop, receipts and Red Team: 8 tests
- [x] Shared helpers: 5 tests
- [x] Web app: 37 tests (app, landing scroll-math, day rollover, tx pairing), builds cleanly
- [x] E2E on a local chain: 12 checks, with real ML-DSA signing and a scripted model
- [x] Browser run on a local chain: create key, wrong and right passphrase, policy save, Red Team 1 and 3, kill switch, restore, feed, receipt page
- [x] Real NEAR AI Cloud on a local chain: paid task, real `provider_tee` signature verified, signer matches attestation, injection run
- [x] Public testnet (`warden-vault-1d4de2.testnet`): paid task with the real model, receipt checks, injection run, Q-Day drill with real ML-DSA signing, restore
- [x] README, architecture, threat model, demo script, LICENSE
- [x] UI template: landing page at `/` (AI Studio template ported to Next, Ironrein copy, scroll effects unchanged). Console restyled to match: Inter Tight, navy glass cards, cyan accent, pill buttons with the glowing dot, white pill navbar. Logic in `lib/` untouched
- [x] Every console screen renders against public testnet (read-only), desktop and 390px phone width, no horizontal overflow
- [x] Activity feed and landing cards are proven real: each vault event links to its transaction (paired with NearBlocks v3 txns, 10/10 matched on testnet), with full date and time
- [x] Receipt page re-verified on testnet with the agent service running: 6 checks pass, attestation quote honestly "not verified"
- [x] Fixed: "Spent today" showed a stale total after a quiet day (contract only rolls the day on the next spend). Fixed: agent-offline errors were a bare "Failed to fetch"; now a clear message plus an online/offline badge
- [x] Renamed Warden to Ironrein in code, UI, docs, package and crate names. Kept on purpose: testnet account names, the contract's event `standard` string (matches the deployed vault), the browser key store name and keyfile binding (changing them would orphan saved keys), and the Docker cache volume names. `.warden-keys/` is now `.ironrein-keys/`
- [x] Stretch: cross-chain settlement quote through NEAR Intents 1Click. Merchant quotes NEAR to USDC on Base after a verified payment, agent passes it through, Activity shows a card. 5 merchant tests, 2 agent tests, and one live call to the real API returned a quote
- [x] "Where the money is" panel on Activity: vault, approved payees and refused payees with live balances and totals from the vault event log. 5 tests, and checked in the browser against testnet (merchant received 0.2 NEAR in 2 payments, attacker 0 with 2 refused attempts)
- [x] Red Team 1 now runs two attacks with the real model: the injected text, then a payee swap (`?malicious=swap` on the merchant). 4 merchant tests and 2 scenario tests. With the real merchant and a stand-in vault, glm-5.3-flash, Qwen3.8-27B and kimi-k2.6 each tried to pay the attacker on both runs
- [x] Optional sealed signer mode with OutLayer: a Rust enclave module (`enclave/agent-signer`, builds for wasm32-wasip2, 7 tests) holds the agent key and only calls `agent_spend`. The agent uses it when `OUTLAYER_PROJECT` is set (5 tests against a stand-in API). Default mode is unchanged and the agent still starts with the local key

- [x] 2026-11-13, public testnet, real model, all three services running:
  - Paid task started from the web app: agent paid 0.1 NEAR (tx `57LUaS1x4y7N7HJZjEgaxzKX5kKjo3MwY3vs9yY1CPpj`), the feed and "Where the money is" updated, and the receipt page showed 6 checks passing with a `provider_tee` signature
  - Red Team 1 through the agent service: the model ignored the injected text, then paid the attacker's account from the swapped bill, and the vault answered `REJECTED: payee_not_allowed`. Verdict passed, attacker received nothing. 104 seconds
- [x] Model calls now time out after 45 seconds and are retried up to 3 times. Before this, one hung call froze a Red Team run for over two minutes. NEAR AI response times varied from 3 to 46 seconds on 2026-11-13
- [x] Web app deployed to Vercel: https://ironrein.vercel.app (project `ironrein`, root `apps/web`). Activity loads the testnet vault there. The agent accepts a comma-separated `WEB_ORIGIN`, so the hosted site can call a locally running agent

## Not verified yet
- Signing from the web app on testnet: enroll through the form, policy save, kill switch, Red Team 3. Needs the human's browser, because the owner key must live there for the demo
- Red Team 1 clicked from the web page on testnet. It was run through the same agent endpoint the page calls, and the page itself was checked on a local chain earlier
- Red Team 2 on testnet. It passed on a local chain, and is held back because it uses up the day's cap
- The settlement card in a browser, and the quote inside a full paid task. `SETTLE_ASSET_ID` and `SETTLE_RECIPIENT` are not set in `.env`, so the feature is off. Each piece is tested separately
- Sealed signer mode against OutLayer itself (steps in `enclave/README.md`). Optional, and not needed for the demo
- `scripts/test-integration.sh` and `scripts/sandbox.sh` after the rename. Docker was not running. The vault's 35 unit tests pass under the new crate name
- Web app's backup key, deposit and withdraw, keyfile export and import

## Next (in order)
1. Human, in their own browser: Setup (create and enroll the owner key), save the policy once, then Kill switch and Red Team 3
2. Human: set `SETTLE_ASSET_ID` and `SETTLE_RECIPIENT` in `.env` if the settlement card should appear in the video
3. Human: replace the NEAR AI key before submitting, since it was shared in a chat
4. Human: create the public GitHub repo and push. There is no git remote yet
5. Human: confirm the landing template is allowed under the hackathon's "built during the window" rule (its files were dated Oct 29)
6. Rehearse, record the video (Red Team 2 last, it uses up the daily cap), X post, submit by midday UTC Nov 14

## Blockers / open questions
- The real model ignored the injection in live runs, so the Red Team fallback sends the attack directly. That's honest, but the "model gets fooled" moment doesn't happen on camera. Decide whether to try other models for the demo
- Tried on 2026-11-11 with `pnpm --filter agent run try-injection` (real agent loop, stand-in vault, no NEAR spent): all 10 verifiable tool-capable models ignored the current injection, 20 runs of 20. A second experiment with four models and rewritten merchant replies: notices, a fake owner message, an extra line item and a 9.5 NEAR invoice all failed. One thing worked: the merchant reply naming the attacker as `payee` for the normal 0.1 NEAR price. Models paid the attacker in 7 runs of 8. That is a payee swap, not a prompt injection, and only the allowlist stops it. Decide whether Red Team 1 should use it
- WSL Ubuntu is broken (its ext4.vhdx is missing). Not needed: Rust tests run in Docker. Windows unit tests use the `stable-x86_64-pc-windows-gnu` toolchain, because MSVC's linker isn't installed
- Hosted demo: the agent API binds to localhost and can spend, so hosting needs a decision. A local demo plus video is allowed by the rules
- `next dev` writes `apps/web/AGENTS.md` on every start. Either commit it or set `agentRules: false` in `next.config.ts`

## Spec conflicts found
- Listed in PROJECT_SPEC.md section 15, "Spec deviations"

## Last updated: 2026-11-13
