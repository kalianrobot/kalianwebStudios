# Diseño — add-reparto-taquilla-evento

## Decisiones

### D1. Comisión editable por evento, no global

`evento.comision_kalian_por_entrada` vive en el doc del evento, no en
`config/global` ni hardcoded.

Razón: el gerente ya avisa que 5 € es la regla actual, pero para
festivales, colaboraciones o eventos benéficos hará falta cambiarla
puntualmente. Hacerlo por evento evita tener que abrir código o
crear un flujo de "override".

Coste: si el gerente olvida ajustar el campo, se aplica el default y
puede reclamar más al artista de lo pactado. Se mitiga con un aviso UI
cuando la comisión configurada difiere de `COMISION_KALIAN_DEFAULT`
y con la firma del artista al recibir en el PDF.

### D2. Comisión capada al precio de la entrada

`comision_efectiva = min(evento.comision_kalian_por_entrada, entrada.precio)`

Sin cap, una entrada con descuento de socio a 3 € generaría comisión
5 € para Kalian y `-2 €` a pagar al artista. Absurdo.

Con cap, para una entrada de 3 € la comisión es 3 € y el artista
recibe 0 €. Sigue siendo cuestionable económicamente, pero es
consistente: Kalian nunca paga por acoger.

### D3. Los no-shows NO generan reparto

Solo cuentan las entradas de `asistencia_eventos` con `precio > 0`
efectivamente cobradas. Las reservas no presentadas ya son un ingreso
"fantasma" (dinero que no entró en caja) y no deben inflar el pago al
artista.

Excepción no cubierta: si en algún evento se cobra por reserva no
presentada (deposit no reembolsable), habría que reevaluar. Hoy no es
el caso.

### D4. Fallback para eventos históricos

Documentos de `eventos` sin `comision_kalian_por_entrada` asumen
`COMISION_KALIAN_DEFAULT = 5`.

Alternativa descartada: backfill masivo. No aporta valor mientras la
regla real haya sido siempre 5 €; si en el futuro cambia, se
congelará el valor en el evento al marcarlo "finalizado" y punto.

### D5. Snapshot al finalizar, opcional (futuro)

Hoy el cálculo del PDF usa el valor actual del campo. Si la comisión
se edita después del evento, el PDF cambia.

Cuando aparezca requisito de inmutabilidad (auditoría fiscal), se
introducirá un doc separado `cierre_evento/{eventoId}` con snapshot y
firma. Fuera de alcance de esta versión.

## Alternativas descartadas

### A1. Registrar el pago al artista automáticamente en `finanzas`

Al pulsar "Descargar cierre", crear un movimiento
`categoria: 'Pago Artista'` con `monto = -a_pagar_artista`.

Descartado por ahora: mezcla el flujo de generación de PDF con la
liquidación, que suele ocurrir minutos u horas después (cuando el
artista firma). Mejor mantener el PDF read-only y que el egreso lo
registre a mano el gerente cuando efectivamente pague.

Reevaluar cuando haya un botón explícito "Liquidar artista".

### A2. Comisión porcentual en vez de fija

"Kalian se queda el 20%". Más flexible pero fuera de lo que ha
pedido el gerente. Y con el modelo actual de precios variables por
socio/estándar generaría cantidades no redondas incómodas para el
efectivo. Mantenemos fija por entrada; añadir porcentual si aparece
en el futuro.

## Preguntas abiertas

- **¿Existe ya `evento.artista` en el modelo?** Verificar en
  `AdminEventos` y `SPEC.md §5`. Si no existe, este cambio NO lo
  introduce (una cosa a la vez). El PDF muestra un espacio en blanco
  para escribirlo a mano hasta que se abra otro cambio para
  formalizar el campo.
- **¿La liquidación se hace siempre en efectivo del sobre?** Si es
  así, el PDF puede advertir "efectivo disponible = <caja efectivo>"
  y avisar si no llega para pagar al artista. Lo dejamos como mejora
  post-MVP.
