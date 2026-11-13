# Demo script

Target length is 60 to 90 seconds for the core, with the blocked attack in the first 10 seconds. Everything shown must be live on testnet.

## Before recording

- [ ] Vault funded, policy set: per-payment 0.5, daily 2, reserve 0.5, merchant allowlisted
- [ ] Owner key enrolled and unlocked in the browser
- [ ] `spent_today` is low. **The stolen-key scenario uses up the daily cap, and normal tasks then fail until the next UTC day**, so record the paid task first, or use a fresh vault
- [ ] Agent and merchant running with a real `NEAR_AI_KEY`
- [ ] `SETTLE_ASSET_ID` and `SETTLE_RECIPIENT` set, and the merchant's startup line ends with `settles in nep141:base-...`
- [ ] Vault not paused, and the agent key is set. If not, use "Unpause and restore" on the Kill switch page
- [ ] Rehearsed 5 times, per the definition of done

## Script

1. **0:00** Run "Tricked agent" on Red Team. The model pays the attacker's account from the swapped bill, and red `REJECTED` appears. (The run takes a while because the injection attempt goes first. Start it before recording and cut to the swap, or record it whole and trim.)
2. **0:10** "This agent holds money. It can be tricked. So it can't be trusted." Show Policy.
3. **0:20** On Activity, run a paid task. The agent pays and the data returns. Point at the settlement card: "Paid in NEAR, priced in USDC on Base through NEAR Intents." Click **Verify receipt**.
4. **0:40** Run the stolen key attack. Attacker gains nothing, and spending stops at the daily limit.
5. **0:55** Run the Q-Day drill. Sign with the ML-DSA key. The next attempt shows `REFUSED BY NEAR`.
6. **1:10** "NEAR shipped quantum-safe keys. We built the rein."

## Showing where the money is

The "Where the money is" panel at the top of Activity answers this without leaving the app. Before an attack, read out the three tiles: the vault holds the money, the merchant is approved, the attacker has received 0 NEAR. After the attack, the attacker tile still says 0 received and its refused count has gone up. Click an account name to open the same balance in the explorer.

## Showing the TEE on camera

The receipt page is the proof. Spend about 10 seconds on it during step 3:

1. In the task steps, point at "Fetched TEE attestation before inference". The agent asked the enclave for its attestation report before it sent the prompt.
2. Click **Verify receipt**. Read out the passing checks: the bundle hashes to the value stored on-chain, the signature recovers to the signing address, and that address matches the one in the attestation report.
3. Click the transaction link next to the payment and show the same receipt hash in the explorer's logs. This ties the on-chain payment to the inference.
4. Leave the "attestation quote: not verified" line on screen and say it: the Intel and NVIDIA quote is not checked in the app.

## Things to say accurately

- The agent key is classical. The owner key is post-quantum.
- Hardware-signed means the TEE signature on the inference, and only when the receipt shows it verified.
- The settlement card is a live NEAR Intents quote. Say "priced" or "quoted", never "settled" or "swapped": no funds cross chains on testnet.
- In our runs the real models ignored the injected text and fell for the swapped payee. Call the second one a payee swap or invoice fraud, not prompt injection. Show whichever happens on the day: if the model attempts neither, the UI says so and sends the attack directly, and that must never be presented as the model being fooled.

## X post requirements

Say it was built at NEAR HACKATHON, tag @NEARProtocol and #NEARHackathon, and attach the video. Open with the user's problem, show one complete moment, explain NEAR's role concretely, and end with the repo link and a specific question.
