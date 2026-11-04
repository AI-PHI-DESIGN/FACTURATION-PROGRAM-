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
| 15 | **Diseño moderno + “lo que tú harías”** (petición del usuario) | Rediseño completo: menú lateral en el ordenador y barra inferior con botón + en el móvil, modo oscuro y botón «atrás». Nuevas funciones: panel de **Inicio** (pendiente, vencido, cobrado del mes, facturado del año, IVA del trimestre y gráfico mensual), **vencimientos** y estado **Vencida**, **recordatorio de cobro** por WhatsApp o email, **retención de IRPF** opcional, **Deshacer**, CSV para el gestor que se comparte desde el móvil. |
| 16 | **Factura de ejemplo** de la empresa de Fran (PDF hecho en Word) | Plantilla **Clásica** con la misma disposición: logo y datos arriba a la izquierda, casillas «Factura» y «Fecha», cliente a la derecha, «CONCEPTO:» en un párrafo con el **importe en letra**, tabla pequeña de totales, «Ciudad, fecha», firma, «Fdo.:», **cargo** (Arquitecto), «Ruego abonen importe en la cuenta…» y **nota legal** en azul (criterio de caja). Número con formato **`A 15/26`** (código, número y año; empieza cada año). |
| 18 | **«Invéntate los datos donde sale, así quería la plantilla»** | La plantilla clásica es la buena. Botón **«Ver un ejemplo»** en la bienvenida: carga una empresa, clientes y facturas **inventados** (DELTA ESTUDIO DE ARQUITECTURA S.L., A 14/26, A 15/26, CP 3/26) y avisa de que son de ejemplo. «Borrar el ejemplo» solo quita esos datos. Las capturas y el PDF de `docs/` están hechos con esos datos. La vista previa de la plantilla también usa datos inventados. |
| 19 | **Que también la use su madre** | La app no es solo de Fran: cualquiera la abre con el mismo enlace, la instala y da de alta su empresa. Cada móvil guarda sus datos aparte. Si se quiere dejar preparada, se le hace su propio JSON de configuración privado. |
| 20 | **«Una IA a la que le pases un PDF y te ponga los datos del cliente»** | Botón **«Rellenar con IA desde un PDF o una foto»** en el editor de facturas y en la ficha de cliente. Usa Claude (Opus 5.5, SDK oficial) con salida JSON con esquema y con nuestras empresas excluidas. Los datos se **revisan** antes de usarlos. Si el CIF ya existe, se elige ese cliente. La clave se pone en Ajustes (o la primera vez) y no va en las copias. |
| 21 | **«Que la app tenga un usuario y contraseña por persona y que, una vez dentro, tengan todos sus proyectos»** | **Cuentas** con Firebase (acceso con contraseña + base de datos Firestore). Al abrir, la app pide **correo y contraseña** (o «Crear cuenta»); si se olvida la contraseña, llega un enlace al correo. Cada persona ve **solo sus** empresas, clientes y facturas, en **cualquier móvil u ordenador** y en tiempo real. Sin internet sigue funcionando y sube los cambios después. Si el móvil ya tenía facturas, pregunta si se pasan a la cuenta. **Ajustes → Mi cuenta**: cambiar la contraseña y cerrar la sesión. Activado el 04/11/2026 con el proyecto de Firebase `facturacion-536fc` (pasos en [`CUENTAS.md`](CUENTAS.md)). |
| 17 | **Logos** de las dos empresas | Se suben en la ficha de cada empresa. El logo Φ venía dentro de la factura de ejemplo. Los datos reales **no** se guardan en el repositorio (es público): van en un archivo de configuración privado. |

## Interpretaciones tomadas

- **Numeración:** al principio se tomó como “una por cada empresa emisora”. El usuario confirmó después que
  es **por cliente** (“sí, es cliente”), y así está ahora.
- **Plantilla:** “La plantilla de cada empresa con su logo y sus datos” se refiere a las empresas que emiten la
  factura. Por eso se pueden tener varias, cada una con su plantilla.
- **Formato del número:** la factura de ejemplo es la «A 15/26». Se ha tomado «A» como el código del cliente
  (numeración por cliente). Si fuera la serie de la empresa, en la ficha de la empresa se elige «Una sola
  numeración para toda la empresa» con la serie «A»: el número sale igual.
- El tramo final del audio 1 se oye poco claro. Se ha entendido como la **firma**, la **fecha** y el
  **número de cuenta** que Fran pasará más adelante. Por eso el IBAN es un campo de la empresa.
