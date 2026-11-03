#!/usr/bin/env bash
# Arranca los emuladores de Firebase (acceso + base de datos) para probar las cuentas sin un proyecto real.
# Necesita Java 11 o superior. Lo usa la prueba: node pruebas/prueba-completa.cjs
#   herramientas/emuladores-firebase.sh
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx --yes firebase-tools@15 emulators:start --only auth,firestore --project demo-facturacion
