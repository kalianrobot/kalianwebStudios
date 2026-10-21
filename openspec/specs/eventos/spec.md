# Capability: eventos

Consolidado a partir de (ver `openspec/changes/archive/`):
`add-informe-cierre-evento`, `add-reparto-taquilla-evento`,
`update-reparto-neto-por-variante`.

## Requirements

### Requirement: Informe de cierre de evento en PDF

El sistema DEBE permitir a un usuario con rol `admin` descargar, para
un evento cuya fecha ya haya pasado, un PDF interno que reconcilie
asistencia y caja de ese evento.

El PDF DEBE contener, como mínimo:

- Cabecera con título del evento, fecha, aforo máximo y aforo final
  (`aforo_actual` al cierre).
- Sección "Entradas efectivas (QR)": una fila por documento de
  `asistencia_eventos` con `eventoId == <id>` y `tipo` en
  `{'reserva', 'reserva_socio', 'socio_carnet'}`, con nombre o DNI,
  tipo, precio y hora.
- Sección "Reservas no presentadas": una fila por cada `slot` de
  `reservas` del evento cuyo `ingresado != true` y cuya reserva no
  esté en estado `cancelada` ni `anulada`, con nombre o DNI del slot,
  tipo y precio reservado.
- Sección "Entradas puerta sin reserva (walk-in)": una fila por
  documento de `asistencia_eventos` con `tipo == 'walk-in'`, con hora,
  precio e identificador de socio si aplica.
- Sección "Caja del evento": desglose por método de pago
  (`Efectivo`, `Tarjeta`, `Transferencia`), calculado sumando
  `finanzas` con `categoria == 'Evento' && eventoId == <id>` agrupado
  por `metodo`.
- Sección "Reconciliación": total caja, suma de precios de asistencia
  efectiva y descuadre = `total_caja − Σ precio_asistencia`. Si el
  descuadre es distinto de 0, DEBE aparecer visualmente resaltado.
- Pie con timestamp de generación y `uid` del staff que lo generó.

El nombre del fichero DEBE tener el formato
`cierre-<slug-titulo>-<YYYYMMDD>.pdf`.

El botón NO DEBE aparecer para eventos futuros ni durante el evento en
curso.

Este PDF es de uso interno (contiene DNIs de no-shows) y NO incluye el
desglose de reparto Kalian/artista — eso vive en el "Recibí del
artista" (ver Requirement separado).

#### Scenario: Descarga por admin de un evento pasado
- **WHEN** un usuario con rol `admin` abre `/staff/eventos` y pulsa
  "Descargar cierre" en un evento cuya `fecha` es anterior a hoy
- **THEN** el navegador descarga un PDF cuyo nombre sigue el patrón
  `cierre-<slug>-<YYYYMMDD>.pdf` y cuyas secciones contienen los datos
  descritos

#### Scenario: Botón oculto para evento futuro
- **WHEN** el mismo usuario ve un evento con `fecha` posterior a hoy
- **THEN** el botón "Descargar cierre" no está presente

#### Scenario: Descuadre distinto de cero se hace evidente
- **WHEN** para el evento la suma de `finanzas` no coincide con la suma
  de precios de `asistencia_eventos` (por ejemplo, un ingreso registrado
  sin su correspondiente asistencia)
- **THEN** el PDF muestra el valor del descuadre en la sección
  "Reconciliación" con formato resaltado, y la cifra concreta permite
  al gerente iniciar la investigación manual

#### Scenario: Reserva parcialmente ingresada
- **WHEN** una reserva del evento tiene 4 `slots`, de los cuales 3
  quedaron con `ingresado == true` y 1 con `ingresado == false`
- **THEN** el PDF lista los 3 en "Entradas efectivas (QR)" y el 1
  restante en "Reservas no presentadas", sin agrupar

#### Scenario: Slot sin precio persistido
- **WHEN** un slot no presentado carece del campo `precio`
- **THEN** el PDF lo cuenta como `evento.precio_estandar` y anota
  "estimado" junto a esa fila, en vez de omitir el slot o fallar

### Requirement: `finanzas` es la fuente autoritativa de recaudación por evento

El total recaudado atribuible a un evento concreto DEBE calcularse
agregando los documentos de `finanzas` con `categoria == 'Evento'` y
`eventoId == <id>`. La colección `caja_eventos/{YYYY-MM}` NO DEBE
usarse para reportes por evento — sigue siendo un agregado mensual
para la vista rápida de puerta.

#### Scenario: Dos eventos el mismo día
- **WHEN** dos eventos distintos ocurren en el mismo mes y se pide el
  cierre de uno solo
- **THEN** el PDF muestra únicamente los ingresos cuyo `eventoId`
  coincide con el evento solicitado, sin sumar los del otro

### Requirement: Reparto de taquilla entre Kalian y artista, configurable por variante de precio

El sistema DEBE calcular, para cada entrada cobrada de un evento,
cuánto se queda Kalian como aportación y cuánto corresponde al
artista, con la aportación configurable **por variante de precio**
(no una comisión única para todo el evento).

Modelo:

- El doc `eventos/{id}` PUEDE contener 3 campos, todos `number`,
  `value >= 0`:
  - `aportacion_kalian_estandar`
  - `aportacion_kalian_descuento` (aplica si `tiene_descuento`)
  - `aportacion_kalian_cupon` (aplica si `cupon` configurado — el
    cupón de acceso anticipado, `evento.cupon`/`precioCupon`/
    `fechaCupon`)
