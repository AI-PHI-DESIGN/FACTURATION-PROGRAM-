# Cuentas: usuario y contraseña por persona

Con las cuentas activadas, cada persona (Fran, tu madre…) entra con **su usuario y su contraseña** y tiene
**todas sus empresas, clientes y facturas** en cualquier móvil u ordenador. Si cambia algo en el móvil, aparece solo
en el ordenador. Sin internet se puede seguir trabajando: los cambios se suben al volver la conexión.

Los datos se guardan en **Firebase** (de Google): el acceso con contraseña es *Firebase Authentication* y los datos
van en *Cloud Firestore*. Para el uso de esta app, el plan gratuito (**Spark**) sobra y no pide tarjeta.

Mientras no se haga lo de abajo, la app sigue **sin cuentas**, como hasta ahora (los datos en cada dispositivo).

![Pantalla de acceso](capturas/movil-0-acceso.png)

## Activarlas (una sola vez, unos 10 minutos)

1. Entra en **https://console.firebase.google.com** con tu cuenta de Google → **Crear un proyecto**.
   - Nombre: por ejemplo `facturacion`. Google Analytics: **no hace falta**.
2. **Authentication** → **Comenzar** → pestaña **Método de inicio de sesión** → **Correo electrónico/contraseña** →
   **Habilitar** → Guardar. (El «Vínculo de correo electrónico» no hace falta).
3. **Firestore Database** → **Crear base de datos**:
   - Ubicación: una de Europa, por ejemplo `europe-southwest1` (Madrid). **No se puede cambiar después.**
   - Modo: **producción**.
4. En Firestore, pestaña **Reglas**: borra lo que hay, pega el contenido de [`firestore.rules`](../firestore.rules) y
   pulsa **Publicar**. Estas reglas hacen que **cada usuario solo pueda leer y escribir sus propios datos**.
5. **⚙ Configuración del proyecto** → **Tus apps** → icono **`</>`** (Web) → nombre `Facturación` → **Registrar app**
   (sin Firebase Hosting). Sale un bloque `firebaseConfig` con `apiKey`, `authDomain`, `projectId`, `appId`…
6. **Pásale ese bloque a Claude**, o pégalo tú en [`config-nube.js`](../config-nube.js):

   ```js
   window.CONFIG_NUBE = {
     firebase: {
       apiKey: 'AIza…',
       authDomain: 'facturacion-xxxx.firebaseapp.com',
       projectId: 'facturacion-xxxx',
       appId: '1:…:web:…',
     },
     permitirRegistro: true,
   };
   ```

   Estos datos **no son secretos** (van dentro de cualquier app web de Firebase) y se pueden subir al repositorio
   público. Lo que protege la información son las reglas del paso 4 y las contraseñas.
7. Al publicarlo, la app pide usuario y contraseña. Cada persona pulsa **Crear cuenta** la primera vez.
   - Si en ese móvil ya había facturas de antes, la app pregunta si se pasan a la cuenta.
8. **Recomendado:** cuando ya estén creadas las cuentas de todos, cierra la puerta a cuentas nuevas:
   - en `config-nube.js`, `permitirRegistro: false` (quita el botón «Crear cuenta»);
   - y en Firebase: **Authentication → Configuración → Acciones del usuario** → desmarca **Habilitar creación
     (registro)**. Esto es lo que lo impide de verdad. Las cuentas nuevas se crean entonces en
     **Authentication → Usuarios → Agregar usuario**, con el correo `nombre@usuarios.facturacion.app`.

## El usuario

- Puede ser **un nombre** (`fran`, `mama`…): letras y números, sin espacios. Por dentro se convierte en
  `fran@usuarios.facturacion.app`; ese correo no existe y no se envía nada.
- O **un correo de verdad**. Así, si se olvida la contraseña, el botón **«¿Has olvidado la contraseña?»** manda un
  enlace para poner otra.

## Si alguien olvida la contraseña

- **Si su usuario es un correo:** pantalla de acceso → **¿Has olvidado la contraseña?**
- **Si su usuario es un nombre:** quien gestiona el proyecto de Firebase le pone una nueva:
  1. Abre **https://shell.cloud.google.com** con la cuenta de Google dueña del proyecto.
  2. Sube [`herramientas/cambiar-clave.py`](../herramientas/cambiar-clave.py) (menú ⋮ → Subir) y ejecuta:

     ```bash
     python3 cambiar-clave.py facturacion-xxxx fran contraseña-nueva
     ```

- Una vez dentro, cada uno puede cambiar su contraseña en **Ajustes → Mi cuenta → Cambiar contraseña**.

## Cómo funciona (para desarrolladores)

- **Datos:** `usuarios/{uid}` (los ajustes) y `usuarios/{uid}/empresas|clientes|facturas/{id}`: un documento por
  registro, con el mismo formato que la copia de seguridad.
- **Sin internet:** Firestore guarda una copia en el dispositivo (`persistentLocalCache`) y la app otra en
  `localStorage` (`facturacion.datos.u.<uid>`), para que se vea al instante. Los cambios hechos sin conexión se
  suben solos.
- **Guardar:** `guardarDatos()` compara cada registro con lo último que hay en la nube y sube solo lo que ha cambiado
  (y borra lo que ya no está), en lotes de hasta 400 operaciones.
- **Tiempo real:** `onSnapshot` en cada colección. Los formularios a medio rellenar no se tocan.
- **Cerrar sesión:** espera a que se suba lo pendiente, borra la copia del dispositivo y vuelve a la pantalla de
  acceso.
- **SDK:** `vendor/firebase.mjs` (Firebase 13, Apache 2.0), hecho con `herramientas/empaquetar-firebase.sh`. Se usa
  `initializeAuth` y no `getAuth`, para no cargar scripts de Google que no hacen falta.
- **Pruebas:** la sección 17 de `pruebas/prueba-completa.cjs` usa los **emuladores** de Firebase
  (`herramientas/emuladores-firebase.sh`, necesita Java 11+). La configuración de prueba se pone en
  `localStorage['facturacion.nube.prueba']`.
