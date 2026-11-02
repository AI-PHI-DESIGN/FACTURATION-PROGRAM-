# Instrucciones para Claude en este repositorio

App de facturación para Fran. Es una **app web instalable (PWA)** que se usa sobre todo en el **móvil**:
- varias empresas emisoras;
- **numeración por cliente** (`CPCS-004`) u, opcionalmente, una numeración única por empresa;
- contabilidad cobrado / no cobrado;
- PDF para enviar por WhatsApp o correo.

- **Antes de cambiar nada**, lee:
  - `docs/requisitos-audios.md`: lo que pidió Fran y lo que se pidió después;
  - `docs/COMO-SE-HIZO.md`: las decisiones de diseño, los problemas de html2canvas y el proceso completo.

  Si el usuario pide "lo mismo" otra vez, sigue esa receta.
- El programa está en `index.html` (HTML + CSS + JS), **sin compilación**, más estos archivos:
  - `manifest.json`, `sw.js`, `iconos/`;
  - `vendor/`: jsPDF y html2canvas, en local para que funcionen sin internet.

  No añadas dependencias de CDN: todo tiene que funcionar sin conexión.
- Cada vez que cambies un archivo publicado, **sube `VERSION` en `sw.js`**. Si añades un archivo que la app
  necesita sin internet, añádelo también a `ARCHIVOS` en `sw.js`.
- La interfaz va **en español**, para alguien no técnico, y **pensada primero para el móvil**: menú abajo,
  campos con letra de 16 px y nada de scroll horizontal.
- Los importes se guardan en **céntimos**. La vista previa, la impresión y el PDF usan la misma `htmlFactura()`.
  En la hoja de la factura no uses tablas con fondo, `tabular-nums` ni `color-mix()`, porque html2canvas los
  pinta mal.
- Si cambia el formato de los datos guardados, mantén la compatibilidad con las copias `.json` antiguas
  (`normalizarDatos()`).
- Después de cada cambio, ejecuta `node pruebas/prueba-completa.cjs`, que tiene que terminar en "Todo correcto".
  - Mira también las capturas de `pruebas/salida/` y el PDF (`pdftoppm -png`).
  - Si añades una función nueva, añade su comprobación en la prueba.
- Se publica con GitHub Pages desde la rama de trabajo:
  - enlace: https://ai-phi-design.github.io/FACTURATION-PROGRAM-/
  - comprueba el despliegue en la ejecución "pages build and deployment" de GitHub Actions.
- Para transcribir notas de voz nuevas: `herramientas/transcribir-audios.sh <audios>`.
- Cuando se añada un requisito, actualiza `docs/requisitos-audios.md` y el `README.md`.
