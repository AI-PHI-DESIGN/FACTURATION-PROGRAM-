# Cómo se hizo (receta para repetirlo igual)

Este documento recoge **el proceso y las decisiones** de este proyecto. Si se vuelve a pedir “un programa de
facturación”, “que sea una app” o, en general, una app a partir de notas de voz, se sigue esta misma receta.

## Resumen en una línea

**Audios → requisitos → app web instalable (PWA) en un `index.html` sin compilación → prueba de punta a punta
con Playwright (ordenador + móvil + sin internet) → GitHub Pages → enlace para reenviar.** Si se piden cuentas
con usuario y contraseña: **Firebase (Auth + Firestore) activable con `config-nube.js`, probado con los emuladores**.

## 1. Entender el encargo a partir de los audios

1. **Transcribir los audios en local** con Whisper:

   ```bash
   herramientas/transcribir-audios.sh audio1.ogg audio2.ogg
   ```

   - Usa `faster-whisper` con el modelo `small`, en español, con un *prompt* de vocabulario del tema
     (en `herramientas/transcribir.py`). Para otros temas hay que cambiar ese vocabulario.
   - **Hugging Face estaba bloqueado** en el entorno de Claude Code en la nube. El script descarga entonces el
     mismo modelo (Whisper small, CTranslate2 int8) desde npm: paquetes `@skillninja/shortmovie-telop-model-p0..p3`.
     - Se descargan los `.tgz` con `curl` y se descomprimen. No se usa `npm install`, así que no se ejecuta
       nada del paquete.
     - Se unen los 4 trozos y se comprueba el SHA-256.
   - Los `.ogg` se convierten antes a WAV de 16 kHz mono con `ffmpeg`, porque la versión de PyAV del entorno
     fallaba con `.ogg`.
   - Las partes dudosas se vuelven a escuchar en trocitos, con el audio limpio
     (`ffmpeg -af "highpass=f=120,lowpass=f=7000,afftdn=nf=-25,loudnorm"`) y con varias temperaturas.
2. **Escribir los requisitos** en `docs/requisitos-audios.md`:
   - la transcripción, con las partes dudosas marcadas `[?]`;
   - una tabla *requisito → dónde está resuelto*;
   - las **interpretaciones tomadas**.
   Las dudas se dicen al usuario en el mensaje final. En este proyecto, la numeración resultó ser **por cliente**.

## 2. Qué tipo de “app”

Cuando el usuario dice **“quiero que sea una app”** y **“que la tenga en el móvil”**, se hace una **PWA**
(app web instalable), no una app nativa:

- un solo código para **Android, iPhone y ordenador**;
- se instala desde **un enlace** que se puede reenviar por WhatsApp, sin tiendas ni cuentas de desarrollador;
- funciona **sin internet** gracias al *service worker*;
- los datos se quedan en el dispositivo.

Piezas:

| Archivo | Para qué |
|---|---|
| `index.html` | Todo el programa (HTML + CSS + JS), sin librerías ni compilación. También funciona con doble clic (`file://`). |
| `manifest.json` | Nombre, iconos, colores y `display: standalone`. Las rutas son **relativas** (`./`) para que funcione dentro de `/<repo>/` en GitHub Pages. |
| `sw.js` | Caché para usarla sin internet. La página se pide primero a la red (con un límite de 4 s) y, si no hay conexión, se usa la copia guardada. El resto se sirve de la caché y se actualiza en segundo plano. **Sube `VERSION` en cada cambio.** |
| `iconos/` | Iconos de 192 y 512 px, *maskable* y `apple-touch-icon`, generados con `node herramientas/generar-iconos.cjs`. |
| `vendor/` | `jspdf.umd.min.js` y `html2canvas.min.js` (MIT), descargados del registro de npm con `curl`. Se cargan solo al crear un PDF. Además, `anthropic-sdk.mjs` (IA) y `firebase.mjs` (cuentas), empaquetados con esbuild. |
| `config-nube.js`, `firestore.rules`, `firebase.json` | Cuentas en la nube (fase 7): la configuración de Firebase (`null` = sin cuentas), las reglas de seguridad y los emuladores para las pruebas. |
| `.nojekyll` | Para que GitHub Pages sirva los archivos tal cual. |

