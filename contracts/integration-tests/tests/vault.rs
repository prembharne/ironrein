//! Runs the compiled vault on a real sandbox node, signing with a real
//! function-call key. Set LEASH_WASM to the built contract path.

use near_workspaces::network::Sandbox;
use near_workspaces::types::{KeyType, NearToken, SecretKey};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const HASH: &str = "ab00000000000000000000000000000000000000000000000000000000000001";

fn near(n: u128) -> String { (n * 10u128.pow(24)).to_string() }
fn half_near() -> String { (5 * 10u128.pow(23)).to_string() }

struct Env {
    worker: Worker<Sandbox>,
    vault: Contract,
    owner: Account,
    merchant: Account,
    attacker: Account,
    agent_sk: SecretKey,
    agent: Account,
}

async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let path = std::env::var("LEASH_WASM").expect("set LEASH_WASM to the built contract");
    let wasm = std::fs::read(path)?;
    let root = worker.root_account()?;
    let new_acct = |name: &'static str, balance: u128| {
        let root = root.clone();
        async move {
            let r = root
                .create_subaccount(name)
                .initial_balance(NearToken::from_near(balance))
                .transact()
                .await?;
            anyhow::Ok(r.into_result()?)
        }
    };
    let owner = new_acct("owner", 20).await?;
    let merchant = new_acct("merchant", 1).await?;
    let attacker = new_acct("attacker", 1).await?;
    let vault_acct = new_acct("vault", 15).await?;
    let vault = vault_acct.deploy(&wasm).await?.into_result()?;

    vault
        .call("new")
        .args_json(json!({ "owner_id": owner.id() }))
        .transact()
        .await?
        .into_result()?;
    owner
        .call(vault.id(), "set_policy")
        .args_json(json!({ "policy": {
            "per_tx_cap": half_near(),
            "daily_cap": near(2),
            "allowlist": [merchant.id()],
            "expires_at": "0",
            "min_reserve": half_near(),
        }}))
        .transact()
        .await?
        .into_result()?;

    let agent_sk = SecretKey::from_random(KeyType::ED25519);
    owner
        .call(vault.id(), "rotate_agent_key")
        .args_json(json!({
            "public_key": agent_sk.public_key(),
            "allowance": (25 * 10u128.pow(22)).to_string(),
        }))
        .transact()
        .await?
        .into_result()?;
    let agent = Account::from_secret_key(vault.id().clone(), agent_sk.clone(), &worker);
    Ok(Env { worker, vault, owner, merchant, attacker, agent_sk, agent })
}

impl Env {
    async fn spend(&self, payee: &Account, amount: String, nonce: u64) -> anyhow::Result<Value> {
        let r = self
            .agent
            .call(self.vault.id(), "agent_spend")
            .args_json(json!({
                "payee": payee.id(), "amount": amount, "nonce": nonce.to_string(),
                "receipt_hash": HASH, "memo": "t",
            }))
            .gas(near_workspaces::types::Gas::from_tgas(50))
            .transact()
            .await?;
        anyhow::Ok(r.into_result()?.json()?)
    }

    async fn status(&self) -> anyhow::Result<Value> {
        Ok(self.vault.view("get_status").await?.json()?)
    }
}

#[tokio::test]
async fn real_key_spends_within_policy_and_funds_move() -> anyhow::Result<()> {
    let e = setup().await?;
    let before = e.merchant.view_account().await?.balance;
    let v_before = e.vault.view_account().await?.balance;

    let r = e
        .agent
        .call(e.vault.id(), "agent_spend")
        .args_json(json!({
            "payee": e.merchant.id(), "amount": half_near(), "nonce": "1",
            "receipt_hash": HASH, "memo": "report-1",
        }))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;
    println!("GAS agent_spend success: {} ", r.total_gas_burnt);
    let out: Value = r.into_result()?.json()?;
    assert_eq!(out["ok"], true);

    let after = e.merchant.view_account().await?.balance;
    assert_eq!(after.as_yoctonear() - before.as_yoctonear(), 5 * 10u128.pow(23));
    assert!(e.vault.view_account().await?.balance < v_before);
    assert_eq!(e.status().await?["accepted_count"], "1");
    Ok(())
}

#[tokio::test]
async fn prompt_injection_payee_rejected_on_real_node() -> anyhow::Result<()> {
    let e = setup().await?;
    let before = e.attacker.view_account().await?.balance;
    let r = e
        .agent
        .call(e.vault.id(), "agent_spend")
        .args_json(json!({
            "payee": e.attacker.id(), "amount": near(14), "nonce": "1",
            "receipt_hash": HASH,
        }))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;
    println!("GAS agent_spend rejected: {}", r.total_gas_burnt);
    let out: Value = r.into_result()?.json()?;
    assert_eq!(out, json!({ "ok": false, "reason": "payee_not_allowed" }));
    assert_eq!(e.attacker.view_account().await?.balance, before);
    let recent: Value = e.vault.view("get_recent").args_json(json!({"limit": 1})).await?.json()?;
    assert_eq!(recent[0]["kind"], "rejected");
    Ok(())
}

