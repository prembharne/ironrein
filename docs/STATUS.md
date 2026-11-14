# Status

What has been verified, and what has not, as of 2026-11-14. Nothing here is audited, and everything runs on NEAR testnet.

## Verified

| Area | How |
|---|---|
| Vault contract | 35 unit tests, and 9 integration tests on a real sandbox node (policy checks, stolen-key loss bounded by the daily cap, restricted function-call key, revocation, pause, rotation, withdraw) |
| TypeScript suites | shared 5, merchant 19, agent 17, web 48. CI runs them, plus the Rust unit tests, on every push |
| End to end on a local chain | `pnpm --filter agent e2e`: 12 checks with real ML-DSA signing and a scripted model |
| Real model on testnet | A paid task from the web app: the agent paid 0.1 NEAR (tx `57LUaS1x4y7N7HJZjEgaxzKX5kKjo3MwY3vs9yY1CPpj`), and the receipt page passed 6 checks with a `provider_tee` signature |
| Tricked-agent scenario on testnet | The model ignored the injected text, then paid the attacker's account from a swapped bill. The vault answered `REJECTED: payee_not_allowed` and the attacker received nothing |
| Q-Day drill on testnet | Run from the web app with an ML-DSA-65 key enrolled on the owner account. The owner transaction (pause and revoke) was signed with that key, then NEAR refused the old agent key |
| Owner console on testnet | Create and enroll the ML-DSA key, unlock, set the agent key, save the policy, kill switch and restore (all visible as events in the vault's log), activity feed with transaction links, receipt page, "Where the money is" panel |
| Cross-chain quote | One live call to the NEAR Intents 1Click API returned a quote for NEAR to USDC on Base |
| Hosted site | https://ironrein.vercel.app reads the testnet vault. The agent service isn't hosted |

## Not verified

- **The stolen-key scenario on testnet.** It passes on a local chain. On testnet it spends the rest of the day's cap, so it has not been run there.
- **Sealed signer mode** (`enclave/`) against OutLayer itself. The module builds and is unit-tested, and the agent's sealed mode is tested against a stand-in API.
- **The settlement card inside a full paid task.** The merchant, the agent and the page are each tested, but the feature is switched off in the demo environment.
- **Docker scripts** (`scripts/test-integration.sh`, `scripts/sandbox.sh`) after the project was renamed. Their cache volume names were changed and not re-run.
- **Backup key, deposit, withdraw and keyfile import** in the web app.
- **TEE attestation quote.** The browser checks the bundle hash, the signature and the signer against the attestation report, but not the Intel or NVIDIA quote itself, and the receipt page says so.

## Findings worth knowing

- **Models resist injected instructions but not a swapped payee.** All 10 verifiable, tool-capable NEAR AI Cloud models ignored text telling them to drain the vault (20 runs of 20). When the bill simply named the attacker's account as payee at the normal price, models paid it in 13 of 14 runs. The first is prompt injection; the second is invoice fraud. Only the vault's allowlist stops it. `pnpm --filter agent run try-injection` reruns the test against a stand-in vault.
- **Model latency varies.** NEAR AI Cloud calls took 3 to 46 seconds on 2026-11-13, so model calls time out after 45 seconds and retry up to 3 times.
- **The browser stores keys per website.** A key created on `localhost` isn't visible on the hosted site, and the other way round.

## Environment notes

- Windows unit tests use the `stable-x86_64-pc-windows-gnu` Rust toolchain, because the MSVC linker isn't installed on the development machine. On Linux and macOS, plain `cargo test --lib` works, as CI shows.
- The vault keeps its deployer key by default, so it isn't locked until that key is removed. See the README's limitations.
