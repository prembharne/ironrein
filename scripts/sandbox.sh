#!/usr/bin/env bash
# Starts a local NEAR node on localhost:3030 for end-to-end testing. Requires Docker,
# and scripts/test-integration.sh to have run once (it downloads the node binary).
#   scripts/sandbox.sh        start
#   scripts/sandbox.sh stop   stop and discard the chain
set -euo pipefail

if [ "${1:-}" = "stop" ]; then
  docker rm -f warden-sandbox >/dev/null 2>&1 || true
  exit 0
fi

docker rm -f warden-sandbox >/dev/null 2>&1 || true
MSYS_NO_PATHCONV=1 docker run -d --name warden-sandbox -p 3030:3030 -v warden-target:/target:ro rust:1.99-trixie bash -c '
  BIN=$(ls -d /target/release/build/near-sandbox-*/out/.near/near-sandbox-*/near-sandbox | head -1)
  "$BIN" --home /tmp/near init >/dev/null 2>&1
  exec "$BIN" --home /tmp/near run
' >/dev/null

for _ in $(seq 1 60); do
  if curl -s -m 2 -X POST http://localhost:3030 -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"status","params":[]}' | grep -q protocol_version; then
    echo "Sandbox is up on http://localhost:3030"
    exit 0
  fi
  sleep 2
done
echo "Sandbox did not start:" >&2
docker logs --tail 20 warden-sandbox >&2
exit 1
