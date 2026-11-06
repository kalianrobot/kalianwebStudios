## MODIFIED Requirements

### Requirement: Recibí para el artista en PDF

El sistema DEBE permitir a un usuario con rol `admin` descargar, para un evento cuya fecha ya haya pasado, un PDF titulado "Recibí del artista" que refleje todas las entradas del evento y la liquidación con el artista.

Fuentes de datos:

- Entradas de pago: documentos de `finanzas` con `categoria == 'Evento'`, `eventoId == <id>` y sin `deletedAt`, con el fallback de lectura de la capability `finanzas` para docs históricos.
- Entradas gratuitas: documentos de `asistencia_eventos` con `eventoId == <id>` y `precio == 0`, con variante `gratis`.
- Pagos al artista: documentos de `finanzas` con `categoria == 'Pago Artista'`, `eventoId == <id>` y sin `deletedAt`.

El PDF DEBE contener, en este orden:

- Cabecera con título del evento, fecha y nombre del artista si `evento.artista` existe (espacio en blanco si no).
- **Resumen por tipo de entrada**: una fila por variante con al menos una entrada (`estandar`, `descuento_socio`, `cupon`, `walkin_estandar`, `walkin_socio`, `gratis`), con número de entradas, precio unitario (o rango mínimo–máximo si hay varios), bruto, Kalian y artista; y una fila de totales.
- **Liquidación**: total que corresponde al artista (suma de `monto_artista`), suma de pagos ya entregados (valor absoluto de `Pago Artista`) y pendiente (`total artista − pagado`, nunca negativo en la frase de recibí).
- **Avisos de control**, solo si hay alguno:
  - Variantes cuyo precio cobrado difiere del configurado en el evento para esa variante (`precio_estandar`, `precio_descuento`, `precioCupon`), indicando cuántas entradas.
  - Diferencia entre el número de entradas de pago registradas en `asistencia_eventos` y el número de movimientos `Evento` en `finanzas`.
- **Recibí firmable**: "Recibí de Kalian HKG la cantidad de <pendiente> € en concepto de caché del evento", con línea para firma y DNI del artista.
- **Anexo** con una fila por entrada (de pago o gratuita): fecha y hora, variante, bruto, Kalian y artista.
- Aviso de datos históricos si algún movimiento usó el fallback.

El nombre del fichero DEBE seguir el patrón `recibi-<slug-titulo>-<YYYYMMDD>.pdf`.

El botón NO DEBE aparecer para eventos futuros ni durante el evento en curso.

Este PDF DEBE ser distinto del "PDF de cierre". NO DEBE incluir datos personales de asistentes (nombres, DNIs, emails).

#### Scenario: Resumen con descuentos de socio y cupón
- **WHEN** un evento con `precio_estandar = 16`, `precio_descuento = 12`, `precioCupon = 8` y aportación Kalian 5 en las tres variantes tiene 10 entradas estándar, 4 de soci@ y 2 de cupón cobradas
- **THEN** el resumen muestra `Estándar 10 × 16 € = 160 € · Kalian 50 € · Artista 110 €`, `Soci@ 4 × 12 € = 48 € · Kalian 20 € · Artista 28 €`, `Cupón 2 × 8 € = 16 € · Kalian 10 € · Artista 6 €` y totales `224 € · 80 € · 144 €`

#### Scenario: Entradas gratuitas contadas
- **WHEN** el evento tiene 3 registros de asistencia con `precio == 0` y ningún movimiento en `finanzas` para ellos
- **THEN** el resumen incluye la fila `Gratis 3 × 0 €` con importes a 0 y el anexo lista esas 3 entradas

#### Scenario: Liquidación con pago previo
- **WHEN** el total para el artista es 144 € y existe un `Pago Artista` de `-100` para el evento
- **THEN** la sección de liquidación muestra `Total artista 144 € · Pagado 100 € · Pendiente 44 €` y la frase de recibí indica 44 €

#### Scenario: Precio cobrado distinto del configurado
- **WHEN** hay 2 entradas de variante `cupon` cobradas a 16 € y el evento tiene `precioCupon = 8`
- **THEN** el bloque de avisos indica que 2 entradas de cupón se cobraron a un precio distinto del configurado

#### Scenario: Diferencia entre puerta y contabilidad
- **WHEN** `asistencia_eventos` tiene 20 entradas con `precio > 0` y `finanzas` solo 19 movimientos `Evento`
- **THEN** el bloque de avisos indica una diferencia de 1 entrada entre puerta y contabilidad

#### Scenario: PDF omite datos de asistentes
- **WHEN** el evento tiene reservas y asistencias con nombre y DNI registrados
- **THEN** el "Recibí del artista" NO incluye ninguno de esos datos personales

#### Scenario: Evento histórico sin campos nuevos
- **WHEN** los docs de `finanzas` del evento no llevan `monto_bruto`, `monto_artista` ni `variante_precio`
- **THEN** el PDF aplica el fallback (`monto_bruto = monto`, `monto_artista = 0`, variante `estandar`) y muestra al pie: "Datos históricos: la comisión Kalian se aplicó al 100% del cobro"
