# Diseño — update-reparto-neto-por-variante

## Decisiones

### D1. Aportación Kalian por variante, no una constante

Reemplaza `comision_kalian_por_entrada` (única) por 3 campos, uno por
cada precio que un evento pueda cobrar:

- `aportacion_kalian_estandar`
- `aportacion_kalian_descuento`
- `aportacion_kalian_cupon`

Razón: en la práctica no todos los tramos deben tener la misma
comisión. Un cupón promocional a 8 € puede dar solo 3 € a la casa; el
precio de socio puede mantener los 5 € o subirse porque el descuento
lo asume Kalian. El gerente ha pedido explícitamente que "también en
los cupones" pueda configurarse.

Coste: 3 inputs en el formulario en vez de 1. Mitigado con default 5
en los tres y visibilidad condicional (solo aparecen los que aplican).

### D2. `monto` cambia de significado para entradas de evento

Hasta ahora `finanzas.monto` en una entrada de evento era el bruto
cobrado en caja. Con este cambio pasa a ser **el neto Kalian** de esa
entrada, y se añaden `monto_bruto` y `monto_artista` como campos
paralelos.

Razón: `AdminContabilidad.agruparMovimientos` ya suma `monto`. Si
`monto = neto Kalian`, el total del evento en Contabilidad refleja
directamente lo que se queda la casa, sin cambiar la lógica de suma
ni el resto de flujos (cuotas de socio, cursos, aportaciones locales)
que también viven en `finanzas` y para los que `monto` sigue siendo
lo que era.

Coste: cambio semántico. Se mitiga con:

- Fallback en lectura para docs históricos (`monto_bruto ?? monto`,
  `monto_artista ?? 0`). Los docs previos se leen como "todo Kalian,
  0 artista" — que es exactamente lo que era la realidad hasta ahora.
- Nota destacada en `SPEC.md §5 finanzas`.
- El único consumidor sensible (`AdminContabilidad`) se actualiza en
  el mismo PR para mostrar los tres montos por separado.

### D3. `variante_precio` explícita en el doc

En vez de reconstruir la variante desde `slot.tipo`,
`slot.estado`, `walkIn` y `metodo`, se persiste como campo dedicado
`variante_precio: VariantePrecio`.

Razón: el PDF del artista lo pide expresamente para desglosar por
tipo. Reconstruir a posteriori es frágil (el enum de `slot.estado`
puede cambiar, `walkIn` no distingue socio vs estándar sin releer el
`socio_id`).

Coste: un enum más. Estrictamente controlado en `firestore.rules`.

### D4. Fallback en lectura, sin migración de datos

Los `finanzas` históricos no llevan los campos nuevos.

- Al leer, si faltan: `monto_bruto = monto`, `monto_artista = 0`,
  `variante = 'estandar'`.
- No se ejecuta ningún backfill.

Razón: hasta este cambio, la realidad económica era "Kalian se lo
queda todo, no había pago a artista formalizado". El fallback lo
refleja fielmente. Un backfill artificial (por ejemplo, restar 5 €
retroactivamente a cada entrada) falsificaría el registro contable
del histórico.

### D5. PDF "Recibí" separado del PDF "Cierre"

Dos PDFs distintos:

- **Cierre** (definido en `add-informe-cierre-evento`): interno para
  el staff. Cuadra caja, muestra descuadres, contiene datos personales
  (DNI de no-shows).
- **Recibí** (este cambio): externo para el artista. Solo desglose de
  su parte, sin DNIs de asistentes, con espacio para firma.

Razón: audiencias distintas → contenidos distintos. Mezclar los dos
implicaría entregar al artista más datos de los que debe ver.

### D6. `AdminCheckIn.tsx` deja de ser rama alternativa

Hoy `AdminCheckIn.tsx` (`~175-288`) suma a `caja_eventos` pero no
llama a `registrarIngreso`. Es deuda: las entradas registradas por esa
rama no aparecen en `finanzas` y por tanto tampoco en el PDF de cierre
ni en el Recibí del artista.

Se cierra aquí porque el resto del cambio queda cojo sin ello.

### D7. Cap al precio de la propia variante

`aportacion_kalian_X` se valida `0 ≤ x ≤ precio_X`. Si al cobrar la
comisión configurada superase el precio efectivo (por edición
posterior o edge case), se aplica `min(kalian, precio)` en cliente
para no producir `monto_artista` negativo.

Razón: coherencia con el cambio previo, sin dejar la validación a
"el gerente se acordará".

## Alternativas descartadas

### A1. Registrar dos movimientos por entrada (+16 ingreso, −11 egreso)

Duplica el volumen en `finanzas` (144 docs en vez de 72 para gospel).
Ensucia el resumen mensual y complica la agrupación por evento (¿la
UI muestra 72 o 144?). Descartado.

### A2. `caja_eventos` como neto Kalian

`caja_eventos` es write-only, nadie lo lee. Cambiar su semántica no
resuelve la petición (el gerente mira `AdminContabilidad`, no `caja_eventos`).
Descartado.

### A3. Comisión porcentual

"Kalian se queda el 30 %". Más flexible, pero cuentas no redondas
para efectivo y no lo ha pedido el gerente. Se puede introducir en un
cambio futuro sin romper este modelo (basta con calcular la
aportación al cobrar y persistirla como número; el schema no cambia).

### A4. Egreso automático "Pago Artista" al liquidar

Al pulsar "Descargar Recibí" crear en `finanzas` un movimiento
`categoria: 'Pago Artista'` con `monto = -Σ monto_artista`.

Descartado en este cambio: el pago se hace horas después de generar
el PDF, cuando el artista firma. Mejor mantener el PDF read-only y
que el egreso lo registre a mano el gerente cuando pague. Reevaluar
cuando haya botón explícito "Marcar como liquidado".

## Preguntas abiertas

- **Coherencia estricta `monto == monto_bruto − monto_artista` en
  `firestore.rules`**: con tolerancia entera es fácil, con decimales
  hay riesgo de redondeo. Todos los precios actuales son enteros;
  si esto cambia, revisar la regla.
- **Categoría `'Pago Artista'`**: no se introduce aquí (fuera de
  alcance). Cuando aparezca, será por un cambio propio que también
  amplíe el enum `CategoriaIngreso` a `CategoriaMovimiento` con
  signo.
- **`AdminCheckIn.tsx` tiene 3 puntos que hoy solo tocan
  `caja_eventos`**: verificar en implementación que los 3 se
  actualizan y que ninguno queda sin `registrarIngreso`.
