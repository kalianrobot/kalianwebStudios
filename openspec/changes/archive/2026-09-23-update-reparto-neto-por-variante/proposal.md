# update-reparto-neto-por-variante

## ¿Por qué?

Los dos cambios previos (`add-informe-cierre-evento`,
`add-reparto-taquilla-evento`) resuelven la liquidación del evento
mirando el bruto de caja y calculando el reparto **al generar el PDF**.
Al ver el resultado sobre el evento de gospel del 19-sep-2026, el
gerente ha refinado la petición en dos puntos que no cubren:

1. **La contabilidad de Kalian debe reflejar solo lo que Kalian se
   queda**, no el bruto. `AdminContabilidad` hoy suma `finanzas.monto`
   y muestra `+1152 €` para las 72 entradas (16 € × 72); debería
   mostrar `+360 €` netos y dejar `+792 €` explícitos como pasivo hacia
   el artista. Sin eso el balance mensual está inflado ×3.
2. **La aportación Kalian tiene que ser configurable por variante de
   precio**: 5 € en el estándar puede ser correcto, pero un cupón a
   8 € o una entrada de socio a 12 € pueden tener otra comisión. Los
   cupones ya existen (`evento.cupon`, `evento.precioCupon`,
   `evento.fechaCupon`) — el modelo actual los ignora en el reparto.

## ¿Qué cambia?

- Nuevos campos en `eventos/{id}`, todos `number ≥ 0`, todos con
  default 5 al crear:
  - `aportacion_kalian_estandar`
  - `aportacion_kalian_descuento` (aplica si `tiene_descuento`)
  - `aportacion_kalian_cupon` (aplica si `cupon`)
  - Validación cliente + regla: `aportacion_kalian_X ≤ precio_X`.
- `comision_kalian_por_entrada` (introducido por
  `add-reparto-taquilla-evento`, sin llegar a código) se retira: la
  regla nueva lo supersede.
- Nuevos campos en cada `finanzas/{id}` con `categoria == 'Evento'`:
  - `monto` — **cambia de significado**: pasa a ser la aportación
    **neta Kalian** de esa entrada. `AdminContabilidad`, que ya suma
    `monto`, refleja el neto sin cambios.
  - `monto_bruto` — lo cobrado en caja para esa entrada.
  - `monto_artista = monto_bruto − monto`.
  - `variante_precio ∈ { 'estandar', 'descuento_socio', 'cupon',
    'walkin_estandar', 'walkin_socio', 'gratis' }`.
- Fallback de lectura para docs `finanzas` históricos sin los campos
  nuevos: `monto_bruto ?? monto`, `monto_artista ?? 0`, `variante ??
  'estandar'`. Nada de migrar datos.
- `AdminContabilidad` muestra en la fila padre del evento y en cada
  hijo: `Bruto X · Kalian Y · Artista Z`.
- Nuevo PDF "Recibí del artista" (separado del PDF de cierre del
  cambio anterior), con desglose entrada a entrada: fecha/hora,
  variante, bruto, Kalian, artista. Pie firmable por el artista.
- `AdminCheckIn.tsx` — hoy suma a `caja_eventos` pero **no** llama a
  `registrarIngreso`. Se cierra ese gap y usa el mismo modelo.

## Impacto

- **Colecciones/reglas afectadas**:
  - `eventos`: 3 campos nuevos; ampliar `isValidEvento` en
    `firestore.rules` (rango 0 ≤ x ≤ precio de su variante).
  - `finanzas`: 4 campos nuevos en entradas de evento; ampliar el
    validator para aceptarlos y comprobar
    `monto = monto_bruto − monto_artista` cuando los tres estén
    presentes.
- **Cloud Functions afectadas**: ninguna directamente. `calcularPrecioReserva`
  sigue devolviendo el precio total (bruto); el desglose se calcula
  en cliente al cobrar.
- **UI afectada**:
  - `src/components/admin/AdminEventos.tsx` — 3 inputs nuevos +
    botón "Recibí para el artista".
  - `src/components/admin/ControlAcceso.tsx` — 3 puntos de cobro
    (~342, ~498, ~610) resuelven variante y persisten los 4 campos.
  - `src/components/admin/AdminCheckIn.tsx` — llama a
    `registrarIngreso` con el nuevo modelo (cierra el gap).
  - `src/components/admin/AdminContabilidad.tsx` —
    `agruparMovimientos` suma bruto/artista con fallback, y el
    renderizado muestra los tres montos.
  - `src/lib/finanzas.ts` — `IngresoData` amplía tipos.
  - `src/lib/constants.ts` — `APORTACION_KALIAN_DEFAULT = 5` + enum
    `VariantePrecio`.
  - Nuevo `src/lib/recibiArtistaEventoPdf.ts`.
- **Riesgos**:
  - Cambio semántico de `monto`: docs escritos antes de este cambio
    no llevan `monto_bruto`, así que el fallback `monto_bruto = monto`
    los trata como "todo Kalian, 0 artista". Es la lectura correcta
    porque hasta ahora la casa se lo quedaba todo (no se descontaba
    caché). Queda escrito en `SPEC.md`.
  - Docs de evento con `precio_descuento` o `precioCupon` a 0 no deben
    validar `aportacion_kalian_X ≤ 0` como error: si la variante
    tiene precio 0 la aportación Kalian debe ser 0 también. La regla
    lo cubre.
  - Sincronía cliente/servidor de la variante: el cliente decide la
    variante al cobrar; si hay bug, se persiste mal y el PDF cuenta
    mal. Se compensa con tests unitarios + revisión del PDF al cierre.

## Impacto en docs

- **`SPEC.md`**:
  - §5 `eventos` — documentar los 3 campos nuevos y fallback default 5.
  - §5 `finanzas` — nuevos campos y **redefinición de `monto` como
    neto Kalian para `categoria == 'Evento'`**. Añadir nota
    prominente: docs previos al despliegue de este cambio se leen
    con `monto_bruto = monto`, `monto_artista = 0`.
  - §12 al mergear — anotar la superación de
    `add-reparto-taquilla-evento`.
- **`DOCUMENTATION.md`**:
  - §5 Manual Staff — Eventos: cómo configurar aportación Kalian por
    variante, cómo se ve en Contabilidad, cómo generar el Recibí.
  - Glosario: "Aportación Kalian", "Recibí del artista", "Variante
    de precio".
- **`SECURITY_SPEC.md`**: nuevos invariantes de `firestore.rules`
  para `eventos` (3 campos + cap) y `finanzas` (4 campos + coherencia
  `monto = monto_bruto − monto_artista`).
- **`README.md`**: no impacta.