En `index.html` hay además:

- las etiquetas `<meta>` de iOS (`apple-mobile-web-app-capable`, `apple-touch-icon`) y `viewport-fit=cover`
  con `env(safe-area-inset-*)`;
- un aviso **“Instalar”**: usa `beforeinstallprompt` en Android/Chrome y, en iPhone, explica
  “Compartir → Añadir a pantalla de inicio”.

## 3. Decisiones de diseño (y por qué)

| Decisión | Motivo |
|---|---|
| Datos en **`localStorage`** + **copia de seguridad JSON** + aviso si pasan más de 7 días sin copia + `navigator.storage.persist()` | Sin servidor y sin cuentas. Las apps instaladas en iPhone no sufren el borrado a los 7 días de Safari. Desde la fase 7, si se activan las cuentas, los datos van además a Firestore (ver sección 11). |
| **Móvil primero**: menú abajo con iconos, contabilidad en **tarjetas**, letra de 16 px en los campos | Con la letra de 16 px el iPhone no hace zoom al escribir. Fran la usa en el móvil. |
| **PDF con html2canvas + jsPDF** (A4; varias páginas si el concepto es muy largo) y botón **Enviar** con `navigator.share({ files })` | En el móvil lo normal es mandar la factura por WhatsApp o correo. `window.print()` se deja para el ordenador. |
| El PDF se prepara primero en un diálogo, y luego el usuario pulsa **Enviar** | `navigator.share` necesita que el usuario acabe de pulsar algo. Si se llama tras generar el PDF (más de 1 s), Safari lo bloquea. |
| La **misma `htmlFactura()`** para la vista previa, la impresión y el PDF | Lo que se ve es lo que sale. |
| La hoja de la factura está hecha con **`flex`, no con tablas con fondo**, y **sin `tabular-nums`** ni `color-mix()` | Problemas de html2canvas: deja una raya entre celdas con fondo, no aplica las cifras de ancho fijo (salen huecos antes de `€` y `%`) y no entiende `color-mix()` (el color claro se calcula en JS). |
| **Importes en céntimos** (enteros); formato `es-ES` con `useGrouping: 'always'` | Sin errores de coma flotante y con `1.000,00 €` (por defecto `Intl` no separa los miles de 4 cifras). |
| **Numeración por cliente**: cada cliente tiene un código (`CPCS`) y su contador → `CPCS-004`. Cada factura guarda su `serieClave` (`empresa\|cliente\|id` o `empresa\|serie\|prefijo`). También hay opción de **numeración única por empresa** | Es lo que pidió Fran. Con el código delante, cada cliente es una serie distinta y los números no se repiten dentro de la empresa. |
| Siguiente número = `max(número inicial, mayor número usado + 1)`. En la primera factura de un cliente se puede escribir el número que toca | Para seguir por donde iba (“va por la 3.ª o la 4.ª”). |
| Validaciones: **número repetido** y **código de cliente repetido** (bloquean); **hueco**, **fechas fuera de orden** y **sin CIF del cliente** (avisan) | Requisitos de una factura en España. |
| Si se escribe el **CIF de un cliente ya guardado**, se elige ese cliente | Evita duplicar clientes y descuadrar su numeración. |
| La factura **guarda una copia** de los datos del emisor y del cliente | Las facturas antiguas no cambian si luego se editan las fichas. |
| **Sin IVA** → motivo que sale impreso | Lo exige la normativa española. |
| Firma **dibujada con el dedo** (lienzo que se recorta solo) o subida como imagen; logo y firma reducidos a 900 px como máximo | Cómodo en el móvil y no llena el `localStorage`. |
| CSV con `;`, decimales con coma y BOM UTF-8 | Excel en español lo abre bien. |

## 4. Estructura del repositorio

