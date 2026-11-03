#!/usr/bin/env python3
"""Pone una contraseña nueva a un usuario de la app (por si la ha olvidado y su usuario no es un correo).

Lo usa quien gestiona el proyecto de Firebase. Se ejecuta en Google Cloud Shell (https://shell.cloud.google.com),
que ya tiene la sesión de la cuenta de Google dueña del proyecto:

    python3 cambiar-clave.py <id-del-proyecto> <usuario> <contraseña-nueva>

Con los emuladores de Firebase (pruebas):

    EMULADOR=1 python3 herramientas/cambiar-clave.py demo-facturacion fran clave-nueva
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

DOMINIO_USUARIOS = 'usuarios.facturacion.app'   # el mismo que en index.html


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    proyecto, usuario, clave = sys.argv[1], sys.argv[2].strip().lower(), sys.argv[3]
    if len(clave) < 6:
        sys.exit('La contraseña debe tener al menos 6 caracteres.')
    correo = usuario if '@' in usuario else f'{usuario}@{DOMINIO_USUARIOS}'
    if os.environ.get('EMULADOR'):
        base, token = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com', 'owner'
        abrir = urllib.request.build_opener(urllib.request.ProxyHandler({})).open
    else:
        base = 'https://identitytoolkit.googleapis.com'
        token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
        abrir = urllib.request.urlopen

    def llamar(metodo, datos):
        peticion = urllib.request.Request(
            f'{base}/v1/projects/{proyecto}/{metodo}', data=json.dumps(datos).encode(),
            headers={'Authorization': f'Bearer {token}', 'x-goog-user-project': proyecto, 'Content-Type': 'application/json'})
        try:
            with abrir(peticion) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            sys.exit(f'Error de Firebase ({e.code}): {e.read().decode(errors="replace")}')

    usuarios = llamar('accounts:lookup', {'email': [correo]}).get('users') or []
    if not usuarios:
        sys.exit(f'No existe el usuario «{usuario}» ({correo}).')
    llamar('accounts:update', {'localId': usuarios[0]['localId'], 'password': clave})
    print(f'Contraseña cambiada para «{usuario}». Ya puede entrar con la nueva.')


if __name__ == '__main__':
    main()
