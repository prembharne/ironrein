# Threat model

**Goal:** when the AI is fooled or its key is stolen, the loss stays within limits the owner set, the owner can stop it, and payments can be audited.

| Threat | Mitigation | Residual risk | Tested by |
|---|---|---|---|
| Prompt injection steers the agent to pay an attacker | Allowlist and caps enforced in the vault | Agent can spend up to the daily cap on allowlisted payees | Integration, E2E, Red Team 1 |
| Agent key stolen, including by a future quantum attacker | Key reaches only `agent_spend`; loss bounded by policy; owner can revoke | Loss up to the daily cap before revocation | Integration, E2E, Red Team 2 and 3 |
| Thief uses the key to call other methods or move funds directly | NEAR refuses other methods, deposits and transfers from a function-call key | None known | Integration |
| Thief blocks the agent by spending once with nonce `u64::MAX` | `rotate_agent_key` resets `last_nonce`. Old transactions can't replay because their key is gone | Spending is blocked until the owner rotates | Unit |
| Gas burn by spamming a stolen key | Finite key allowance | Key runs out; owner rotates. Spam also pays from the vault's balance within that allowance | Allowance limit is enforced by NEAR, not separately tested |
| State bloat through long memos | Memos truncated to 64 bytes; activity capped at 50 | | Unit |
| Thief hides evidence by flooding rejected calls | Event logs remain in chain history | The on-chain buffer and feed only show the last 50 entries | Unit, for the cap |
| Contract-added key with zero allowance, which would be unlimited | `rotate_agent_key` rejects 0 | | Unit, integration |
| Owner key theft | ML-DSA key encrypted at rest with PBKDF2 and AES-GCM; backup key | Browser custody isn't hardened and the implementation isn't constant-time. A compromised page can steal the key once unlocked | Unit, for encryption |
| Forged or altered receipts | On-chain hash; browser re-hash; signature recovery | Quote verification is off-chain and manual. Relies on TEE vendors | Unit, E2E |
| Agent bundle omits TEE evidence | Page shows "Not verified" with the reason | A spend can still go through without a signature: the vault checks the hash's format, not what it covers | Unit, E2E |
| Injection aims the agent's fetch tool at internal hosts | Fetch is limited to the merchant's origin | | Unit |
| Other websites trigger spends through the agent API | Binds to localhost; JSON-only POST with CORS limited to the web origin | Anyone with local access to the port can run tasks | Not separately tested |
| Payment replay at the merchant | Tx hashes are single-use | In-memory, so a restart forgets them. Demo-grade | E2E |
| Misleading claims | README and UI state these limits | | |

## Not defended

- A malicious allowlisted payee can take up to the daily cap.
- A transfer to an allowlisted account that doesn't exist fails and refunds the vault, but still counts against the daily cap. This errs on the safe side.
- The vault isn't locked until its deployer key is removed. Anyone holding that key controls the contract.
- The contract has not been audited.