```
index.html, manifest.json, sw.js, .nojekyll   ← la app
iconos/, vendor/
README.md                     ← manual para el usuario, enlace y aviso legal
docs/requisitos-audios.md     ← lo que pidió Fran y dónde está cada cosa
docs/COMO-SE-HIZO.md          ← este documento
docs/capturas/, docs/factura-ejemplo.pdf
herramientas/transcribir-audios.sh, transcribir.py, generar-iconos.cjs, generar-capturas.cjs
herramientas/empaquetar-sdk-claude.sh, empaquetar-firebase.sh, emuladores-firebase.sh, cambiar-clave.py
config-nube.js, firestore.rules, firebase.json   ← cuentas (Firebase)
docs/CUENTAS.md               ← cómo activar las cuentas
pruebas/prueba-completa.cjs   ← prueba de punta a punta
CLAUDE.md                     ← instrucciones para Claude en este repositorio
```

## 5. Probar antes de entregar

```bash
node pruebas/prueba-completa.cjs
```

La prueba levanta `python3 -m http.server` y usa Chromium (Playwright).

**En el ordenador:**

- alta de 2 empresas (con logo y firma dibujada);
- numeración por cliente: `CPCS-004` (número escrito a mano), luego `CPCS-005`, y otro cliente con `AG-001`;
- una empresa con numeración única (`R-0001`);
- bloqueo de un número repetido y de un código de cliente repetido;
- autoselección del cliente por CIF;
- IVA al 21 % y al 10 % y sin IVA;
- Contabilidad: marcar como cobrada, totales y filtros;
- CSV, PDF (1 página, comprobado con `pdfinfo`) e impresión;
- descargar una copia, borrar los datos y restaurar la copia.

**En el móvil (Pixel 7):**

- `Page.getInstallabilityErrors` vacío, es decir, instalable;
- manifest sin errores;
- **sin conexión** la app abre, hace una factura y crea el PDF;
- menú abajo, tarjetas y ningún scroll horizontal.

**Cuentas (con los emuladores de Firebase):** dos dispositivos con el mismo usuario, tiempo real, sin internet,
contraseña incorrecta, usuario repetido, datos antiguos que pasan a la cuenta, reglas de seguridad (403 al leer los
datos de otro), cerrar sesión, cambiar la contraseña y `cambiar-clave.py`.

**Además:** que abra con `file://` y que no haya ningún error de JavaScript.

Después se **miran las capturas** de `pruebas/salida/*.png` y el PDF (`pdftoppm -png`) para revisar el diseño.

## 6. Publicar y entregar

1. Commit y push a la rama de trabajo.
2. **GitHub Pages** (el repositorio es público). Lo activa el dueño **una sola vez**:
   **Settings → Pages → Build and deployment → Source: “Deploy from a branch” → Branch: la rama de trabajo,
   carpeta `/ (root)` → Save**. Desde Claude no se puede activar: no hay herramienta para ello y el
   `GITHUB_TOKEN` de Actions no tiene permiso.
3. El enlace queda así: `https://<owner-en-minúsculas>.github.io/<repo>/`. En este proyecto:
   https://ai-phi-design.github.io/FACTURATION-PROGRAM-/
4. Para comprobar que se publicó, mira que la ejecución **“pages build and deployment”** de GitHub Actions
   termine en verde. Desde el entorno de Claude no se puede abrir `github.io`.
5. En el mensaje final al usuario:
   - el enlace;
   - el paso de activar Pages, si falta;
   - un **texto listo para reenviar** al usuario final, con cómo instalar la app en Android e iPhone;
   - el aviso de copias de seguridad;
   - el aviso de Veri\*factu;
   - las dudas de interpretación.

## 7. Fase 3: diseño moderno y mejoras (“lo que tú harías”)

Cuando el usuario pide un **diseño moderno** y que se añada lo que yo haría, se aplica este patrón:

**Diseño**

- **Sistema de diseño con variables CSS**: colores, radios y sombras. El **modo oscuro** tiene su propia paleta
  (no es invertir colores) y se puede forzar en Ajustes (`data-theme`). El tema se aplica con un script en el
  `<head>` para que no parpadee.
- **Navegación:**
  - en el **ordenador**, menú **lateral** con el botón «Nueva factura» destacado;
  - en el **móvil**, **barra inferior** con un **botón + central**. Es el mismo `<nav>`, reordenado con `order`.