#[tokio::test]
async fn stolen_key_loss_is_bounded_by_daily_cap() -> anyhow::Result<()> {
    let e = setup().await?;
    let before = e.merchant.view_account().await?.balance.as_yoctonear();
    for n in 1..=4 {
        assert_eq!(e.spend(&e.merchant, half_near(), n).await?["ok"], true);
    }
    let fifth = e.spend(&e.merchant, half_near(), 5).await?;
    assert_eq!(fifth["reason"], "over_daily_cap");
    let gained = e.merchant.view_account().await?.balance.as_yoctonear() - before;
    assert_eq!(gained, 2 * 10u128.pow(24));
    Ok(())
}

#[tokio::test]
async fn function_call_key_cannot_reach_other_methods() -> anyhow::Result<()> {
    let e = setup().await?;
    for (method, args) in [
        ("pause", json!({})),
        ("unpause", json!({})),
        ("deposit", json!({})),
        ("set_policy", json!({ "policy": {
            "per_tx_cap": near(10), "daily_cap": near(10), "allowlist": [e.attacker.id()],
            "expires_at": "0", "min_reserve": "0" }})),
        ("withdraw", json!({ "amount": near(1), "to": e.attacker.id() })),
        ("rotate_agent_key", json!({ "public_key": e.agent_sk.public_key(), "allowance": "1" })),
        ("revoke_agent_key", json!({ "public_key": e.agent_sk.public_key() })),
    ] {
        let r = e.agent.call(e.vault.id(), method).args_json(args).transact().await;
        let failed = match r {
            Err(_) => true,
            Ok(o) => o.is_failure(),
        };
        assert!(failed, "function-call key must not be able to call {method}");
    }
    assert_eq!(e.status().await?["paused"], false);
    Ok(())
}

#[tokio::test]
async fn function_call_key_cannot_attach_deposit_or_transfer() -> anyhow::Result<()> {
    let e = setup().await?;
    let with_deposit = e
        .agent
        .call(e.vault.id(), "agent_spend")
        .args_json(json!({
            "payee": e.merchant.id(), "amount": "1", "nonce": "1", "receipt_hash": HASH,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await;
    assert!(match with_deposit { Err(_) => true, Ok(o) => o.is_failure() });

    let transfer = e.agent.transfer_near(e.attacker.id(), NearToken::from_near(1)).await;
    assert!(match transfer { Err(_) => true, Ok(o) => o.is_failure() });
    Ok(())
}

#[tokio::test]
async fn revoked_key_stops_working() -> anyhow::Result<()> {
    let e = setup().await?;
    e.owner
        .call(e.vault.id(), "revoke_agent_key")
        .args_json(json!({ "public_key": e.agent_sk.public_key() }))
        .transact()
        .await?
        .into_result()?;
    assert!(e.spend(&e.merchant, "1".into(), 1).await.is_err());
    assert_eq!(e.status().await?["agent_key"], Value::Null);
    Ok(())
}

#[tokio::test]
async fn pause_blocks_real_spend_then_unpause_restores() -> anyhow::Result<()> {
    let e = setup().await?;
    e.owner.call(e.vault.id(), "pause").transact().await?.into_result()?;
    assert_eq!(e.spend(&e.merchant, "1".into(), 1).await?["reason"], "paused");
    e.owner.call(e.vault.id(), "unpause").transact().await?.into_result()?;
    assert_eq!(e.spend(&e.merchant, "1".into(), 1).await?["ok"], true);
    Ok(())
}

#[tokio::test]
async fn rotate_removes_old_key_and_rejects_zero_allowance() -> anyhow::Result<()> {
    let e = setup().await?;
    let zero = e
        .owner
        .call(e.vault.id(), "rotate_agent_key")
        .args_json(json!({
            "public_key": SecretKey::from_random(KeyType::ED25519).public_key(),
            "allowance": "0",
        }))
        .transact()
        .await?;
    assert!(zero.is_failure());

    let new_sk = SecretKey::from_random(KeyType::ED25519);
    e.owner
        .call(e.vault.id(), "rotate_agent_key")
        .args_json(json!({
            "public_key": new_sk.public_key(),
            "allowance": (25 * 10u128.pow(22)).to_string(),
        }))
        .transact()
        .await?
        .into_result()?;

    assert!(e.spend(&e.merchant, "1".into(), 1).await.is_err(), "old key must be gone");
    let new_agent = Account::from_secret_key(e.vault.id().clone(), new_sk, &e.worker);
    let out: Value = new_agent
        .call(e.vault.id(), "agent_spend")
        .args_json(json!({
            "payee": e.merchant.id(), "amount": "1", "nonce": "1", "receipt_hash": HASH,
        }))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?
        .into_result()?
        .json()?;
    assert_eq!(out["ok"], true);
    Ok(())
}

#[tokio::test]
async fn owner_withdraw_moves_funds() -> anyhow::Result<()> {
    let e = setup().await?;
    let before = e.owner.view_account().await?.balance.as_yoctonear();
    e.owner
        .call(e.vault.id(), "withdraw")
        .args_json(json!({ "amount": near(1), "to": e.owner.id() }))
        .transact()
        .await?
        .into_result()?;
    assert!(e.owner.view_account().await?.balance.as_yoctonear() > before);
    let too_much = e
        .owner
        .call(e.vault.id(), "withdraw")
        .args_json(json!({ "amount": near(1000), "to": e.owner.id() }))
        .transact()
        .await?;
    assert!(too_much.is_failure());
    Ok(())
}
