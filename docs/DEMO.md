# Demo script

Target length is 60 to 90 seconds for the core, with the blocked attack in the first 10 seconds. Everything shown must be live on testnet.

## Before recording

- [ ] Vault funded, policy set: per-payment 0.5, daily 2, reserve 0.5, merchant allowlisted
- [ ] Owner key enrolled and unlocked in the browser
- [ ] `spent_today` is low. **The stolen-key scenario uses up the daily cap, and normal tasks then fail until the next UTC day**, so record the paid task first, or use a fresh vault
- [ ] Agent and merchant running with a real `NEAR_AI_KEY`
- [ ] Vault not paused, and the agent key is set. If not, use "Unpause and restore" on the Kill switch page
- [ ] Rehearsed 5 times, per the definition of done

## Script

1. **0:00** Run the prompt injection on Red Team. Red `REJECTED` appears.
2. **0:10** "This agent holds money. It can be tricked. So it can't be trusted." Show Policy.
3. **0:20** On Activity, run a paid task. The agent pays and the data returns. Click **Verify receipt**.
4. **0:40** Run the stolen key attack. Attacker gains nothing, and spending stops at the daily limit.
5. **0:55** Run the Q-Day drill. Sign with the ML-DSA key. The next attempt shows `REFUSED BY NEAR`.
6. **1:10** "NEAR shipped quantum-safe keys. We built the leash."

## Things to say accurately

- The agent key is classical. The owner key is post-quantum.
- Hardware-signed means the TEE signature on the inference, and only when the receipt shows it verified.
- If the model ignores the injection, the UI says so and sends the attack directly. Show whichever happens.

## X post requirements

Say it was built at NEAR HACKATHON, tag @NEARProtocol and #NEARHackathon, and attach the video. Open with the user's problem, show one complete moment, explain NEAR's role concretely, and end with the repo link and a specific question.
