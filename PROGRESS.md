# PROGRESS

## Current milestone: M5 done locally. Needs testnet and a real NEAR AI key

## Done
- [x] Vault contract: 35 unit tests, 9 integration tests on a real sandbox node
- [x] Merchant: 10 tests
- [x] Agent loop, receipts and Red Team: 8 tests
- [x] Shared helpers: 5 tests
- [x] Web app with simple UI: 15 tests, builds cleanly
- [x] E2E on a local chain: 12 checks, with real ML-DSA signing and a scripted model
- [x] Browser run on a local chain: create key, wrong and right passphrase, policy save, Red Team 1 and 3, kill switch, restore, feed, receipt page
- [x] README, architecture, threat model, demo script, LICENSE

## Not verified yet
- Real NEAR AI Cloud responses. Signature and attestation fields come from docs only
- Anything on public testnet, including `createFundedTestnetAccount` in the setup script
- Web app's Enroll form with a typed classical key (the browser run enrolled through a helper script)
- Web app's backup key, deposit and withdraw, keyfile export and import, and Red Team 2 button (scenario 2 passed in E2E)
- Layout at phone width, by eye

## Next (in order)
1. Human: get a NEAR AI key (cloud.near.ai; $10 credit through NEAR Builders)
2. Human: run the testnet setup. It creates public accounts
3. Run the real flow, then fix field names if the docs differ from live responses
4. Integrate the human's UI template (restyle `apps/web/components/ui.tsx`, `app/layout.tsx` and page markup; logic stays in `lib/`)
5. Rehearse 5 times, deploy, record video, X post, submit by midday UTC Nov 14

## Blockers / open questions
- WSL Ubuntu is broken (its ext4.vhdx is missing). Not needed: Rust tests run in Docker. Windows unit tests use the `stable-x86_64-pc-windows-gnu` toolchain, because MSVC's linker isn't installed
- Hosted demo: the agent API binds to localhost and can spend, so hosting needs a decision. A local demo plus video is allowed by the rules

## Spec conflicts found
- Listed in PROJECT_SPEC.md section 15, "Spec deviations"

## Last updated: 2026-11-05
