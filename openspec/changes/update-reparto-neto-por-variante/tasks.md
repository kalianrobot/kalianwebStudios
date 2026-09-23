# Tasks — update-reparto-neto-por-variante

## 0. Dependencias

- [ ] Este cambio supersede `add-reparto-taquilla-evento` y extiende
  `add-informe-cierre-evento`. Los tres se archivan a la vez tras
  implementar. No mergear antes de que los otros dos hayan pasado por
  código.

## 1. Modelo (tipos y constantes)

- [ ] `src/lib/constants.ts`:
  - `APORTACION_KALIAN_DEFAULT = 5`
  - `type VariantePrecio = 'estandar' | 'descuento_socio' | 'cupon' |
    'walkin_estandar' | 'walkin_socio' | 'gratis'`
- [ ] `src/lib/finanzas.ts`:
  - Ampliar `IngresoData` con `monto_bruto?: number`,
    `monto_artista?: number`, `variante_precio?: VariantePrecio`.
  - `registrarIngreso` los persiste si vienen; si no, mantiene el
    doc como hoy (compatibilidad hacia atrás).

## 2. UI — AdminEventos

- [ ] Añadir en el formulario de crear/editar evento
  (`src/components/admin/AdminEventos.tsx`) 3 inputs:
  - "Aportación Kalian estándar (€)" — siempre visible.
  - "Aportación Kalian soci@ (€)" — visible si `tiene_descuento`.
  - "Aportación Kalian cupón (€)" — visible si `cupon` configurado.
- [ ] Precarga a `APORTACION_KALIAN_DEFAULT` al crear.
- [ ] Validación cliente: `0 ≤ x ≤ precio_X`. Si `x > precio_X`,
  aviso rojo bajo el input; no dejar guardar hasta que se corrija.

## 3. Cobro — ControlAcceso

- [ ] `src/components/admin/ControlAcceso.tsx`:
  - Función `resolverVariante(slot | walkin, evento, esSocio)` →
    `VariantePrecio`.
  - Al cobrar (~342 socio-carnet, ~498 slot reserva, ~610 walk-in):
    calcular `kalian = evento['aportacion_kalian_' + variante] ??
    APORTACION_KALIAN_DEFAULT`, cap `kalian = min(kalian, precio)`,
    `artista = precio - kalian`.
  - Pasar `monto: kalian`, `monto_bruto: precio`, `monto_artista:
    artista`, `variante_precio: variante` a `registrarIngreso`.

## 4. Cobro — AdminCheckIn

- [ ] `src/components/admin/AdminCheckIn.tsx` (~175-288): incluir la
  llamada a `registrarIngreso` con el nuevo modelo. Cierra el gap
  actual de que esa rama solo escribía en `caja_eventos`.

## 5. Contabilidad — desglose visible

- [ ] `src/components/admin/AdminContabilidad.tsx`:
  - `agruparMovimientos` (líneas 52-83): además del `total`, calcular
    `totalBruto = Σ (m.monto_bruto ?? m.monto)`, `totalArtista =
    Σ (m.monto_artista ?? 0)`.
  - Render fila padre del evento: `Bruto {totalBruto}€ · Kalian
    {total}€ · Artista {totalArtista}€`.
  - Render hijo: `Bruto {monto_bruto ?? monto}€ · Kalian {monto}€ ·
    Artista {monto_artista ?? 0}€`.
  - Tarjeta resumen `totalEventos` sigue siendo neto (`Σ monto`) —
    ya coincide con la nueva semántica.

## 6. PDF Recibí para el artista

- [ ] Nuevo `src/lib/recibiArtistaEventoPdf.ts` que reciba el mismo
  `CierreEvento` que el PDF de cierre y genere un PDF diferente:
  - Cabecera: título del evento, fecha, artista si existe (si no,
    espacio en blanco).
  - Tabla: fecha/hora, variante, bruto, Kalian, artista.
  - Totales: bruto, Kalian, artista.
  - Recibí firmable: "Recibí de Kalian HKG la cantidad de
    ______ € en concepto de caché del evento", línea para firma
    y DNI del artista.
- [ ] Botón "Recibí para el artista" en `AdminEventos.tsx`, junto al
  botón "Descargar cierre" del cambio previo. Mismo criterio de
  visibilidad (evento pasado).
