//! Warden vault. Holds NEAR and only releases it to an AI agent through
//! `agent_spend`, which enforces the owner's policy on-chain.
//!
//! Policy violations return `SpendResult { ok: false, .. }` instead of panicking,
//! so every attempt is recorded on-chain and visible in the dashboard.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::json;
use near_sdk::{
    env, near, require, AccountId, Allowance, NearToken, Promise, PublicKey,
};

const NS_PER_DAY: u64 = 86_400_000_000_000;
const MAX_ACTIVITY: usize = 50;
/// Longest memo kept on-chain. A stolen agent key must not be able to bloat state.
const MAX_MEMO_BYTES: usize = 64;
/// Kept back on withdraw so the vault can still pay for gas after a full withdrawal.
const WITHDRAW_GAS_BUFFER: NearToken = NearToken::from_millinear(50);
const AGENT_METHOD: &str = "agent_spend";

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Policy {
    pub per_tx_cap: U128,
    pub daily_cap: U128,
    pub allowlist: Vec<AccountId>,
    /// Nanoseconds since epoch; 0 means never.
    pub expires_at: U64,
    pub min_reserve: U128,
}

impl Policy {
    fn deny_all() -> Self {
        Self {
            per_tx_cap: U128(0),
            daily_cap: U128(0),
            allowlist: vec![],
            expires_at: U64(0),
            min_reserve: U128(0),
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActivityKind {
    Spend,
    Rejected,
    PolicySet,
    Paused,
    Unpaused,
    AgentKeyRotated,
    AgentKeyRevoked,
    Withdraw,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Activity {
    pub kind: ActivityKind,
    pub ts: U64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payee: Option<AccountId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<U128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nonce: Option<U64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receipt_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl Activity {
    fn simple(kind: ActivityKind) -> Self {
        Self {
            kind,
            ts: U64(env::block_timestamp()),
            payee: None,
            amount: None,
            nonce: None,
            receipt_hash: None,
            memo: None,
            reason: None,
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpendResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VaultStatus {
    pub owner_id: AccountId,
    pub paused: bool,
    pub balance: U128,
    pub spent_today: U128,
    pub day_index: U64,
    pub last_nonce: U64,
    pub accepted_count: U64,
    pub rejected_count: U64,
    pub agent_key: Option<PublicKey>,
}

#[near(contract_state)]
#[derive(near_sdk::PanicOnDefault)]
pub struct Vault {
    owner_id: AccountId,
    policy: Policy,
    paused: bool,
    spent_today: u128,
    day_index: u64,
    last_nonce: u64,
    accepted_count: u64,
    rejected_count: u64,
    agent_key: Option<PublicKey>,
    activity: Vec<Activity>,
}

#[near]
impl Vault {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        require!(
            owner_id != env::current_account_id(),
            "owner must be a separate account from the vault"
        );
        Self {
            owner_id,
            policy: Policy::deny_all(),
            paused: false,
            spent_today: 0,
            day_index: env::block_timestamp() / NS_PER_DAY,
            last_nonce: 0,
            accepted_count: 0,
            rejected_count: 0,
            agent_key: None,
            activity: Vec::new(),
        }
    }

    #[payable]
    pub fn deposit(&mut self) {}

    pub fn set_policy(&mut self, policy: Policy) {
        self.assert_owner();
        require!(
            policy.daily_cap.0 >= policy.per_tx_cap.0,
            "daily_cap must be >= per_tx_cap"
        );
        self.policy = policy;
        self.emit("policy_set", json!({}));
        self.push(Activity::simple(ActivityKind::PolicySet));
    }

    pub fn pause(&mut self) {
        self.assert_owner();
        self.paused = true;
        self.emit("paused", json!({}));
        self.push(Activity::simple(ActivityKind::Paused));
    }

    pub fn unpause(&mut self) {
        self.assert_owner();
        self.paused = false;
        self.emit("unpaused", json!({}));
        self.push(Activity::simple(ActivityKind::Unpaused));
    }

    /// Replaces the agent key. Also resets `last_nonce`: otherwise a thief could
    /// spend once with nonce u64::MAX and block every future spend, even from a
    /// new key. Old transactions can't replay, because their signing key is gone.
    pub fn rotate_agent_key(&mut self, public_key: PublicKey, allowance: NearToken) -> Promise {
        self.assert_owner();
        // A contract-added key with allowance 0 would be UNLIMITED, so this is a hard stop.
        let limited = Allowance::limited(allowance);
        require!(limited.is_some(), "allowance must be nonzero");

        let previous = self.agent_key.replace(public_key.clone());
        self.last_nonce = 0;
        self.emit("agent_key_rotated", json!({ "public_key": public_key }));
        self.push(Activity::simple(ActivityKind::AgentKeyRotated));

        let mut promise = Promise::new(env::current_account_id());
        if let Some(old) = previous {
            promise = promise.delete_key(old);
        }
        promise.add_access_key_allowance(
            public_key,
            limited.unwrap(),
            env::current_account_id(),
            AGENT_METHOD.to_string(),
        )
    }

    pub fn revoke_agent_key(&mut self, public_key: PublicKey) -> Promise {
        self.assert_owner();
        if self.agent_key.as_ref() == Some(&public_key) {
            self.agent_key = None;
        }
        self.emit("agent_key_revoked", json!({ "public_key": public_key }));
        self.push(Activity::simple(ActivityKind::AgentKeyRevoked));
        Promise::new(env::current_account_id()).delete_key(public_key)
    }

    pub fn withdraw(&mut self, amount: U128, to: AccountId) -> Promise {
        self.assert_owner();
        let storage_cost = env::storage_byte_cost()
            .as_yoctonear()
            .saturating_mul(env::storage_usage() as u128);
        let available = env::account_balance()
            .as_yoctonear()
            .saturating_sub(storage_cost)
            .saturating_sub(WITHDRAW_GAS_BUFFER.as_yoctonear());
        require!(
            amount.0 <= available,
            "amount exceeds balance minus storage and gas reserve"
        );

        self.emit("withdraw", json!({ "to": to, "amount": amount }));
        self.push(Activity {
            payee: Some(to.clone()),
            amount: Some(amount),
            ..Activity::simple(ActivityKind::Withdraw)
        });
        Promise::new(to).transfer(NearToken::from_yoctonear(amount.0))
    }

    /// The only way the agent can move money. Only an authentication failure panics.
    pub fn agent_spend(
        &mut self,
        payee: AccountId,
        amount: U128,
        nonce: U64,
        receipt_hash: String,
        memo: Option<String>,
    ) -> SpendResult {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "only the agent key on this account can call agent_spend"
        );

        let now = env::block_timestamp();
        let today = now / NS_PER_DAY;
        if today != self.day_index {
            self.day_index = today;
            self.spent_today = 0;
        }

        let memo = memo.map(truncate_memo);
        let balance = env::account_balance().as_yoctonear();
        let reason = self.check_spend(now, &payee, amount.0, nonce.0, &receipt_hash, balance);

        if let Some(reason) = reason {
            self.rejected_count += 1;
            self.emit(
                "rejected",
                json!({ "payee": payee, "amount": amount, "nonce": nonce, "reason": reason }),
            );
            self.push(Activity {
                payee: Some(payee),
                amount: Some(amount),
                nonce: Some(nonce),
                reason: Some(reason.to_string()),
                ..Activity::simple(ActivityKind::Rejected)
            });
            return SpendResult { ok: false, reason: Some(reason.to_string()) };
        }

        self.last_nonce = nonce.0;
        self.spent_today += amount.0;
        self.accepted_count += 1;
        self.emit(
            "spend",
            json!({
                "payee": payee, "amount": amount, "nonce": nonce,
                "receipt_hash": receipt_hash, "memo": memo,
            }),
        );
        self.push(Activity {
            payee: Some(payee.clone()),
            amount: Some(amount),
            nonce: Some(nonce),
            receipt_hash: Some(receipt_hash),
            memo,
            ..Activity::simple(ActivityKind::Spend)
        });
        let _ = Promise::new(payee).transfer(NearToken::from_yoctonear(amount.0));
        SpendResult { ok: true, reason: None }
    }

    pub fn get_policy(&self) -> Policy {
        self.policy.clone()
    }

    pub fn get_status(&self) -> VaultStatus {
        VaultStatus {
            owner_id: self.owner_id.clone(),
            paused: self.paused,
            balance: U128(env::account_balance().as_yoctonear()),
            spent_today: U128(self.spent_today),
            day_index: U64(self.day_index),
            last_nonce: U64(self.last_nonce),
            accepted_count: U64(self.accepted_count),
            rejected_count: U64(self.rejected_count),
            agent_key: self.agent_key.clone(),
        }
    }

    /// Newest first, at most 50 entries.
    pub fn get_recent(&self, limit: Option<u32>) -> Vec<Activity> {
        let limit = limit.unwrap_or(MAX_ACTIVITY as u32).min(MAX_ACTIVITY as u32) as usize;
        self.activity.iter().rev().take(limit).cloned().collect()
    }
}

impl Vault {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "only the owner can call this method"
        );
    }

    fn check_spend(
        &self,
        now: u64,
        payee: &AccountId,
        amount: u128,
        nonce: u64,
        receipt_hash: &str,
        balance: u128,
    ) -> Option<&'static str> {
        if self.paused {
            return Some("paused");
        }
        if self.policy.expires_at.0 != 0 && now > self.policy.expires_at.0 {
            return Some("expired");
        }
        if !self.policy.allowlist.contains(payee) {
            return Some("payee_not_allowed");
        }
        if amount > self.policy.per_tx_cap.0 {
            return Some("over_per_tx_cap");
        }
        match self.spent_today.checked_add(amount) {
            Some(total) if total <= self.policy.daily_cap.0 => {}
            _ => return Some("over_daily_cap"),
        }
        if nonce <= self.last_nonce {
            return Some("bad_nonce");
        }
        if !is_valid_receipt_hash(receipt_hash) {
            return Some("bad_receipt_hash");
        }
        match balance.checked_sub(amount) {
            Some(rest) if rest >= self.policy.min_reserve.0 => None,
            _ => Some("below_reserve"),
        }
    }

    fn push(&mut self, item: Activity) {
        if self.activity.len() >= MAX_ACTIVITY {
            self.activity.remove(0);
        }
        self.activity.push(item);
    }

    fn emit(&self, event: &str, data: near_sdk::serde_json::Value) {
        let body = json!({
            "standard": "warden",
            "version": "1.0.0",
            "event": event,
            "data": [data],
        });
        env::log_str(&format!("EVENT_JSON:{body}"));
    }
}

/// Exactly 64 lowercase hex characters and not all zeros.
fn is_valid_receipt_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && hash.bytes().any(|b| b != b'0')
}

fn truncate_memo(mut memo: String) -> String {
    if memo.len() > MAX_MEMO_BYTES {
        let mut end = MAX_MEMO_BYTES;
        while !memo.is_char_boundary(end) {
            end -= 1;
        }
        memo.truncate(end);
    }
    memo
}

#[cfg(test)]
mod tests;
