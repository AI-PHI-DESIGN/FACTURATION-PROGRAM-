# Instrucciones para Claude en este repositorio

App de facturación para Fran. Es una **app web instalable (PWA)** que se usa sobre todo en el **móvil**:

- varias empresas emisoras, cada una con su plantilla:
  - **Clásica:** calcada de sus facturas de Word;
  - **Moderna:** con color;
- **numeración por cliente** con el formato `A 15/26` (empieza cada año) o, opcionalmente, una numeración única
  por empresa o con guion (`CPCS-004`);
- facturas **cobradas, pendientes y vencidas**, panel de Inicio con gráfico, PDF para WhatsApp o correo,
  recordatorios de cobro, IRPF y modo oscuro.

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
