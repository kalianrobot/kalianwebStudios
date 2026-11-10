## ADDED Requirements

### Requirement: Descuento de socio por academia configurable en cada evento

Cada evento DEBE poder indicar qué academias dan derecho al precio de socio mediante `academias_descuento` (lista de nombres de academia; el valor especial `local` representa a los socios con local de ensayo).

Un socio DEBE recibir el precio de socio en un evento con `tiene_descuento == true` si y solo si alguna entrada de `socios.membresias` cumple a la vez:
- su clave coincide, sin distinguir mayúsculas ni espacios sobrantes, con un elemento de `academias_descuento` del evento, y
- su fecha es igual o posterior a la fecha actual.

Si el evento no tiene `academias_descuento`, el sistema DEBE usar la equivalencia:
- `categoria == 'musica'` → `['Music is Cool', 'local', 'musica']`
- `categoria == 'danza'` → `['SBK CLUB', 'danza']`
- cualquier otro valor → sin descuento.

La cuota mensual NO DEBE influir en el descuento.

La misma regla DEBE aplicarse al calcular el precio de una reserva (cliente y `calcularPrecioReserva`), al registrar en puerta el carnet de un socio, al verificar como socio una plaza de una reserva y al registrar una entrada de socio sin reserva.

`firestore.rules → isValidEvento` DEBE rechazar un `academias_descuento` que no sea una lista o que tenga más de 20 elementos.

#### Scenario: Socio de Music is Cool en un concierto
- **WHEN** un socio con `membresias["Music is Cool"] = "2027-06-28"` reserva un evento con `academias_descuento = ["Music is Cool", "local"]` y `precio_descuento = 10`
- **THEN** el precio del titular es 10 € y la reserva queda marcada como socio

#### Scenario: Academia no marcada en el evento
- **WHEN** un socio con membresía en vigor solo de "SBK CLUB" reserva un evento con `academias_descuento = ["Music is Cool", "local"]`
- **THEN** paga el precio estándar

#### Scenario: Membresía caducada
- **WHEN** la membresía de "Music is Cool" del socio venció ayer
- **THEN** no recibe el descuento

#### Scenario: Evento antiguo sin el campo nuevo
- **WHEN** un evento con `categoria = 'musica'` y sin `academias_descuento` recibe la entrada de un socio con `membresias["Music is Cool"]` en vigor
- **THEN** se aplica el precio de socio

#### Scenario: Diferencias de mayúsculas y espacios
- **WHEN** la membresía del socio está guardada como `"music is cool "` y el evento marca `"Music is Cool"`
- **THEN** se considera la misma academia y se aplica el descuento

#### Scenario: Carnet de socio en puerta
- **WHEN** el portero escanea el carnet de un socio de "SBK CLUB" con membresía en vigor en un evento con `academias_descuento = ["SBK CLUB"]`
- **THEN** la entrada se registra con el precio de socio y variante `descuento_socio`

#### Scenario: Valor inválido rechazado
- **WHEN** un admin intenta guardar un evento con `academias_descuento = "Music is Cool"` (texto, no lista)
- **THEN** `firestore.rules` rechaza la escritura
