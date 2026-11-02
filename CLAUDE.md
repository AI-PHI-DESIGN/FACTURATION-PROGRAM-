# Instrucciones para Claude en este repositorio

Programa de facturación para Fran (varias empresas, numeración por empresa, contabilidad cobrado/no cobrado).

- **Antes de cambiar nada**, lee `docs/requisitos-audios.md` (lo que pidió Fran) y `docs/COMO-SE-HIZO.md`
  (las decisiones de diseño y el proceso a seguir). Si el usuario pide "lo mismo" otra vez, sigue esa receta.
- Todo el programa está en `index.html`: HTML + CSS + JS, **sin librerías ni compilación**, y tiene que
  funcionar abriéndolo con doble clic (`file://`) y sin internet. No añadas dependencias externas.
- La interfaz y los textos van **en español** y pensados para alguien no técnico.
- Los importes se guardan en **céntimos** (enteros). La vista previa y la impresión usan la misma `htmlFactura()`.
- Si cambia el formato de los datos guardados, mantén la compatibilidad con las copias `.json` antiguas
  (`normalizarDatos()`).
- Después de cada cambio, ejecuta `node pruebas/prueba-completa.cjs`, que tiene que terminar en "Todo correcto".
  Mira también las capturas de `pruebas/salida/`. Si añades una función nueva, añade su comprobación en la prueba.
- Para transcribir notas de voz nuevas: `herramientas/transcribir-audios.sh <audios>`.
- Cuando se añada un requisito, actualiza `docs/requisitos-audios.md` (o crea un documento de requisitos nuevo)
  y el `README.md`.