- **Historial con `history.pushState`**, para que funcione el botón **atrás** del móvil (evento `popstate`). El
  cambio de pantalla es **síncrono**. Con `location.hash` cambiaba un instante después del toque y las pruebas
  fallaban de forma intermitente.
- **Editor en el móvil:** pestañas «Datos / Ver factura» y una **barra fija con Guardar / Enviar PDF** encima del menú.
- **Listas en tarjetas** (`grid-template-areas`), interruptores en lugar de casillas, controles segmentados,
  etiquetas de estado con icono y texto (Cobrada / Pendiente / Vencida) y un aviso flotante con **Deshacer**.

**Panel de Inicio con gráfico.** Se sigue la guía `dataviz`:

- una sola cifra protagonista (**Pendiente de cobro**) y tarjetas para el resto de cifras;
- gráfico de columnas de **una sola serie**: barras de 24 px como máximo con la punta redondeada de 4 px,
  rejilla fina, eje con números redondos y una sola etiqueta (el máximo);
- **tooltip** al pasar o enfocar cada mes, y los mismos datos en una **tabla** desplegable;
- color validado con `validate_palette.js` sobre el fondo claro y el oscuro.

**Funciones nuevas**

- **Vencimiento:** plazo de pago por empresa y fecha por factura. Estado **Vencida**.
- **Recordar el cobro:** un mensaje editable que se envía por `wa.me/<teléfono>?text=` o `mailto:`. Los teléfonos
  españoles de 9 cifras se pasan a +34.
- **Retención de IRPF** opcional: el total es base + IVA − IRPF.
- **Deshacer** al marcar como cobrada y al borrar.
- **CSV para el gestor:** en el móvil se comparte con `navigator.share`; en el ordenador se descarga.

**Lecciones de las pruebas** (fallos intermitentes):

1. Nada debe **mover el contenido** en un momento cualquiera. El aviso «Instalar» aparece cuando Chrome lanza
   `beforeinstallprompt` y empujaba la pantalla justo al tocar. Por eso los avisos van solo en Inicio, y la
   prueba de ordenador lo da por cerrado.
2. **No uses `setTimeout(() => campo.focus())`.** Si se está escribiendo en otro campo, el texto acaba en el
   que recibe el foco. Pon el foco al momento, y en el móvil no lo pongas (abriría el teclado).
3. **Fija el reloj** en la prueba con `context.clock.setFixedTime(...)`. La numeración depende del año.
4. Si una prueba falla a veces, repite solo ese tramo varias veces y registra los datos guardados en cada intento.

## 8. Fase 4: factura de ejemplo y logos del cliente

Cuando el usuario pasa una **factura de ejemplo**:

1. Léela entera: `pdftotext -layout`, mira la imagen y saca las imágenes con `pdfimages -j`, que trae el logo
   y la firma.
2. **Calca su diseño** en una plantilla nueva. Aquí es la «Clásica», que convive con la «Moderna» y se elige
   en la ficha de cada empresa. Copia también:
   - el **formato del número** (`A 15/26`: código, número y año; empieza en el 1 cada año);
   - el **importe en letra** (función `importeEnLetra`);
   - el **cargo** bajo la firma;
   - la frase del **pago** («Ruego abonen importe en la cuenta: …»);
   - la **nota legal** (criterio de caja).
3. Compruébalo **rehaciendo esa misma factura con la app** y poniendo la original y la nueva una al lado de
   la otra.
4. **Privacidad:** si el repositorio es **público**, **no subas datos reales** (NIF, IBAN, firma, clientes).
   Genera un **JSON de configuración privado**, que es una copia de seguridad con la empresa, sus imágenes y sus
   clientes. Pásaselo solo al usuario. El usuario final lo carga en **Ajustes → Restaurar…**.
5. Las imágenes pegadas en el chat **no llegan como archivo**: pide que las adjunten como archivo.

## 9. Fase 5: datos de ejemplo inventados y más usuarios

- **Datos de ejemplo:** `crearDatosEjemplo()` en `index.html` genera una empresa, clientes y facturas inventados:
  - el logo y la firma se dibujan en un `canvas`;
  - las fechas son relativas a hoy, con una factura cobrada, una pendiente y una vencida;
  - todo lleva `ejemplo: true`.

  El botón **«Ver un ejemplo»** solo aparece si no hay datos. **«Borrar el ejemplo»** quita solo lo marcado.
  Las facturas de ejemplo no cuentan para el aviso de copia de seguridad.
