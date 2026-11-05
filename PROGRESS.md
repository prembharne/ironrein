# PROGRESS

## Current milestone: M5 done on testnet, driven by scripts. Needs the UI template and a browser run on testnet

## Done
- [x] Vault contract: 35 unit tests, 9 integration tests on a real sandbox node
- [x] Merchant: 10 tests
- [x] Agent loop, receipts and Red Team: 8 tests
- [x] Shared helpers: 5 tests
- [x] Web app with simple UI: 18 tests, builds cleanly
- [x] E2E on a local chain: 12 checks, with real ML-DSA signing and a scripted model
- [x] Browser run on a local chain: create key, wrong and right passphrase, policy save, Red Team 1 and 3, kill switch, restore, feed, receipt page
- [x] Real NEAR AI Cloud on a local chain: paid task, real `provider_tee` signature verified, signer matches attestation, injection run
- [x] Public testnet (`warden-vault-1d4de2.testnet`): paid task with the real model, receipt checks, injection run, Q-Day drill with real ML-DSA signing, restore
- [x] README, architecture, threat model, demo script, LICENSE

## Not verified yet
- The web app against public testnet (only scripts have run there so far)
- Red Team 2 on testnet. It passed on a local chain, and is held back because it uses up the day's cap
- Web app's Enroll form with a typed classical key (the browser run enrolled through a helper script)
- Web app's backup key, deposit and withdraw, keyfile export and import, and Red Team 2 button (scenario 2 passed in E2E)
- Layout at phone width, by eye

## Next (in order)
1. Integrate the human's UI template (restyle `apps/web/components/ui.tsx`, `app/layout.tsx` and page markup; logic stays in `lib/`)
2. Run the web app against testnet: enroll a key through the form, then all screens
3. Human: replace the NEAR AI key before submitting, since it was shared in a chat
4. Rehearse 5 times, deploy, record video, X post, submit by midday UTC Nov 14

## Blockers / open questions
- The real model ignored the injection in live runs, so the Red Team fallback sends the attack directly. That's honest, but the "model gets fooled" moment doesn't happen on camera. Decide whether to try other models for the demo
- WSL Ubuntu is broken (its ext4.vhdx is missing). Not needed: Rust tests run in Docker. Windows unit tests use the `stable-x86_64-pc-windows-gnu` toolchain, because MSVC's linker isn't installed
- Hosted demo: the agent API binds to localhost and can spend, so hosting needs a decision. A local demo plus video is allowed by the rules

## Spec conflicts found
- Listed in PROJECT_SPEC.md section 15, "Spec deviations"

## Last updated: 2026-11-05
