# Delta — capability: eventos

## ADDED Requirements

### Requirement: Reparto de taquilla entre Kalian y artista

El sistema DEBE calcular, para cada evento con asistencia efectiva,
cuánto se queda Kalian como comisión y cuánto se paga al artista.

Regla de cálculo:

- Sea `C = evento.comision_kalian_por_entrada` (€). Si el campo no
  existe en el doc, `C = 5` (valor por defecto).
- Para cada asistencia efectiva `A` (documento de
  `asistencia_eventos` con `eventoId == <id>` y `A.precio > 0`):
  - `comision_kalian(A) = min(C, A.precio)`
  - `a_pagar_artista(A) = A.precio − comision_kalian(A)`
- Asistencias con `A.precio == 0` NO generan ni comisión ni pago a
  artista.
- Los slots de reservas no presentados NO entran en el cálculo.
- `total_comision_kalian = Σ comision_kalian(A)`
- `total_a_pagar_artista = Σ a_pagar_artista(A)`

El campo `comision_kalian_por_entrada` DEBE:

- Persistirse en el documento `eventos/{id}` como `number` con
  `value >= 0`.
- Ser editable únicamente por rol `admin`.
- Ser rechazado por `firestore.rules` si es negativo, no numérico o
  ausente en una escritura donde el resto de campos indican alta o
  edición explícita del evento (validator del evento).
- Poder editarse en cualquier momento; el cálculo del cierre usa el
  valor vigente al generar el PDF (no se guarda snapshot en esta
  versión).

#### Scenario: Cálculo con entrada estándar
- **WHEN** un evento con `comision_kalian_por_entrada = 5` tiene una
  asistencia efectiva de `precio = 10`
- **THEN** `comision_kalian = 5` y `a_pagar_artista = 5` para esa
  asistencia

#### Scenario: Entrada con descuento por debajo de la comisión
- **WHEN** en el mismo evento hay una asistencia con `precio = 3`
  (socio con descuento)
- **THEN** `comision_kalian = 3` y `a_pagar_artista = 0`, nunca
  valores negativos

#### Scenario: Entrada gratuita
- **WHEN** una asistencia tiene `precio = 0`
- **THEN** ni Kalian ni el artista reciben nada por esa asistencia y
  no aparece en el cálculo del reparto

#### Scenario: No-show no genera pago al artista
- **WHEN** una reserva con `slot.precio = 10` no se presentó
  (`ingresado != true`)
- **THEN** ese slot no suma en `total_a_pagar_artista` ni en
  `total_comision_kalian`

#### Scenario: Evento sin campo de comisión configurado
- **WHEN** el doc del evento no incluye `comision_kalian_por_entrada`
- **THEN** el cálculo aplica el valor por defecto `5` €

#### Scenario: Escritura rechazada por Firestore
- **WHEN** un cliente intenta escribir
  `comision_kalian_por_entrada = -1` o
  `comision_kalian_por_entrada = "cinco"`
- **THEN** `firestore.rules` rechaza la operación

## MODIFIED Requirements

### Requirement: Informe de cierre de evento en PDF

El sistema DEBE permitir a un usuario con rol `admin` descargar, para
un evento cuya fecha ya haya pasado, un PDF que reconcilie asistencia
y caja de ese evento y que además explicite el reparto entre Kalian y
el artista.

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
- Sección "Reparto": nombre del artista (si `evento.artista` está
  disponible; espacio en blanco si no), comisión por entrada aplicada,
  `total_comision_kalian`, `total_a_pagar_artista` y un recibí con
  línea para firma y DNI del artista.
- Pie con timestamp de generación y `uid` del staff que lo generó.

El nombre del fichero DEBE tener el formato
`cierre-<slug-titulo>-<YYYYMMDD>.pdf`.

El botón NO DEBE aparecer para eventos futuros ni durante el evento en
curso.

#### Scenario: PDF incluye la sección de reparto
- **WHEN** un admin descarga el cierre de un evento pasado con
  `comision_kalian_por_entrada = 5` y 20 asistencias efectivas a
  `precio = 10`
- **THEN** el PDF contiene una sección "Reparto" con
  `total_comision_kalian = 100 €`, `total_a_pagar_artista = 100 €` y
  un recibí en blanco para la firma del artista

#### Scenario: Comisión aplicada en el PDF es la del doc del evento
- **WHEN** el evento tiene explícitamente
  `comision_kalian_por_entrada = 3` en su documento
- **THEN** el PDF aplica 3 € por entrada (no el default de 5 €) y lo
  indica en la sección "Reparto"

#### Scenario: Recibí queda en blanco si no hay artista
- **WHEN** el evento no tiene `evento.artista` poblado
- **THEN** el PDF deja la línea "Artista: ______" en blanco para
  rellenar a mano, sin bloquear la generación
