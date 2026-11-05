//! Fast logic tests against the mocked runtime. Key behaviour on a real node
//! (function-call key limits, real transfers) lives in tests/integration.rs.

use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::testing_env;

const NEAR: u128 = 10u128.pow(24);
const DAY: u64 = NS_PER_DAY;
const GOOD_HASH: &str = "ab00000000000000000000000000000000000000000000000000000000000001";

fn vault_id() -> AccountId { "vault.testnet".parse().unwrap() }
fn owner() -> AccountId { "owner.testnet".parse().unwrap() }
fn merchant() -> AccountId { "merchant.testnet".parse().unwrap() }
fn attacker() -> AccountId { "attacker.testnet".parse().unwrap() }
fn key() -> PublicKey {
    "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap()
}

fn ctx(pred: AccountId, ts: u64, balance: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(vault_id())
        .predecessor_account_id(pred.clone())
        .signer_account_id(pred)
        .block_timestamp(ts)
        .storage_usage(1_000)
        .account_balance(NearToken::from_yoctonear(balance));
    testing_env!(b.build());
}

fn policy() -> Policy {
    Policy {
        per_tx_cap: U128(NEAR / 2),
        daily_cap: U128(2 * NEAR),
        allowlist: vec![merchant()],
        expires_at: U64(0),
        min_reserve: U128(NEAR / 2),
    }
}

fn setup() -> Vault {
    ctx(owner(), DAY, 10 * NEAR);
    let mut v = Vault::new(owner());
    v.set_policy(policy());
    ctx(vault_id(), DAY, 10 * NEAR);
    v
}

fn spend(v: &mut Vault, payee: AccountId, amount: u128, nonce: u64) -> SpendResult {
    v.agent_spend(payee, U128(amount), U64(nonce), GOOD_HASH.to_string(), Some("m".into()))
}

fn assert_rejected(r: SpendResult, reason: &str) {
    assert_eq!(r, SpendResult { ok: false, reason: Some(reason.to_string()) });
}

// --- init ---

#[test]
fn new_defaults_deny_everything() {
    ctx(owner(), DAY, 10 * NEAR);
    let mut v = Vault::new(owner());
    assert_eq!(v.get_policy(), Policy::deny_all());
    ctx(vault_id(), DAY, 10 * NEAR);
    assert_rejected(spend(&mut v, merchant(), 1, 1), "payee_not_allowed");
}

#[test]
#[should_panic(expected = "owner must be a separate account")]
fn new_rejects_vault_as_owner() {
    ctx(owner(), DAY, 10 * NEAR);
    Vault::new(vault_id());
}

// --- test 1: owner-only ---

#[test]
#[should_panic(expected = "only the owner")]
fn set_policy_rejects_non_owner() {
    let mut v = setup();
    ctx(attacker(), DAY, 10 * NEAR);
    v.set_policy(policy());
}

#[test]
#[should_panic(expected = "only the owner")]
fn set_policy_rejects_agent_self_call() {
    let mut v = setup();
    v.set_policy(policy()); // setup leaves predecessor == vault
}

#[test]
#[should_panic(expected = "only the owner")]
fn pause_rejects_non_owner() {
    let mut v = setup();
    ctx(attacker(), DAY, 10 * NEAR);
    v.pause();
}

#[test]
#[should_panic(expected = "only the owner")]
fn unpause_rejects_non_owner() {
    let mut v = setup();
    ctx(attacker(), DAY, 10 * NEAR);
    v.unpause();
}

#[test]
#[should_panic(expected = "only the owner")]
fn rotate_rejects_non_owner() {
    let mut v = setup();
    ctx(attacker(), DAY, 10 * NEAR);
    let _ = v.rotate_agent_key(key(), NearToken::from_millinear(250));
}

#[test]
#[should_panic(expected = "only the owner")]
fn revoke_rejects_non_owner() {
    let mut v = setup();
    ctx(attacker(), DAY, 10 * NEAR);
    let _ = v.revoke_agent_key(key());
}

#[test]
#[should_panic(expected = "only the owner")]
fn withdraw_rejects_non_owner() {
    let mut v = setup();
    ctx(attacker(), DAY, 10 * NEAR);
    let _ = v.withdraw(U128(1), attacker());
}

#[test]
#[should_panic(expected = "only the agent key")]
fn agent_spend_rejects_outsider() {
    let mut v = setup();
    ctx(attacker(), DAY, 10 * NEAR);
    spend(&mut v, merchant(), 1, 1);
}

#[test]
#[should_panic(expected = "only the agent key")]
fn agent_spend_rejects_owner() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    spend(&mut v, merchant(), 1, 1);
}

#[test]
#[should_panic(expected = "daily_cap must be >= per_tx_cap")]
fn set_policy_validates_caps() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    let mut p = policy();
    p.daily_cap = U128(1);
    v.set_policy(p);
}

// --- test 2: each rejection reason, with boundaries ---

#[test]
fn rejects_when_paused() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    v.pause();
    ctx(vault_id(), DAY, 10 * NEAR);
    assert_rejected(spend(&mut v, merchant(), 1, 1), "paused");
}

