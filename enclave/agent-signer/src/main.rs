//! Enclave entry point. Reads one JSON request on stdin, writes one JSON reply on stdout.
//! Build: cargo build --target wasm32-wasip2 --release
//!
//! The key is read from the environment, where OutLayer puts decrypted secrets. It is
//! never printed and never leaves this process except as the signer argument of the one
//! host call below.

#[cfg(target_arch = "wasm32")]
mod enclave {
    use ironrein_agent_signer::{near_private_key, parse_private_key, public_key, spend_args, Input, Output, GAS, KEY_ENV, METHOD};
    use std::io::{self, Read, Write};

    wit_bindgen::generate!({
        world: "agent-signer",
        path: "wit",
    });

    fn handle(raw: &str) -> Output {
        let input: Input = match serde_json::from_str(raw) {
            Ok(i) => i,
            Err(_) => return Output::Error { error: "input must be {\"op\":\"public_key\"} or a spend".into() },
        };
        let key = match std::env::var(KEY_ENV).map_err(|_| format!("{KEY_ENV} is not set")).and_then(|k| parse_private_key(&k)) {
            Ok(k) => k,
            Err(error) => return Output::Error { error },
        };
        match input {
            Input::PublicKey => Output::PublicKey { public_key: public_key(&key) },
            spend => {
                let (vault, args) = match spend_args(&spend) {
                    Ok(v) => v,
                    Err(error) => return Output::Error { error },
                };
                // Signed as the vault, sent to the vault, method fixed, no deposit. NEAR also
                // enforces this: the key is a function-call key limited to agent_spend.
                let (tx_hash, error) =
                    near::rpc::api::call(&vault, &near_private_key(&key), &vault, METHOD, &args, "0", GAS, "FINAL");
                if error.is_empty() {
                    Output::Submitted { tx_hash }
                } else {
                    Output::Error { error }
                }
            }
        }
    }

    pub fn run() {
        let mut raw = String::new();
        let output = match io::stdin().read_to_string(&mut raw) {
            Ok(_) => handle(&raw),
            Err(_) => Output::Error { error: "could not read input".into() },
        };
        let json = serde_json::to_string(&output).unwrap_or_else(|_| "{\"error\":\"could not encode output\"}".into());
        print!("{json}");
        let _ = io::stdout().flush();
    }
}

fn main() {
    #[cfg(target_arch = "wasm32")]
    enclave::run();
    #[cfg(not(target_arch = "wasm32"))]
    eprintln!("This binary only does something when built for wasm32-wasip2 and run by OutLayer.");
}
