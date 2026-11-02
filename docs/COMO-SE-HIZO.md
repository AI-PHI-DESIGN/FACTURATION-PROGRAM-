# Cómo se hizo (receta para repetirlo igual)

Este documento recoge **el proceso y las decisiones** de este proyecto. Si se vuelve a pedir “un programa de
facturación” (u otro programa a partir de notas de voz), se sigue esta misma receta.

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
     - Se unen los 4 trozos de `model.bin` y se comprueba el SHA-256 (`model.sha256`).
   - Los `.ogg` se convierten antes a WAV de 16 kHz mono con `ffmpeg`, porque la versión de PyAV del entorno
     fallaba al abrir `.ogg` (`unexpected keyword argument 'metadata_errors'`).
   - Las partes dudosas se vuelven a escuchar en trocitos, con el audio limpio
     (`ffmpeg -af "highpass=f=120,lowpass=f=7000,afftdn=nf=-25,loudnorm"`) y con varias temperaturas.
     Así se comparan las versiones.
2. **Escribir los requisitos** en `docs/requisitos-audios.md`:
   - la transcripción, con las partes dudosas marcadas `[?]`;
   - una tabla *requisito → dónde está resuelto en el programa*;
   - las **interpretaciones tomadas**, para confirmarlas con el cliente.

## 2. Decisiones de diseño (y por qué)

| Decisión | Motivo |
|---|---|
| **Un solo `index.html`** sin librerías ni compilación | Se pasa a cualquier ordenador por correo o pendrive, se abre con doble clic y funciona sin internet. |
| Datos en **`localStorage`** del navegador + **copia de seguridad en JSON** + aviso si pasan más de 7 días sin copia | No hace falta servidor ni instalar nada. El riesgo (borrar el navegador) se cubre con las copias. Se pide `navigator.storage.persist()`. |
| **Imprimir/PDF con `window.print()`** y CSS `@page { size: A4; margin: 0 }` | No hace falta ninguna librería de PDF. El navegador ya trae “Guardar como PDF”. La hoja A4 se pinta en un `#zona-impresion` que solo se ve al imprimir. |
| La **misma función `htmlFactura()`** para la vista previa y para la impresión | Lo que se ve es exactamente lo que se imprime. |
| **Importes en céntimos** (enteros) y redondeo de la cuota de IVA al céntimo | Sin errores de coma flotante. |
| Entrada de importes que acepta `1.250,50`, `1250,5` y `1250.50` | Así es como se escribe en España. |
| Formato `es-ES` con `useGrouping: 'always'` | Sin esto, `Intl` en español no separa los miles en números de 4 cifras (sale `1000,00 €` en vez de `1.000,00 €`). |
| **Numeración por empresa emisora** (+ serie opcional). Siguiente = `max(número inicial, mayor número usado + 1)` | Es lo que pidió Fran (“no es global”). El “número inicial” permite continuar por donde iba. |
| Validaciones: **número repetido** (bloquea); **hueco**, **fechas fuera de orden** y **sin CIF del cliente** (avisa) | Requisitos de una factura en España: numeración correlativa y NIF de ambas partes. |
| La factura **guarda una copia de los datos** del emisor y del cliente | Si luego cambian la dirección de un cliente, las facturas antiguas no cambian. |
| **Sin IVA** → campo “motivo” que sale impreso (lista de motivos típicos) | En España, una factura sin IVA debe indicar la exención o el motivo. |
| Firma: **subir imagen o dibujarla** en un lienzo (se recorta sola) | Fran puede firmar con el dedo o con el ratón, sin escanear nada. |
| Logo y firma se **reducen** al subirlos (máx. 900 px) | Para no llenar el `localStorage` (unos 5 MB). |
| CSV con `;`, decimales con coma y BOM UTF-8 | Excel en español lo abre bien con doble clic. |
| Toda la interfaz **en español** y con textos de ayuda | El usuario final no es técnico. |

## 3. Estructura del repositorio

```
index.html                    ← el programa entero
README.md                     ← manual para el usuario + aviso legal
docs/requisitos-audios.md     ← lo que pidió Fran (transcripción) y dónde está cada cosa
docs/COMO-SE-HIZO.md          ← este documento
docs/capturas/, docs/factura-ejemplo.pdf
herramientas/transcribir-audios.sh, herramientas/transcribir.py
pruebas/prueba-completa.cjs   ← prueba de punta a punta con Playwright
CLAUDE.md                     ← instrucciones para Claude en este repo
```

## 4. Probar antes de entregar

```bash
node pruebas/prueba-completa.cjs
```

La prueba hace en Chromium (Playwright) lo mismo que haría el usuario:

- alta de 2 empresas (con logo y firma dibujada);
- facturas con IVA al 21 % y al 10 % y sin IVA;
- numeración independiente por empresa, empezando en 4;
- bloqueo de un número repetido;
- en Contabilidad, marcar como cobrada y comprobar los totales y los filtros;
- exportar el CSV;
- generar el PDF y comprobar que ocupa **1 página**;
- recargar la página;
- descargar una copia, borrar el navegador y restaurar la copia;
- vista móvil sin scroll horizontal;
- **ningún error de JavaScript**.

Después se **miran las capturas** (`pruebas/salida/*.png`) para revisar el diseño a ojo.

## 5. Entregar

1. Commit y push a la rama de trabajo.
2. En el mensaje final al usuario:
   - qué hace el programa;
   - cómo abrirlo;
   - las interpretaciones dudosas de los audios;
   - el aviso de copias de seguridad;
   - el aviso de Veri\*factu (normativa española de software de facturación, aplazada a 2027).

## 6. Posibles mejoras (no pedidas todavía)

- Varias líneas de concepto con importe cada una (ahora es un único concepto + base imponible).
- Retención de IRPF (para profesionales autónomos).
- Facturas rectificativas con su propia serie.
- Requisitos Veri\*factu: encadenado con hash, código QR y envío a la AEAT.
- Guardar los datos en un archivo del disco (File System Access API) además de en el navegador.
