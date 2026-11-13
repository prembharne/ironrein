//! Leash agent signer. Runs inside an OutLayer TEE and holds the vault's agent key, so the
//! key never sits on the machine that runs the model. It does exactly two things: report
//! the key's public half, and call `agent_spend` on the vault with it.
//!
//! This file is the logic that needs no host: parsing, validation and the call arguments.
//! `main.rs` wires it to OutLayer's `near:rpc` host functions.
//!
//! What this does not change: the key is still a classical Ed25519 function-call key, the
//! vault still enforces every limit, and whoever can call this function can still spend
//! inside the policy. It removes one thing: a copy of the key to steal from a laptop.

use ed25519_dalek::SigningKey;
use serde::{Deserialize, Serialize};

/// Secret generated inside the TEE. OutLayer reserves the `PROTECTED_` prefix for values
/// its keystore creates, so no person ever sees this one.
pub const KEY_ENV: &str = "PROTECTED_AGENT_KEY";
/// The only method this signer will ever call.
pub const METHOD: &str = "agent_spend";
/// Matches SPEND_GAS in apps/agent/src/chain.ts.
pub const GAS: &str = "30000000000000";
const MAX_MEMO: usize = 256;

#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Input {
    /// Report the agent key's public half, for the owner to register on the vault.
    PublicKey,
    /// Call `agent_spend` on `vault`, signed as the vault with the sealed key.
    Spend {
        vault: String,
        payee: String,
        amount: String,
        nonce: String,
        receipt_hash: String,
        memo: String,
    },
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(untagged)]
pub enum Output {
    PublicKey { public_key: String },
    /// `tx_hash` of the submitted call. The caller reads the vault's verdict from the chain.
    Submitted { tx_hash: String },
    Error { error: String },
}

/// Reads a key in NEAR format: `ed25519:` then base58 of the 32-byte seed, optionally
/// followed by the 32-byte public key.
pub fn parse_private_key(key: &str) -> Result<SigningKey, String> {
    let data = key.trim().strip_prefix("ed25519:").unwrap_or(key.trim());
    let bytes = bs58::decode(data).into_vec().map_err(|_| "agent key is not base58".to_string())?;
    if bytes.len() != 32 && bytes.len() != 64 {
        return Err(format!("agent key has {} bytes, expected 32 or 64", bytes.len()));
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&bytes[..32]);
    Ok(SigningKey::from_bytes(&seed))
}

/// NEAR format public key: `ed25519:` then base58 of the 32 bytes.
pub fn public_key(key: &SigningKey) -> String {
    format!("ed25519:{}", bs58::encode(key.verifying_key().as_bytes()).into_string())
}

/// NEAR format private key the host function expects: seed then public key, 64 bytes.
pub fn near_private_key(key: &SigningKey) -> String {
    let mut full = [0u8; 64];
    full[..32].copy_from_slice(&key.to_bytes());
    full[32..].copy_from_slice(key.verifying_key().as_bytes());
    format!("ed25519:{}", bs58::encode(full).into_string())
}

fn is_account_id(s: &str) -> bool {
    (2..=64).contains(&s.len())
        && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'-' | b'_'))
}

fn is_digits(s: &str, max_len: usize) -> bool {
    !s.is_empty() && s.len() <= max_len && s.bytes().all(|b| b.is_ascii_digit())
}

