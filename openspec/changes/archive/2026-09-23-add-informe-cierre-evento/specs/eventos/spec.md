# Delta — capability: eventos

## ADDED Requirements

### Requirement: Informe de cierre de evento en PDF

El sistema DEBE permitir a un usuario con rol `admin` descargar, para
un evento cuya fecha ya haya pasado, un PDF que reconcilie asistencia
y caja de ese evento.

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