#[test]
fn expiry_boundary() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    let mut p = policy();
    p.expires_at = U64(DAY + 10);
    v.set_policy(p);
    ctx(vault_id(), DAY + 10, 10 * NEAR);
    assert!(spend(&mut v, merchant(), 1, 1).ok, "at the expiry instant is still valid");
    ctx(vault_id(), DAY + 11, 10 * NEAR);
    assert_rejected(spend(&mut v, merchant(), 1, 2), "expired");
}

#[test]
fn rejects_payee_not_on_allowlist() {
    let mut v = setup();
    assert_rejected(spend(&mut v, attacker(), 1, 1), "payee_not_allowed");
}

#[test]
fn per_tx_cap_boundary() {
    let mut v = setup();
    assert_rejected(spend(&mut v, merchant(), NEAR / 2 + 1, 1), "over_per_tx_cap");
    assert!(spend(&mut v, merchant(), NEAR / 2, 1).ok);
}

#[test]
fn daily_cap_boundary() {
    let mut v = setup();
    for n in 1..=4 {
        assert!(spend(&mut v, merchant(), NEAR / 2, n).ok);
    }
    assert_eq!(v.get_status().spent_today, U128(2 * NEAR));
    assert_rejected(spend(&mut v, merchant(), 1, 5), "over_daily_cap");
}

#[test]
fn daily_cap_cannot_overflow() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    let mut p = policy();
    p.per_tx_cap = U128(u128::MAX);
    p.daily_cap = U128(u128::MAX);
    v.set_policy(p);
    ctx(vault_id(), DAY, 10 * NEAR);
    assert!(spend(&mut v, merchant(), NEAR, 1).ok);
    assert_rejected(spend(&mut v, merchant(), u128::MAX, 2), "over_daily_cap");
}

#[test]
fn nonce_replay_and_lower_nonce_rejected() {
    let mut v = setup();
    assert!(spend(&mut v, merchant(), 1, 5).ok);
    assert_rejected(spend(&mut v, merchant(), 1, 5), "bad_nonce");
    assert_rejected(spend(&mut v, merchant(), 1, 4), "bad_nonce");
    assert_rejected(spend(&mut v, merchant(), 1, 0), "bad_nonce");
    assert!(spend(&mut v, merchant(), 1, 6).ok);
}

#[test]
fn receipt_hash_validation() {
    for bad in [
        "".to_string(),
        "abc".to_string(),
        "0".repeat(64),
        "A".repeat(64),
        "g".repeat(64),
        "a".repeat(63),
        "a".repeat(65),
    ] {
        let mut v = setup();
        let r = v.agent_spend(merchant(), U128(1), U64(1), bad.clone(), None);
        assert_rejected(r, "bad_receipt_hash");
    }
    let mut v = setup();
    assert!(v.agent_spend(merchant(), U128(1), U64(1), "a".repeat(64), None).ok);
}

#[test]
fn min_reserve_boundary() {
    let mut v = setup();
    // Balance 1 NEAR, reserve 0.5: exactly 0.5 can leave.
    ctx(vault_id(), DAY, NEAR);
    let mut p = policy();
    p.min_reserve = U128(NEAR / 2 + 1);
    ctx(owner(), DAY, NEAR);
    v.set_policy(p);
    ctx(vault_id(), DAY, NEAR);
    assert_rejected(spend(&mut v, merchant(), NEAR / 2, 1), "below_reserve");
    ctx(owner(), DAY, NEAR);
    v.set_policy(policy());
    ctx(vault_id(), DAY, NEAR);
    assert!(spend(&mut v, merchant(), NEAR / 2, 1).ok);
}

#[test]
fn reserve_rejects_amount_above_balance() {
    let mut v = setup();
    ctx(vault_id(), DAY, 1000);
    assert_rejected(spend(&mut v, merchant(), 2000, 1), "below_reserve");
}

#[test]
fn checks_run_in_spec_order() {
    let mut v = setup();
    // Violates everything: paused must win.
    ctx(owner(), DAY, 10 * NEAR);
    v.pause();
    ctx(vault_id(), DAY, 10 * NEAR);
    let r = v.agent_spend(attacker(), U128(u128::MAX), U64(0), "x".into(), None);
    assert_rejected(r, "paused");
}

// --- test 3: rollover ---

#[test]
fn day_rollover_resets_spent_today() {
    let mut v = setup();
    for n in 1..=4 {
        assert!(spend(&mut v, merchant(), NEAR / 2, n).ok);
    }
    assert_rejected(spend(&mut v, merchant(), 1, 5), "over_daily_cap");
    ctx(vault_id(), 2 * DAY, 10 * NEAR);
    assert!(spend(&mut v, merchant(), NEAR / 2, 5).ok);
    let s = v.get_status();
    assert_eq!(s.spent_today, U128(NEAR / 2));
    assert_eq!(s.day_index, U64(2));
}

// --- test 5: pause and unpause ---

