# Requisitos: transcripción de los audios de Fran

Dos notas de voz de WhatsApp del 28/10/2026, transcritas con Whisper (modelo `small`, en local).
Las partes dudosas van marcadas con `[?]`, con la interpretación elegida al lado.

## Audio 1: `WhatsApp Ptt 2026-10-28 at 18.10.16.ogg` (1 min 7 s)

> Vamos a montar, empezamos de cero. La factura. Con la fecha…
> Sí, la plantilla de cada empresa, con su logo y sus datos.
> La factura, que él debe numerar ya en función de la factura que va correlando [?],
> y ahora es la tercera o la cuarta factura.
> Vale. La numeración de la factura, dependiendo de cada empresa a la que se le haga la factura.
> La numeración no es global.
> Claro, sí. La fecha de cada una de las facturas. La fecha de la facturación.
> El nombre, la dirección, el CIF y la población (del cliente).
> Vale. Y luego el concepto. El concepto de la facturación.
> Un espacio grande para que le ponga el concepto.
> Vale. Después pones la base imponible. Datos con números.
> Qué porcentaje de IVA. Que haya la posibilidad de editar si tiene IVA o no, repercutido.
> Vale, y le saca el total.
> Vale. La firma… y la fecha de la factura [?].
> Y luego, en función de…, para eso te pasaré el número de cuenta [?].
> Vale, perfecto. Es la plantilla.

## Audio 2: `WhatsApp Ptt 2026-10-28 at 18.11.16.ogg` (17 s)

> Debemos tener la opción de señalizar el cobro: si está cobrado o no está cobrado.
> Emito la factura y que me quede una pestaña [?] en el apartado de contabilidad:
> cobrado, no cobrado.
> Exacto, vale.

## Lista de requisitos y dónde están en el programa

| # | Requisito (Fran) | Cómo está resuelto |
|---|------------------|--------------------|
| 1 | Plantilla de **cada empresa** con **su logo y sus datos** | Pestaña **Empresas**: varias empresas, cada una con logo, datos fiscales, color, firma y pie de factura. |
| 2 | Numeración **por cliente** (“dependiendo de cada empresa a la que se le haga la factura”), no global | Cada cliente tiene un **código** y **su propio contador**: `CPCS-001`, `CPCS-002`… (confirmado por el usuario). Opcionalmente, una empresa puede usar una sola numeración. |
| 3 | Continuar la numeración actual (“va por la 3ª o la 4ª”) | En la primera factura a un cliente se escribe el número que toca (p. ej. `4`) y sigue solo. También hay “Empezar su numeración en” en la ficha del cliente. |
| 4 | Fecha de la factura | Campo fecha (hoy por defecto). Avisa si la fecha no cuadra con el orden de la numeración. |
| 5 | Nombre, dirección, CIF y población del cliente | Bloque **Cliente**. Los clientes se guardan solos y se pueden volver a elegir. |
| 6 | **Espacio grande** para el concepto | Caja de texto grande; en la factura sale en un recuadro amplio. |
| 7 | **Base imponible** | Campo numérico (admite `1.250,50`). |
| 8 | **% de IVA** editable y opción **con o sin IVA repercutido** | Casilla “Aplicar IVA (repercutido)” + % editable (21/10/4…). Sin IVA se puede indicar el motivo, que sale impreso. |
| 9 | **Total** automático | Base + cuota de IVA, calculado en céntimos (sin errores de redondeo). |
| 10 | **Firma** y fecha | Firma por empresa (subir imagen o dibujarla). En la factura: “En [población], a [fecha]” + firma + nombre del firmante. |
| 11 | Número de cuenta | IBAN y forma de pago por empresa (editable en cada factura). |
| 12 | Marcar **cobrado / no cobrado** | Casilla “Cobrada” + fecha de cobro en la factura, y botón de estado en un clic en Contabilidad. |
| 13 | **Pestaña de contabilidad** | Pestaña **Contabilidad**: listado (tarjetas en el móvil), filtros (empresa, estado, año, trimestre, búsqueda), totales facturado / cobrado / pendiente / IVA, y exportación a Excel (CSV). |
| 14 | **Que sea una app y que Fran la tenga en el móvil** (petición del usuario, 02/11/2026) | App web instalable (PWA): se abre con un enlace y se añade a la pantalla de inicio en Android e iPhone. Funciona sin internet, tiene el menú abajo y envía el PDF por WhatsApp o correo. |

## Interpretaciones tomadas

- **Numeración:** al principio se tomó como “una por cada empresa emisora”. El usuario confirmó después que
  es **por cliente** (“sí, es cliente”), y así está ahora.
- **Plantilla:** “La plantilla de cada empresa con su logo y sus datos” se refiere a las empresas que emiten la
  factura. Por eso se pueden tener varias, cada una con su plantilla.
- El tramo final del audio 1 se oye poco claro. Se ha entendido como la **firma**, la **fecha** y el
  **número de cuenta** que Fran pasará más adelante. Por eso el IBAN es un campo de la empresa.
