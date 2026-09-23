# Delta — capability: eventos

## MODIFIED Requirements

### Requirement: Reparto de taquilla entre Kalian y artista

El sistema DEBE calcular, para cada evento con asistencia efectiva,
cuánto se queda Kalian como comisión y cuánto se paga al artista, con
la comisión configurable **por variante de precio**.

Modelo:

- El doc `eventos/{id}` PUEDE contener 3 campos, todos `number`,
  `value >= 0`:
  - `aportacion_kalian_estandar`
  - `aportacion_kalian_descuento` (aplica si `tiene_descuento`)
  - `aportacion_kalian_cupon` (aplica si `cupon` configurado)
- Si un campo no existe en el doc, se asume el valor por defecto `5`.
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
  `admin`. `firestore.rules` DEBE rechazar valores negativos, no
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

## ADDED Requirements

### Requirement: Recibí para el artista en PDF

El sistema DEBE permitir a un usuario con rol `admin` descargar, para
un evento cuya fecha ya haya pasado, un PDF titulado "Recibí del
artista" que contenga:

- Cabecera con título del evento, fecha, y nombre del artista si
  `evento.artista` existe (espacio en blanco si no).
- Tabla con **una fila por entrada efectiva** (documentos de
  `asistencia_eventos` con `eventoId == <id>` y `tipo` en
  `{'reserva', 'reserva_socio', 'socio_carnet', 'walk-in'}`):
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

Este PDF DEBE ser distinto del "PDF de cierre" del cambio previo. NO
DEBE incluir datos personales de asistentes (DNIs, nombres de
reservas no presentadas).

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
  pie: "Datos históricos: la comisión Kalian se aplicó al 100 % del
  cobro"

## REMOVED Requirements

### Requirement: Reparto de taquilla entre Kalian y artista (versión con `comision_kalian_por_entrada`)

**Razón**: el campo único `comision_kalian_por_entrada` introducido
por `add-reparto-taquilla-evento` no permite comisiones distintas por
variante de precio (estándar, socio, cupón). El gerente requiere
configuración diferenciada porque los cupones promocionales tienen
economía propia.

**Migración**: `add-reparto-taquilla-evento` no ha llegado a código
(solo estaba en OpenSpec). El nuevo Requirement "Reparto de taquilla
entre Kalian y artista" (arriba, en MODIFIED) lo supersede. No hay
datos de `evento.comision_kalian_por_entrada` en producción. Si en
algún doc apareciera durante la implementación, se ignora en lectura
y se elimina en la próxima edición del evento por parte de admin.