- Si un campo no existe en el doc, se asume el valor por defecto
  `APORTACION_KALIAN_DEFAULT = 5` (`src/lib/constants.ts`).
- Al cobrar una entrada, el sistema DEBE calcular:
  - `variante ∈ { 'estandar', 'descuento_socio', 'cupon',
    'walkin_estandar', 'walkin_socio', 'gratis' }` a partir del
    contexto de cobro (reserva/socio/walk-in/cupón usado).
  - `precio` = el precio efectivamente cobrado de esa entrada.
  - `kalian_configurada` = `evento['aportacion_kalian_' +
    <segmento>]` donde el segmento depende de la variante:
    - `estandar`, `walkin_estandar`, `gratis` → `estandar`.
    - `descuento_socio`, `walkin_socio` → `descuento`.
    - `cupon` → `cupon`.
  - `kalian_efectiva = min(kalian_configurada, precio)` (nunca supera
    el precio; artista nunca negativo).
  - `artista = precio - kalian_efectiva`.
- Los campos `aportacion_kalian_*` DEBEN ser editables solo por rol
  `admin`, desde el formulario de `AdminEventos` (precarga el default
  al crear, valida en cliente `aportacion_kalian_X <= precio_X` antes
  de guardar). `firestore.rules` DEBE rechazar valores negativos, no
  numéricos, y valores que superen el precio de la misma variante
  cuando ese precio esté presente en la misma escritura o en el doc
  actual.

#### Scenario: Estándar con default
- **WHEN** un evento con `precio_estandar = 16` no tiene
  `aportacion_kalian_estandar` en el doc
- **THEN** una entrada estándar aplica `kalian_efectiva = 5` y
  `artista = 11`

#### Scenario: Cupón con comisión propia
- **WHEN** un evento con `precioCupon = 8` y
  `aportacion_kalian_cupon = 3` cobra una entrada por cupón
- **THEN** `kalian_efectiva = 3` y `artista = 5`

#### Scenario: Socio con descuento
- **WHEN** un evento con `precio_descuento = 12` y
  `aportacion_kalian_descuento = 5` cobra a un socio con membresía
  activa
- **THEN** `kalian_efectiva = 5` y `artista = 7`

#### Scenario: Cap por precio menor
- **WHEN** un evento tiene `precioCupon = 4` y
  `aportacion_kalian_cupon = 5` (mal configurado)
- **THEN** al cobrar por cupón `kalian_efectiva = 4` y `artista = 0`,
  y la UI del formulario del evento DEBE haber avisado del error de
  configuración antes de guardar

#### Scenario: Entrada gratuita
- **WHEN** una entrada tiene `precio = 0` sea cual sea la variante
- **THEN** `kalian_efectiva = 0` y `artista = 0`

#### Scenario: Escritura rechazada por firestore.rules
- **WHEN** un cliente intenta escribir `aportacion_kalian_estandar =
  -1` o `aportacion_kalian_cupon = "tres"`
- **THEN** `firestore.rules` rechaza la operación

### Requirement: Recibí para el artista en PDF

El sistema DEBE permitir a un usuario con rol `admin` descargar, para
un evento cuya fecha ya haya pasado, un PDF titulado "Recibí del
artista" que contenga:

- Cabecera con título del evento, fecha, y nombre del artista si
  `evento.artista` existe (espacio en blanco si no).
- Tabla con **una fila por entrada efectiva** (documentos de
  `asistencia_eventos` con `eventoId == <id>` reflejados en
  `finanzas`, `tipo` en `{'reserva', 'reserva_socio', 'socio_carnet',
  'walk-in'}`):
  - Fecha y hora del cobro.
  - Variante de precio (leída de `finanzas.variante_precio`, o
    reconstruida por fallback si el doc de `finanzas` es histórico).
  - Bruto (`monto_bruto`, con fallback a `monto`).
  - Kalian (`monto`).
  - Artista (`monto_artista`, con fallback a 0).
- Totales al pie: bruto total, Kalian total, artista total.
- Recibí firmable: "Recibí de Kalian HKG la cantidad de ______ € en
  concepto de caché del evento", con línea para firma y DNI del
  artista.

El nombre del fichero DEBE seguir el patrón
`recibi-<slug-titulo>-<YYYYMMDD>.pdf`.

El botón NO DEBE aparecer para eventos futuros ni durante el evento
en curso.

Este PDF DEBE ser distinto del "PDF de cierre". NO DEBE incluir datos
personales de asistentes (DNIs, nombres de reservas no presentadas).

#### Scenario: Descarga de un evento pasado
- **WHEN** un admin abre `/staff/eventos` y pulsa "Recibí para el
  artista" en un evento cuya `fecha` es anterior a hoy
- **THEN** el navegador descarga un PDF `recibi-<slug>-<YYYYMMDD>.pdf`
  con las secciones descritas

#### Scenario: PDF omite datos de asistentes
- **WHEN** el evento tiene reservas no presentadas con nombre y DNI
  registrados
- **THEN** el "Recibí del artista" NO incluye ninguno de esos datos
  personales (solo agregados y precios)

#### Scenario: Recibí sobre evento histórico sin campos nuevos
- **WHEN** el evento es previo al despliegue de este cambio y los
  docs de `finanzas` no llevan `monto_bruto`, `monto_artista` ni
  `variante_precio`
- **THEN** el PDF aplica fallback (`monto_bruto = monto`,
  `monto_artista = 0`, `variante = 'estandar'`) y muestra un aviso al
  pie: "Datos históricos: la comisión Kalian se aplicó al 100% del
  cobro"
