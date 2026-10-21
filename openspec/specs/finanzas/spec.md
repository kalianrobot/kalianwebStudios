# Capability: finanzas

Consolidado a partir de (ver `openspec/changes/archive/`):
`update-reparto-neto-por-variante`.

## Requirements

### Requirement: Movimiento de entrada de evento con desglose bruto / neto Kalian / artista

Cada documento `finanzas/{id}` con `categoria == 'Evento'` que
represente una entrada cobrada en puerta DEBE persistir el desglose
completo del reparto entre Kalian y el artista.

Campos:

- `monto` — aportación **neta Kalian** de esa entrada. Es el valor
  que `AdminContabilidad` suma para reportar el ingreso real de la
  casa por ese evento.
- `monto_bruto` — total cobrado en caja para esa entrada. Debe
  coincidir con lo que el portero recibió del asistente en efectivo /
  tarjeta / transferencia.
- `monto_artista` — parte que corresponde al artista, calculada como
  `monto_bruto − monto`. Nunca negativa.
- `variante_precio` — enum: `'estandar' | 'descuento_socio' | 'cupon'
  | 'walkin_estandar' | 'walkin_socio' | 'gratis'`.

Invariantes:

- `monto ≥ 0`, `monto_bruto ≥ 0`, `monto_artista ≥ 0`.
- `monto + monto_artista == monto_bruto` (tolerancia entera).
- `variante_precio` DEBE pertenecer al enum.

Firestore rules:

- El validator de `finanzas` (`isValidFinanza`) DEBE aceptar los
  cuatro campos como opcionales (compatibilidad con docs históricos)
  y, cuando estén presentes los tres relevantes, verificar la
  coherencia `monto == monto_bruto - monto_artista` y el enum de
  `variante_precio`.

Fallback de lectura (para consumidores como `AdminContabilidad`, el
PDF de cierre y el Recibí del artista):

- Si `monto_bruto` no existe → `monto_bruto = monto`.
- Si `monto_artista` no existe → `monto_artista = 0`.
- Si `variante_precio` no existe → `variante_precio = 'estandar'`.

Esta redefinición del significado de `monto` aplica **solo** a docs
con `categoria == 'Evento'`. Para el resto de categorías (`Socio`,
`Curso`, `Aportación Socio Local`, `Cierre Aportación Curso`,
`cuota_socio`) `monto` mantiene su significado actual: total del
movimiento.

#### Scenario: Escritura al cobrar una entrada estándar
- **WHEN** el portero cobra una entrada estándar de `precio_estandar
  = 16` en un evento con `aportacion_kalian_estandar = 5`
- **THEN** el nuevo doc `finanzas/{id}` contiene `monto: 5,
  monto_bruto: 16, monto_artista: 11, variante_precio: 'estandar',
  categoria: 'Evento'`

#### Scenario: Coherencia rechazada en Firestore
- **WHEN** un cliente intenta escribir `monto: 5, monto_bruto: 16,
  monto_artista: 20, categoria: 'Evento', variante_precio: 'estandar'`
  (los tres no cuadran)
- **THEN** `firestore.rules` rechaza la operación

#### Scenario: Doc histórico sin los campos nuevos
- **WHEN** `AdminContabilidad` lee un doc previo al despliegue del
  cambio que solo contiene `monto: 16, categoria: 'Evento'`
- **THEN** aplica fallback y muestra `bruto: 16 €, kalian: 16 €,
  artista: 0 €` para esa fila, sin escribir nada en el doc

#### Scenario: `AdminContabilidad` suma neto Kalian por evento
- **WHEN** un evento tiene 72 entradas con `monto: 5, monto_bruto:
  16` cada una
- **THEN** la fila padre del evento en `AdminContabilidad` muestra
  `Bruto 1152 € · Kalian 360 € · Artista 792 €`, y `Kalian` (el neto)
  es el que se suma al total mensual de la categoría "Evento"

#### Scenario: Categorías no-evento no se ven afectadas
- **WHEN** se registra una cuota de socio en `finanzas` con
  `categoria: 'Socio'` y `monto: 15`
- **THEN** el doc sigue sin llevar `monto_bruto`, `monto_artista` ni
  `variante_precio`, y el significado de `monto` permanece intacto:
  la suma de `finanzas` con `categoria: 'Socio'` sigue reportando el
  total cobrado