- [ ] Nombre del fichero: `recibi-<slug-titulo>-<YYYYMMDD>.pdf`.

## 7. Reglas Firestore

- [ ] Localizar `isValidEvento` en `firestore.rules` (crear si no
  existe) y aceptar los 3 campos nuevos con `value is number && value
  >= 0`. Cap contra el precio de la misma variante cuando ese precio
  esté presente.
- [ ] Localizar el validator de `finanzas` para escritura por admin
  y portero, y aceptar `monto_bruto`, `monto_artista`, `variante_precio`
  como opcionales. Cuando los tres están presentes:
  `monto == monto_bruto - monto_artista` (dentro de tolerancia
  entera). `variante_precio` restringido al enum.
- [ ] Tests en `tests/rules/`:
  - Admin puede escribir `aportacion_kalian_X` válido / rechazado si
    negativo o mayor que su precio.
  - Portero puede escribir un doc de `finanzas` con los 3 campos
    nuevos si son coherentes; rechazado si `monto ≠ monto_bruto -
    monto_artista`.
  - Escritura sin los campos nuevos (path antiguo) sigue funcionando.

## 8. Tests unitarios

- [ ] `tests/lib/reparto.test.ts`:
  - Variante `estandar`: precio 16, kalian 5 → kalian 5, artista 11.
  - Variante `descuento_socio`: precio 12, kalian 5 → kalian 5,
    artista 7.
  - Variante `cupon`: precio 8, kalian 3 → kalian 3, artista 5.
  - Variante `gratis`: precio 0 → kalian 0, artista 0.
  - Cap: precio 4, kalian 5 configurada → kalian 4, artista 0.
  - Fallback: evento sin `aportacion_kalian_cupon` → aplica default 5
    (con cap si procede).

## 9. i18n

- [ ] `src/i18n/es.ts` y `src/i18n/eu.ts`:
  - `admin.eventos.aportacionKalianEstandar`
  - `admin.eventos.aportacionKalianDescuento`
  - `admin.eventos.aportacionKalianCupon`
  - `admin.eventos.aportacionKalianAviso`
  - `admin.eventos.recibiArtistaBoton`
  - `admin.contabilidad.brutoLabel`
  - `admin.contabilidad.kalianLabel`
  - `admin.contabilidad.artistaLabel`

## 10. Docs

- [ ] `SPEC.md §5 eventos` — nuevos campos + fallback.
- [ ] `SPEC.md §5 finanzas` — nuevos campos + **redefinición del
  significado de `monto` para `categoria == 'Evento'`** (neto Kalian).
- [ ] `DOCUMENTATION.md §5 Manual Staff — Eventos` — cómo se
  configura, cómo se lee en Contabilidad, cómo se genera el Recibí.
- [ ] `DOCUMENTATION.md` glosario — "Aportación Kalian", "Recibí del
  artista", "Variante de precio".
- [ ] `SECURITY_SPEC.md` — nuevos invariantes de `firestore.rules`.
- [ ] Al mergear: mover a `openspec/changes/archive/YYYY-MM-DD-*` los
  tres cambios (`add-informe-cierre-evento`,
  `add-reparto-taquilla-evento`, `update-reparto-neto-por-variante`)
  y consolidar los deltas en `openspec/specs/eventos/spec.md` y
  `openspec/specs/finanzas/spec.md`.

## 11. Validación manual

- [ ] Evento de prueba: `precio_estandar = 16`, `precio_descuento =
  12` con `tiene_descuento`, `cupon = "TEST"`, `precioCupon = 8`.
  Aportación Kalian por variante: 5 / 5 / 3.
- [ ] Registrar 3 entradas por QR (una de cada variante) y 1
  walk-in estándar.
- [ ] `AdminContabilidad`: fila padre debe mostrar `Bruto 44 €
  · Kalian 18 € · Artista 26 €`.
- [ ] Generar el "Recibí del artista": PDF con 4 filas, totales
  correctos, cabecera con nombre del artista si el evento lo tiene.
- [ ] Dry-run sobre el evento de gospel del 19-sep-2026 (histórico):
  el PDF y la Contabilidad aplican fallback (`monto_bruto = monto`,
  `monto_artista = 0`), NO alteran los docs existentes, y el
  descuadre de 60 € sigue detectándose por la sección
  "Reconciliación" del PDF de cierre.
