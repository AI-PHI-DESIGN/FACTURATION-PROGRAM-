# Instrucciones para Claude en este repositorio

App de facturación para Fran. Es una **app web instalable (PWA)** que se usa sobre todo en el **móvil**:

- varias empresas emisoras, cada una con su plantilla:
  - **Clásica:** calcada de sus facturas de Word;
  - **Moderna:** con color;
- **numeración por cliente** con el formato `A 15/26` (empieza cada año) o, opcionalmente, una numeración única
  por empresa o con guion (`CPCS-004`);
- facturas **cobradas, pendientes y vencidas**, panel de Inicio con gráficas, PDF para WhatsApp o correo,
  recordatorios de cobro, IRPF y modo oscuro;
- **Gastos** (`db.gastos`): apartado propio que cambia el color de toda la app (`aplicarModo()`, color en
  `db.ajustes.colorGastos`). En las gráficas, ingresos = azul (`--serie-1`) y gastos = naranja (`--serie-2`),
  validados con la skill *dataviz*: no los cambies sin volver a validarlos.

**Antes de cambiar nada**

- Lee `docs/requisitos-audios.md`: lo que se ha pedido.
- Lee `docs/COMO-SE-HIZO.md`: decisiones, lecciones de las pruebas, privacidad y proceso.
- Si el usuario pide «lo mismo» otra vez, sigue esa receta.

**Privacidad**

- El repositorio es **público**. **Nunca subas datos reales**: NIF, IBAN, firmas, clientes ni facturas de ejemplo.
- Para dejar la app configurada, genera un **JSON de configuración privado**, como el de `normalizarDatos()`.
  Pásalo solo al usuario, desde la carpeta temporal.

**El código**

- `index.html` (HTML + CSS + JS) **sin compilación**, más estos archivos:
  - `manifest.json`, `sw.js` e `iconos/`;
  - `vendor/`: jsPDF y html2canvas, en local.
- Nada de CDN: todo tiene que funcionar sin conexión.
- Al cambiar un archivo publicado, **sube `VERSION` en `sw.js`**. Si la app necesita un archivo nuevo sin
  conexión, añádelo a `ARCHIVOS`.
- La interfaz va en **español**, para alguien no técnico, y **pensada primero para el móvil**: barra inferior,
  campos de 16 px y nada de scroll horizontal.
- La navegación usa `history.pushState` y es **síncrona**.
- No metas `setTimeout` para poner el foco. No muevas el contenido con avisos que aparecen solos.
- **Importes en céntimos.** La vista previa, la impresión y el PDF usan `htmlFactura()` (o `htmlFacturaClasica()`).
- En la hoja de la factura no uses tablas con fondo, `tabular-nums` ni `color-mix()`: html2canvas los pinta mal.
- Si cambia el formato de los datos guardados, mantén la compatibilidad en `normalizarDatos()`.

**Pruebas y publicación**

- Después de cada cambio, ejecuta `node pruebas/prueba-completa.cjs`, que tiene que terminar en «Todo correcto».
  - Tiene el reloj fijado en el 2 de noviembre de 2026.
  - Mira también las capturas de `pruebas/salida/` y el PDF (`pdftoppm -png`).
  - Si añades una función, añade su comprobación.
- Se publica con GitHub Pages desde la rama de trabajo: https://ai-phi-design.github.io/FACTURATION-PROGRAM-/
- Comprueba el despliegue en la ejecución «pages build and deployment» de GitHub Actions.
- Para transcribir notas de voz nuevas: `herramientas/transcribir-audios.sh <audios>`.
- Para rehacer las capturas y el PDF de `docs/` con datos inventados: `node herramientas/generar-capturas.cjs`.
- **Leer PDF sin IA (por defecto):** `lineasDelPDF()` con pdf.js en `vendor/pdfjs-<versión>/` (si se actualiza,
  carpeta nueva) y `extraerCliente()` (el CIF que no es nuestro y los datos de alrededor). Sin clave, nunca se llama a la
  IA; las fotos y los PDF escaneados ofrecen «Usar la IA».
- **Lector con IA (opcional, con clave):**
  - Claude Opus 5.5 con el SDK oficial empaquetado en `vendor/anthropic-sdk.mjs`
    (`herramientas/empaquetar-sdk-claude.sh`);
  - la clave del usuario se guarda en `facturacion.ia.clave`: **nunca en las copias ni en el código**;
  - en las pruebas, Claude se simula con `context.route`.
- La app la usan varias personas (Fran, la madre del usuario…). Que siga siendo genérica: nada con nombres o
  datos de una persona en el código.
- **Cuentas (usuario y contraseña):**
  - Firebase Auth + Firestore, con el SDK empaquetado en `vendor/firebase.mjs` (`herramientas/empaquetar-firebase.sh`);
  - **activadas** con el proyecto `facturacion-dec62` en `CONFIG_NUBE`, **dentro de `index.html`** (nunca en un archivo
    aparte: los service workers viejos servirían la copia antigua). Si fuera `null`, la app funcionaría sin
    cuentas); guía en `docs/CUENTAS.md`; para comprobar el proyecto real: `herramientas/comprobar-firebase.sh`;
  - datos en `usuarios/{uid}/{empresas|clientes|facturas|gastos}/{id}`; las reglas (`firestore.rules`) son genéricas
    para todo lo que cuelga de `usuarios/{uid}`: una colección nueva no necesita reglas nuevas;
  - todo cambio pasa por `guardarDatos()`, que sube a la nube solo lo que ha cambiado;
  - en las pruebas se usan los emuladores (`herramientas/emuladores-firebase.sh`); `SIN_NUBE=1` se salta esa parte;
    las partes sin cuentas ponen `localStorage['facturacion.nube.prueba'] = 'null'`. Nunca se prueba contra los datos
    reales de nadie.