- **Capturas y PDF de la documentación:** `node herramientas/generar-capturas.cjs`. Carga el ejemplo con el reloj
  fijo y saca las capturas de ordenador y móvil, el modo oscuro, la factura impresa y el PDF. Antes de cada
  captura mueve el ratón fuera, para que no quede abierto el detalle del gráfico.
- **Varias personas** (Fran, su madre…): no hace falta nada especial. La app es genérica y cada dispositivo guarda
  sus datos. Para alguien nuevo se repite lo mismo: se instala con el enlace y, si se quiere, se le prepara su
  JSON de configuración privado.

## 10. Fase 6: lector con IA (PDF o foto → datos del cliente)

- **Proveedor:** Claude, con el **SDK oficial** (`@anthropic-ai/sdk`). La app no tiene compilación, así que el SDK
  se empaqueta en un solo archivo, `vendor/anthropic-sdk.mjs` (`herramientas/empaquetar-sdk-claude.sh`, con esbuild).
  Se carga con `import()` solo al usarlo.
- **Llamada:** `client.beta.messages.create` con:
  - `model: 'claude-opus-5-5'`;
  - el PDF como bloque `document` en base64 (o la foto como `image`, reducida);
  - `output_config: { effort: 'low', format: { type: 'json_schema', schema } }`, para que la respuesta sea un JSON
    con campos fijos;
  - `fallbacks: 'default'` con la cabecera `server-side-fallback-2026-07-01`;
  - `dangerouslyAllowBrowser: true`, porque se llama desde el navegador con la clave del propio usuario.

  Se comprueba `stop_reason` (`refusal`, `max_tokens`) y los errores se tratan por tipo
  (`AuthenticationError`, `RateLimitError`…). El SDK 1.x manda la clave en `Authorization: Bearer`.
- **Instrucciones:** se le pasan **nuestras empresas** para que no las confunda con el cliente. Si el documento lo
  emitimos nosotros, el cliente es el destinatario.
- **Experiencia de uso:**
  - si falta la clave, el propio diálogo la pide;
  - los datos se **revisan** antes de usarlos;
  - si el CIF ya existe, se elige ese cliente en lugar de duplicarlo.
- **Privacidad:**
  - la clave se guarda en `localStorage` aparte (`facturacion.ia.clave`) y **no va en las copias**;
  - la interfaz avisa de que el documento se envía a Anthropic.
- **Pruebas sin gastar:** `context.route('https://api.anthropic.com/**')` simula a Claude, respondiendo también al
  `OPTIONS` (CORS). Se comprueban la petición, el relleno, la clave incorrecta (401) y que la clave no está en la
  copia. Con una clave real hay que probarlo a mano.

## 11. Fase 7: cuentas con usuario y contraseña (datos en la nube)

Petición: «que la app tenga un usuario y contraseña por persona y que, una vez dentro, tengan todos sus proyectos».

- **Elección: Firebase** (Authentication con correo y contraseña + Cloud Firestore).
  - GitHub Pages solo sirve archivos: hace falta un servicio de cuentas y datos. Firebase es gratis para este uso,
    sin servidor propio, con **modo sin conexión** y **tiempo real** de serie.
  - El SDK se empaqueta en `vendor/firebase.mjs` (como el de Claude) y se carga con `import()` solo si hay cuentas.
    Se usa `initializeAuth` (no `getAuth`), porque `getAuth` carga scripts de `apis.google.com` para ventanas
    emergentes de Google.
- **Sin romper lo anterior:** con `window.CONFIG_NUBE = null` (en `config-nube.js`) la app funciona igual que antes.
  Activarlo es solo pegar la configuración del proyecto de Firebase (`docs/CUENTAS.md`). Esa configuración **no es
  secreta**; la protección está en `firestore.rules` (cada `uid` solo lee y escribe `usuarios/{uid}/…`).