#[test]
fn unpause_restores_spending() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    v.pause();
    assert!(v.get_status().paused);
    v.unpause();
    assert!(!v.get_status().paused);
    ctx(vault_id(), DAY, 10 * NEAR);
    assert!(spend(&mut v, merchant(), 1, 1).ok);
}

// --- test 6: success path ---

#[test]
fn success_updates_counters_and_logs_event() {
    let mut v = setup();
    assert_eq!(spend(&mut v, merchant(), NEAR / 4, 7), SpendResult { ok: true, reason: None });
    let s = v.get_status();
    assert_eq!(s.accepted_count, U64(1));
    assert_eq!(s.rejected_count, U64(0));
    assert_eq!(s.last_nonce, U64(7));
    assert_eq!(s.spent_today, U128(NEAR / 4));
    let logs = get_logs().join("\n");
    assert!(logs.contains("EVENT_JSON:"));
    assert!(logs.contains("\"event\":\"spend\""));
    assert!(logs.contains(GOOD_HASH));
    let recent = v.get_recent(Some(1));
    assert_eq!(recent[0].kind, ActivityKind::Spend);
    assert_eq!(recent[0].receipt_hash.as_deref(), Some(GOOD_HASH));
}

#[test]
fn rejection_changes_only_rejection_state() {
    let mut v = setup();
    assert!(!spend(&mut v, attacker(), NEAR, 9).ok);
    let s = v.get_status();
    assert_eq!(s.rejected_count, U64(1));
    assert_eq!(s.accepted_count, U64(0));
    assert_eq!(s.last_nonce, U64(0), "a rejected call must not burn the nonce");
    assert_eq!(s.spent_today, U128(0));
    assert!(get_logs().join("\n").contains("\"event\":\"rejected\""));
    let r = &v.get_recent(Some(1))[0];
    assert_eq!(r.kind, ActivityKind::Rejected);
    assert_eq!(r.reason.as_deref(), Some("payee_not_allowed"));
}

// --- test 9 and key plumbing ---

#[test]
#[should_panic(expected = "allowance must be nonzero")]
fn rotate_rejects_zero_allowance() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    let _ = v.rotate_agent_key(key(), NearToken::from_yoctonear(0));
}

#[test]
fn rotate_tracks_key_and_recovers_from_max_nonce_griefing() {
    let mut v = setup();
    assert!(spend(&mut v, merchant(), 1, u64::MAX).ok);
    assert_rejected(spend(&mut v, merchant(), 1, 1), "bad_nonce");
    ctx(owner(), DAY, 10 * NEAR);
    let _ = v.rotate_agent_key(key(), NearToken::from_millinear(250));
    assert_eq!(v.get_status().agent_key, Some(key()));
    assert_eq!(v.get_status().last_nonce, U64(0));
    ctx(vault_id(), DAY, 10 * NEAR);
    assert!(spend(&mut v, merchant(), 1, 1).ok);
}

#[test]
fn revoke_clears_tracked_key() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    let _ = v.rotate_agent_key(key(), NearToken::from_millinear(250));
    let _ = v.revoke_agent_key(key());
    assert_eq!(v.get_status().agent_key, None);
    assert_eq!(v.get_recent(Some(1))[0].kind, ActivityKind::AgentKeyRevoked);
}

// --- withdraw ---

#[test]
fn withdraw_respects_storage_and_gas_reserve() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    let _ = v.withdraw(U128(9 * NEAR), owner());
    assert_eq!(v.get_recent(Some(1))[0].kind, ActivityKind::Withdraw);
}

#[test]
#[should_panic(expected = "amount exceeds balance")]
fn withdraw_rejects_full_balance() {
    let mut v = setup();
    ctx(owner(), DAY, 10 * NEAR);
    let _ = v.withdraw(U128(10 * NEAR), owner());
}

// --- test 10: bounded storage ---

#[test]
fn activity_buffer_caps_at_50_newest_first() {
    let mut v = setup();
    for n in 1..=60u64 {
        spend(&mut v, attacker(), 1, n);
    }
    let all = v.get_recent(None);
    assert_eq!(all.len(), 50);
    assert_eq!(all[0].nonce, Some(U64(60)));
    assert_eq!(all[49].nonce, Some(U64(11)));
    assert_eq!(v.get_recent(Some(3)).len(), 3);
    assert_eq!(v.get_recent(Some(999)).len(), 50);
    assert_eq!(v.get_status().rejected_count, U64(60));
}

#[test]
fn memo_is_truncated_on_char_boundary() {
    let mut v = setup();
    let memo = "é".repeat(100);
    assert!(v.agent_spend(merchant(), U128(1), U64(1), GOOD_HASH.into(), Some(memo)).ok);
    let stored = v.get_recent(Some(1))[0].memo.clone().unwrap();
    assert_eq!(stored.len(), 64);
    assert!(stored.chars().all(|c| c == 'é'));
}

#[test]
fn receipt_hash_helper() {
    assert!(is_valid_receipt_hash(GOOD_HASH));
    assert!(!is_valid_receipt_hash(&"0".repeat(64)));
}
