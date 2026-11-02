# Cómo se hizo (receta para repetirlo igual)

Este documento recoge **el proceso y las decisiones** de este proyecto. Si se vuelve a pedir “un programa de
facturación”, “que sea una app” o, en general, una app a partir de notas de voz, se sigue esta misma receta.

## Resumen en una línea

**Audios → requisitos → app web instalable (PWA) en un `index.html` sin compilación → prueba de punta a punta
con Playwright (ordenador + móvil + sin internet) → GitHub Pages → enlace para reenviar.**

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
| `vendor/` | `jspdf.umd.min.js` y `html2canvas.min.js` (MIT), descargados del registro de npm con `curl`. Se cargan solo al crear un PDF. |
| `.nojekyll` | Para que GitHub Pages sirva los archivos tal cual. |

En `index.html` hay además:

- las etiquetas `<meta>` de iOS (`apple-mobile-web-app-capable`, `apple-touch-icon`) y `viewport-fit=cover`
  con `env(safe-area-inset-*)`;
- un aviso **“Instalar”**: usa `beforeinstallprompt` en Android/Chrome y, en iPhone, explica
  “Compartir → Añadir a pantalla de inicio”.

## 3. Decisiones de diseño (y por qué)

| Decisión | Motivo |
|---|---|
| Datos en **`localStorage`** + **copia de seguridad JSON** + aviso si pasan más de 7 días sin copia + `navigator.storage.persist()` | Sin servidor y sin cuentas. Las apps instaladas en iPhone no sufren el borrado a los 7 días de Safari. |
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
herramientas/transcribir-audios.sh, transcribir.py, generar-iconos.cjs
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

## 7. Posibles mejoras (no pedidas todavía)

- Varias líneas de concepto con importe cada una.
- Retención de IRPF.
- Facturas rectificativas.
- Requisitos Veri\*factu: hash encadenado, QR y envío a la AEAT.
- Sincronizar datos entre el móvil y el ordenador. Ahora cada dispositivo tiene sus datos y se pasan con la
  copia de seguridad.
