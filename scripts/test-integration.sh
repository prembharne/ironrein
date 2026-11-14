#!/usr/bin/env bash
# Builds the vault with cargo-near and runs the sandbox tests in a Linux container,
# so this works the same on Windows, macOS and Linux. Requires Docker.
# A plain `cargo build` is not an on-chain build: near-sdk needs cargo-near's cfg.
set -euo pipefail
cd "$(dirname "$0")/.."

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd -W 2>/dev/null || pwd):/work" \
  -v ironrein-cargo-registry:/usr/local/cargo/registry \
  -v ironrein-target:/target \
  -v ironrein-tools:/tools \
  -e CARGO_TARGET_DIR=/target \
  -w /work/contracts \
  rust:1.99-trixie bash -c '
    set -euo pipefail
    rustup target add wasm32-unknown-unknown >/dev/null 2>&1
    rustup component add rust-src >/dev/null 2>&1
    apt-get update -qq >/dev/null && apt-get install -qq -y pkg-config libssl-dev libudev-dev cmake clang >/dev/null
    export PATH="/tools/bin:$PATH"
    command -v cargo-near >/dev/null || cargo install cargo-near --locked --root /tools
    (cd vault && cargo near build non-reproducible-wasm --no-abi)
    export IRONREIN_WASM=/target/near/ironrein_vault.wasm
    ls -l "$IRONREIN_WASM"
    mkdir -p /work/contracts/out && cp "$IRONREIN_WASM" /work/contracts/out/ironrein_vault.wasm
    cd integration-tests && cargo test --release -- --nocapture --test-threads=2
  '
