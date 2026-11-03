#!/usr/bin/env bash
# Rehace vendor/firebase.mjs: el SDK de Firebase (acceso con contraseña + Firestore) en un solo archivo para el navegador.
# Las funciones que se incluyen están en herramientas/firebase-entrada.mjs. Se usa initializeAuth (no getAuth) para que
# no cargue scripts de Google para iniciar sesión con ventanas emergentes: la app no los necesita.
#   herramientas/empaquetar-firebase.sh
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --no-audit --no-fund firebase@13 esbuild >/dev/null
cp "$RAIZ/herramientas/firebase-entrada.mjs" entrada.mjs
npx esbuild entrada.mjs --bundle --format=esm --platform=browser --minify --legal-comments=eof --outfile="$RAIZ/vendor/firebase.mjs"
python3 -c "import json;print('Firebase', json.load(open('node_modules/firebase/package.json'))['version'])"
