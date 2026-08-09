#!/bin/bash

# Environment Wrapper for Chrome Native Messaging Host
# Ensures node and yt-dlp are found regardless of Chrome GUI environment PATH

NODE_BIN="/Users/mac-aref/.nvm/versions/node/v24.14.1/bin/node"
if [ ! -f "$NODE_BIN" ]; then
    NODE_BIN="$(which node 2>/dev/null || echo "node")"
fi

export PATH="/Users/mac-aref/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec "$NODE_BIN" "$SCRIPT_DIR/native-host.js" "$@"
