# Diseño — add-informe-cierre-evento

## Decisiones

### D1. PDF client-side, no Cloud Function

Todo el cálculo y la generación del PDF ocurren en el navegador del
staff (rol `admin`).

Ventajas:

- `jspdf` y `jspdf-autotable` ya están en el bundle
  (`descargarListadoEmergencia` los usa).
- Las tres colecciones que se leen (`reservas`, `asistencia_eventos`,
  `finanzas`) ya son legibles por `admin` desde el cliente.
- No hay latencia de despliegue de Function ni consumo de invocaciones.
- El descuadre del 19-sep-2026 se puede reproducir hoy mismo con el
  mismo login del gerente.

Coste:

- El navegador debe traerse todos los docs del evento. Para eventos de
  hasta ~500 asistencias el orden es despreciable; por encima
  reevaluamos.
- El PDF no queda archivado en el backend. Si más adelante se quiere
  histórico firmable, se moverá a Function (`generarInformeCierre`) que
  suba el PDF a Storage.

### D2. Fuente autoritativa de la caja: `finanzas`, no `caja_eventos`

`caja_eventos/{YYYY-MM}` guarda un `total` mensual acumulado. No
distingue por `eventoId` ni por método de pago. Sirve para el mini-panel
de puerta ("cuánto llevo hoy") y nada más.

`finanzas` sí tiene `eventoId`, `metodo`, `monto`, `socio_id`,
`staff_id` y `fecha`. Es la fuente correcta para reconciliar un evento
concreto.

Consecuencia visible: el PDF puede mostrar un total distinto al que ve
el portero en su pantalla de "resumen del día" si en el mismo día hubo
más de un evento. Esto es correcto, no un bug. Hay que dejarlo por
escrito en `SPEC.md`.

### D3. Cómo se cuentan las "reservas no presentadas"

Una reserva puede tener varios `slots[]`. Para el informe:

- Se lista **cada slot** cuya `ingresado != true` y cuya reserva no
  esté en estado `cancelada` ni `anulada`.
- No se agrega por reserva: si una reserva de 4 tenía 3 presentes y
  1 no, aparece esa 1 fila en "no presentadas" y las otras 3 en
  "entradas por QR".
- Precio del no-show = `slot.precio` si existe, si no `evento.precio_estandar`.
  Anotar como "estimado" cuando se cae al precio del evento.

### D4. Reconciliación

`descuadre = total_caja − Σ precio_asistencia_efectiva`

Interpretación:

- `descuadre == 0` — OK.
- `descuadre > 0` — hay ingresos sin asistencia detrás (¿walk-in mal
  registrado? ¿donación mezclada?). Bloquea la liquidación con los
  músicos.
- `descuadre < 0` — hay asistencia sin ingreso (¿entrada gratis no
  marcada? ¿precio faltante?).

El PDF **no cierra el descuadre**: solo lo hace visible. La resolución
sigue siendo manual desde `AdminContabilidad`.

## Alternativas descartadas

### A1. Cloud Function que genera y firma el PDF

Demasiada infraestructura para un informe interno. Reservado para
cuando aparezca requisito de trazabilidad legal.

### A2. Reutilizar `descargarListadoEmergencia`

Ese PDF vive en `ControlAcceso` y está pensado para *durante* el
evento: lista reservas para pasar a mano si cae internet. Mezclar los
dos usos confunde a la puerta y al staff. Se mantiene aparte.

### A3. Sumar `caja_eventos` filtrando por evento

Imposible: `caja_eventos` no guarda `eventoId`, es acumulado mensual.

## Preguntas abiertas

- **¿"Finalizado" es un estado del evento?** Verificar en
  `AdminEventos` si existe `evento.estado` o si nos basamos solo en la
  fecha. Si existe, usarlo (mejor UX: el evento se puede marcar
  "cerrado" a mano tras conciliar).
- **¿Se guarda algún registro de que el cierre se generó?** Propuesta:
  añadir `evento.cierre_generado_at` y `evento.cierre_generado_por`
  como side-effect del botón. Fuera de alcance de esta primera versión;
  abrir cambio aparte si se decide.
