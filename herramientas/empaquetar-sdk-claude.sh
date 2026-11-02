#!/usr/bin/env bash
# Rehace vendor/anthropic-sdk.mjs: el SDK oficial de Claude (@anthropic-ai/sdk) en un solo archivo para el navegador.
#   herramientas/empaquetar-sdk-claude.sh
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --no-audit --no-fund @anthropic-ai/sdk esbuild >/dev/null
printf 'export { default } from "@anthropic-ai/sdk";\nexport * from "@anthropic-ai/sdk";\n' > entrada.mjs
npx esbuild entrada.mjs --bundle --format=esm --platform=browser --minify --legal-comments=eof --outfile="$RAIZ/vendor/anthropic-sdk.mjs"
cp node_modules/@anthropic-ai/sdk/LICENSE "$RAIZ/vendor/LICENSE-anthropic-sdk.txt"
python3 -c "import json;print('SDK', json.load(open('node_modules/@anthropic-ai/sdk/package.json'))['version'])"
