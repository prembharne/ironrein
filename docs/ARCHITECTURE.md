# Architecture

## Components and trust

| Component | Trusted for | Not trusted for |
|---|---|---|
| Vault contract | Enforcing policy, holding funds | |
| NEAR protocol | Function-call key limits, ML-DSA verification | |
| Agent service and model | Trying to complete the task | Anything involving policy. Assume it can be fooled |
| Merchant output | Nothing. It's untrusted data, passed to the model unfiltered on purpose | |
| NEAR AI Cloud TEE | Inference integrity, per vendor attestation, checked off-chain | |
| Browser | Holding the owner's encrypted key, at hackathon grade | |

## Keys

| Key | Type | On account | Can do |
|---|---|---|---|
| Owner primary and backup | ML-DSA-65, full access | Owner | All owner methods on the vault |
| Enrollment key | Ed25519, full access | Owner | Adds the first ML-DSA key, since a key of that type can't add itself |
| Agent key | Ed25519, function call | Vault | `agent_spend` only, no deposits, finite allowance |
| Deployer key | Ed25519, full access | Vault | Present during development. Deleting it locks the vault |

Agent calls are self-calls (`predecessor == current_account_id`). Owner calls come from `owner_id`, and `new` rejects a vault that names itself as owner.

## A paid task

1. The agent fetches TEE attestation with a fresh nonce, before any inference.
2. The model calls `fetch_paid_resource`, and the merchant answers `402` with a payee and amount.
3. The model calls `pay`. The agent reads `last_nonce`, builds the receipt bundle from that completion, stores it and hashes it.
4. The agent signs `agent_spend` with its function-call key. The vault runs its checks and transfers the funds, or records the rejection and returns the reason.
5. The model fetches the resource with `?tx=&sender=`. The merchant checks the signer, the `Transfer` action and the receipt status over RPC, then returns the data once per transaction.

## Receipts

```
receipt_hash = lowercase_hex(sha256(utf8(canonical_json(bundle))))
```

Canonical JSON sorts object keys and has no whitespace. It matches RFC 8785 for the value types a bundle holds, and refuses non-integer numbers. The model request, the model response and the attestation report are stored as raw strings, so their bytes stay exact and can be compared with the signed text.

The receipt page checks that the bundle matches its hash, that the hash is on-chain, that the stored bytes match their hashes, that the signed text covers those hashes, that the EIP-191 signature recovers to `signing_address`, and that the signer and nonce match the report fetched before inference. Those report fields are consistency checks, since the quote is the source of truth. It reports the attestation quote as not verified in-app.

## Verify list results

| Question | Answer | How we know |
|---|---|---|
| Protocol >= 85? | Testnet is on 88 | `status` RPC |
| `@fastnear/ml-dsa-65` works? | Yes, in Node and in the browser, on a local protocol 88 node | E2E test and browser run |
| Does a signed owner tx fit? | Yes, including a batch of two calls | E2E test |
| ML-DSA signing on public testnet? | **Not yet run** | Needs the testnet setup |
| Function-call keys as ML-DSA? | Not tested. The design doesn't need it | |
| NEAR AI Cloud fields | Match the docs. `z-ai/glm-5.3-flash` returns a `provider_tee` ecdsa signature over `model:request_sha256:response_sha256`, and its signer matches the model attestation | `pnpm --filter agent run probe`, live run |
| Gas for `agent_spend` | 2.5 Tgas on success, 1.8 Tgas on rejection | Integration tests |
| Build flow | `cargo near build non-reproducible-wasm --no-abi`. A plain `cargo build` isn't valid on-chain | near-sdk compile error |

At testnet's usual gas price, those gas figures come to roughly 1,000 calls per 0.25 NEAR of allowance. That's an estimate, not a measurement.

## Sandbox notes

The local node needs testnet's `transaction_validity_period` and a matching `epoch_length`, because FastNear reuses a block hash for up to 6 hours and the sandbox default is 100 blocks. `scripts/sandbox.sh` sets both.
