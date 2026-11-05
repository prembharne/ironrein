#!/usr/bin/env bash
# Builds the vault wasm and runs the sandbox tests in a Linux container, so this
# works the same on Windows, macOS and Linux. Requires Docker.
set -euo pipefail
cd "$(dirname "$0")/.."

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd -W 2>/dev/null || pwd):/work" \
  -v warden-cargo-registry:/usr/local/cargo/registry \
  -v warden-target:/target \
  -e CARGO_TARGET_DIR=/target \
  -w /work/contracts \
  rust:1.91-bookworm bash -c '
    set -euo pipefail
    rustup target add wasm32-unknown-unknown >/dev/null 2>&1
    apt-get update -qq >/dev/null && apt-get install -qq -y pkg-config libssl-dev libudev-dev >/dev/null
    (cd vault && RUSTFLAGS="-C link-arg=-s" cargo build --release --target wasm32-unknown-unknown --lib)
    export WARDEN_WASM=/target/wasm32-unknown-unknown/release/warden_vault.wasm
    ls -l "$WARDEN_WASM"
    mkdir -p /work/contracts/out && cp "$WARDEN_WASM" /work/contracts/out/warden_vault.wasm
    cd integration-tests && cargo test --release -- --nocapture --test-threads=2
  '