- **Se entra con correo y contraseña** (lo pidió así el usuario). El correo permite recuperar la contraseña con
  `sendPasswordResetEmail` (en español: `auth.languageCode = 'es'`). Se sigue admitiendo un nombre sin correo
  (`fran` → `fran@usuarios.facturacion.app`); para esos, `herramientas/cambiar-clave.py` (en Cloud Shell) pone una
  contraseña nueva. Los errores de Firebase se traducen a frases claras.
- **Lección:** las cuentas quedan **apagadas** hasta tener el proyecto de Firebase (solo lo puede crear el usuario,
  con su cuenta de Google). Hay que decirlo muy claro y pedir la configuración en el mismo mensaje: el usuario
  creyó que no estaban hechas porque la app seguía sin pedir contraseña.
- **Si el usuario quiere que otro asistente (Gemini…) cree el proyecto de Firebase:** se le pasa el texto de la
  sección «Hacerlo con un asistente» de `docs/CUENTAS.md` (pasos exactos, plan gratuito, reglas incluidas, y que
  devuelva el `firebaseConfig`). Con ese bloque se rellena `config-nube.js` y se publica.
- **Activación (04/11/2026):** el usuario creó el proyecto siguiendo los pasos con capturas, uno a uno (ojo: al crear
  Firestore sale «Copias de seguridad programadas», que pide el plan de pago: se deja sin marcar). Con el
  `firebaseConfig`:
  1. se pega en `config-nube.js`;
  2. se comprueba el proyecto real con `herramientas/comprobar-firebase.sh` (alta, guardar, leer, reglas y limpieza
     de la cuenta de prueba);
  3. las pruebas sin cuentas fuerzan `localStorage['facturacion.nube.prueba'] = 'null'`, y una comprobación nueva
     mira que la app real pide correo y contraseña;
  4. el *service worker* pide `config-nube.js` primero a internet y llena la caché con `cache: 'reload'`. Así, al
     activar o cambiar la configuración, los móviles la cogen enseguida (como mucho, hay que abrir la app dos veces
     o pulsar «Actualizar»).
- **Cómo se guardan los datos:**
  - un documento por empresa, cliente y factura, con el mismo formato que la copia de seguridad, y los ajustes en
    `usuarios/{uid}`;
  - `guardarDatos()` sigue siendo el único punto de guardado: compara con lo último sincronizado (JSON con las
    claves ordenadas) y sube solo los cambios con `writeBatch`;
  - la app no cambió por dentro: sigue trabajando con el objeto `db`.
- **Lectura:** `onSnapshot` por colección. La primera lectura sustituye la colección; después se aplican los
  cambios. Se repinta con `requestAnimationFrame` y **no se tocan los formularios a medio rellenar**.
- **Sin internet:** `persistentLocalCache` de Firestore + copia en `localStorage` por usuario. El *service worker*
  guarda `firebase.mjs` y `config-nube.js`, así que la app abre sin conexión con la sesión iniciada.
- **Datos de antes:** si la cuenta está vacía (confirmado por el servidor, con `includeMetadataChanges`) y el
  dispositivo tenía datos sin cuenta, se pregunta si se pasan.
- **Cerrar sesión:** `waitForPendingWrites` (máx. 6 s; si no, avisa de que se perderían cambios), borrar la copia
  local, `signOut`, `terminate` + `clearIndexedDbPersistence` y recargar.
- **Pruebas:** emuladores de Firebase (`firebase-tools`, Java 21 en el entorno), que la prueba arranca si no están en
  marcha. Se borran los datos del emulador al empezar. La configuración de prueba entra por
  `localStorage['facturacion.nube.prueba']` con `addInitScript`, y las reglas se comprueban con la API REST del
  emulador (`Bearer owner` para leer como administrador). Los errores de red provocados a propósito (contraseña
  incorrecta, sin internet) no cuentan como errores de JavaScript.

## 12. Posibles mejoras (no pedidas todavía)

- Varias líneas de concepto con importe cada una.
- Facturas rectificativas.
- Requisitos Veri\*factu: hash encadenado, QR y envío a la AEAT.
- Compartir una cuenta entre varias personas (por ejemplo, Fran y su gestor), con permisos de solo lectura.
