#!/usr/bin/env bash
# Comprueba el proyecto de Firebase REAL de config-nube.js: crea una cuenta de prueba, guarda y lee una factura,
# comprueba que las reglas bloquean los datos de otros y lo borra todo al terminar.
#   herramientas/comprobar-firebase.sh
set -uo pipefail
cd "$(dirname "$0")/.."
KEY=$(grep -o "apiKey: '[^']*'" config-nube.js | cut -d"'" -f2)
P=$(grep -o "projectId: '[^']*'" config-nube.js | cut -d"'" -f2)
[ -n "$KEY" ] && [ -n "$P" ] || { echo "config-nube.js no tiene un proyecto de Firebase"; exit 1; }
FS="https://firestore.googleapis.com/v1/projects/$P/databases/(default)/documents"
EMAIL="prueba-$RANDOM$RANDOM@example.com"; CLAVE="clave-$RANDOM$RANDOM"
fallos=0
ver() { if [ "$2" = "$3" ]; then echo "  ✔ $1 ($2)"; else echo "  ✘ $1 ($2, se esperaba $3)"; fallos=$((fallos+1)); fi; }
echo "Proyecto: $P"
R=$(curl -sS -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$CLAVE\",\"returnSecureToken\":true}")
if ! echo "$R" | grep -q idToken; then echo "  ✘ crear cuenta: $R"; echo "  (¿Authentication → Correo electrónico/contraseña habilitado?)"; exit 1; fi
TOK=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['idToken'])")
UIDP=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['localId'])")
echo "  ✔ crear cuenta con correo y contraseña"
ver "entrar con la contraseña" "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$KEY" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$CLAVE\",\"returnSecureToken\":true}")" 200
ver "guardar una factura propia" "$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH "$FS/usuarios/$UIDP/facturas/prueba" -H "Authorization: Bearer $TOK" -H 'content-type: application/json' -d '{"fields":{"id":{"stringValue":"prueba"}}}')" 200
ver "leer sus facturas" "$(curl -sS -o /dev/null -w '%{http_code}' "$FS/usuarios/$UIDP/facturas" -H "Authorization: Bearer $TOK")" 200
ver "reglas: leer datos de otro usuario" "$(curl -sS -o /dev/null -w '%{http_code}' "$FS/usuarios/otro-usuario/facturas" -H "Authorization: Bearer $TOK")" 403
ver "reglas: leer sin sesión" "$(curl -sS -o /dev/null -w '%{http_code}' "$FS/usuarios/$UIDP/facturas")" 403
ver "reglas: colección no permitida" "$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH "$FS/usuarios/$UIDP/otra/x" -H "Authorization: Bearer $TOK" -H 'content-type: application/json' -d '{"fields":{}}')" 403
ver "limpieza: borrar la factura" "$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$FS/usuarios/$UIDP/facturas/prueba" -H "Authorization: Bearer $TOK")" 200
ver "limpieza: borrar la cuenta de prueba" "$(curl -sS -o /dev/null -w '%{http_code}' -X POST "https://identitytoolkit.googleapis.com/v1/accounts:delete?key=$KEY" -H 'content-type: application/json' -d "{\"idToken\":\"$TOK\"}")" 200
[ "$fallos" = 0 ] && echo "Firebase correcto ✔" || { echo "$fallos comprobación(es) FALLIDA(S)"; exit 1; }