/// Checks a spend request and returns the JSON arguments for `agent_spend`.
/// The vault decides whether the spend is allowed. This only refuses malformed input.
pub fn spend_args(input: &Input) -> Result<(String, String), String> {
    let Input::Spend { vault, payee, amount, nonce, receipt_hash, memo } = input else {
        return Err("not a spend".to_string());
    };
    if !is_account_id(vault) {
        return Err("vault is not a NEAR account id".to_string());
    }
    if !is_account_id(payee) {
        return Err("payee is not a NEAR account id".to_string());
    }
    // u128 has at most 39 digits, u64 at most 20.
    if !is_digits(amount, 39) {
        return Err("amount must be yoctoNEAR digits".to_string());
    }
    if !is_digits(nonce, 20) {
        return Err("nonce must be digits".to_string());
    }
    if receipt_hash.len() != 64 || !receipt_hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("receipt_hash must be 64 hex characters".to_string());
    }
    if memo.len() > MAX_MEMO {
        return Err("memo is too long".to_string());
    }
    let args = serde_json::json!({
        "payee": payee,
        "amount": amount,
        "nonce": nonce,
        "receipt_hash": receipt_hash,
        "memo": memo,
    });
    Ok((vault.clone(), args.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test key only: seed bytes 1..=32. Never used on any chain.
    fn test_key() -> SigningKey {
        let mut seed = [0u8; 32];
        for (i, b) in seed.iter_mut().enumerate() {
            *b = i as u8 + 1;
        }
        SigningKey::from_bytes(&seed)
    }

    fn spend() -> Input {
        Input::Spend {
            vault: "vault.testnet".into(),
            payee: "merchant.testnet".into(),
            amount: "100000000000000000000000".into(),
            nonce: "7".into(),
            receipt_hash: "ab".repeat(32),
            memo: "report".into(),
        }
    }

    #[test]
    fn key_round_trips_through_near_format() {
        let key = test_key();
        let near = near_private_key(&key);
        assert!(near.starts_with("ed25519:"));
        assert_eq!(parse_private_key(&near).unwrap().to_bytes(), key.to_bytes());
        // A bare 32-byte seed is accepted too.
        let seed_only = format!("ed25519:{}", bs58::encode(key.to_bytes()).into_string());
        assert_eq!(parse_private_key(&seed_only).unwrap().to_bytes(), key.to_bytes());
    }

    #[test]
    fn public_key_is_the_32_byte_ed25519_key() {
        let pk = public_key(&test_key());
        let bytes = bs58::decode(pk.strip_prefix("ed25519:").unwrap()).into_vec().unwrap();
        assert_eq!(bytes, test_key().verifying_key().as_bytes());
    }

    #[test]
    fn bad_keys_are_refused() {
        assert!(parse_private_key("ed25519:0OIl").is_err());
        assert!(parse_private_key("ed25519:abc").is_err());
    }

    #[test]
    fn input_parses_both_operations() {
        assert_eq!(serde_json::from_str::<Input>(r#"{"op":"public_key"}"#).unwrap(), Input::PublicKey);
        let json = format!(
            r#"{{"op":"spend","vault":"vault.testnet","payee":"merchant.testnet","amount":"100000000000000000000000","nonce":"7","receipt_hash":"{}","memo":"report"}}"#,
            "ab".repeat(32)
        );
        assert_eq!(serde_json::from_str::<Input>(&json).unwrap(), spend());
        assert!(serde_json::from_str::<Input>(r#"{"op":"withdraw"}"#).is_err());
    }

    #[test]
    fn spend_args_match_the_contract_method() {
        let (vault, args) = spend_args(&spend()).unwrap();
        assert_eq!(vault, "vault.testnet");
        let v: serde_json::Value = serde_json::from_str(&args).unwrap();
        assert_eq!(v["payee"], "merchant.testnet");
        assert_eq!(v["amount"], "100000000000000000000000");
        assert_eq!(v["nonce"], "7");
        assert_eq!(v["receipt_hash"], "ab".repeat(32));
        assert_eq!(v["memo"], "report");
        assert_eq!(v.as_object().unwrap().len(), 5);
    }

    #[test]
    fn malformed_spends_are_refused() {
        let with = |f: fn(&mut Input)| {
            let mut s = spend();
            f(&mut s);
            spend_args(&s)
        };
        assert!(with(|s| if let Input::Spend { amount, .. } = s { *amount = "1.5".into() }).is_err());
        assert!(with(|s| if let Input::Spend { amount, .. } = s { *amount = "-1".into() }).is_err());
        assert!(with(|s| if let Input::Spend { nonce, .. } = s { *nonce = "".into() }).is_err());
        assert!(with(|s| if let Input::Spend { receipt_hash, .. } = s { *receipt_hash = "abc".into() }).is_err());
        assert!(with(|s| if let Input::Spend { payee, .. } = s { *payee = "Bad Name".into() }).is_err());
        assert!(with(|s| if let Input::Spend { vault, .. } = s { *vault = "x".into() }).is_err());
        assert!(with(|s| if let Input::Spend { memo, .. } = s { *memo = "m".repeat(257) }).is_err());
        assert!(spend_args(&Input::PublicKey).is_err());
    }

    #[test]
    fn outputs_serialize_flat() {
        assert_eq!(
            serde_json::to_string(&Output::Submitted { tx_hash: "abc".into() }).unwrap(),
            r#"{"tx_hash":"abc"}"#
        );
        assert_eq!(
            serde_json::to_string(&Output::Error { error: "no".into() }).unwrap(),
            r#"{"error":"no"}"#
        );
    }
}
