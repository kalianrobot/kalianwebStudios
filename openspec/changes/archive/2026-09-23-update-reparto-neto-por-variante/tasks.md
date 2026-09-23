# Tasks — update-reparto-neto-por-variante

> Archivado el 2026-09-23. Estado verificado estáticamente contra el
> código en `main` (commits `a42cf4e`, `87d40ff`, PR #80) y contra el
> comportamiento observado en producción por el gerente (ver
> conversación de archivado, incluye captura de `AdminEventos` con
> los 3 inputs de aportación a 5 €). Lo marcado `[x]` se confirmó
> leyendo código/tests/docs; lo que sigue `[ ]` no se implementó tal
> cual se propuso (ver nota) o no es verificable de forma estática.

## 0. Dependencias

- [x] Este cambio supersede `add-reparto-taquilla-evento` y extiende
  `add-informe-cierre-evento`. Los tres se archivan a la vez tras
  implementar. No mergear antes de que los otros dos hayan pasado por
  código.

## 1. Modelo (tipos y constantes)

- [x] `src/lib/constants.ts`:
  - `APORTACION_KALIAN_DEFAULT = 5`
  - `type VariantePrecio = 'estandar' | 'descuento_socio' | 'cupon' |
    'walkin_estandar' | 'walkin_socio' | 'gratis'`
- [x] `src/lib/finanzas.ts`:
  - Ampliar `IngresoData` con `monto_bruto?: number`,
    `monto_artista?: number`, `variante_precio?: VariantePrecio`.
  - `registrarIngreso` los persiste si vienen; si no, mantiene el
    doc como hoy (compatibilidad hacia atrás).

## 2. UI — AdminEventos

- [x] Añadir en el formulario de crear/editar evento
  (`src/components/admin/AdminEventos.tsx`) 3 inputs:
  - "Aportación Kalian estándar (€)" — siempre visible.
  - "Aportación Kalian soci@ (€)" — visible si `tiene_descuento`.
  - "Aportación Kalian cupón (€)" — visible si `cupon` configurado.
- [x] Precarga a `APORTACION_KALIAN_DEFAULT` al crear.
- [x] Validación cliente: `0 ≤ x ≤ precio_X`. Si `x > precio_X`,
  aviso rojo bajo el input; no dejar guardar hasta que se corrija.

## 3. Cobro — ControlAcceso

- [x] `src/components/admin/ControlAcceso.tsx`:
  - Resuelve la variante con `resolverVariantePrecio` (en
    `src/lib/finanzas.ts`, compartida en vez de un método propio del
    componente) en los 3 puntos de cobro (socio-carnet, slot reserva,
    walk-in).
  - Al cobrar: calcula `kalian` con `resolverAportacionKalian` +
    `calcularReparto` (cap incluido, artista nunca negativo).
  - Pasa `monto: kalian`, `monto_bruto: precio`, `monto_artista:
    artista`, `variante_precio: variante` a `registrarIngreso`.

## 4. Cobro — AdminCheckIn

- [x] `src/components/admin/AdminCheckIn.tsx`: incluye la llamada a
  `registrarIngreso` con el nuevo modelo en los 3 puntos de cobro.
  Cierra el gap de que esa rama solo escribía en `caja_eventos`.

## 5. Contabilidad — desglose visible

- [x] `src/components/admin/AdminContabilidad.tsx`:
  - `agruparMovimientos` calcula `totalBruto = Σ (m.monto_bruto ??
    m.monto)`, `totalArtista = Σ (m.monto_artista ?? 0)`.
  - Render fila padre del evento: `Bruto {totalBruto}€ · Kalian
    {total}€ · Artista {totalArtista}€`.
  - Render hijo: `Bruto {monto_bruto ?? monto}€ · Kalian {monto}€ ·
    Artista {monto_artista ?? 0}€`.
  - El total mensual de la categoría "Evento" sigue siendo neto
    (`Σ monto`) — ya coincide con la nueva semántica.

## 6. PDF Recibí para el artista

- [x] Nuevo `src/lib/recibiArtistaEventoPdf.ts` que recibe el mismo
  `CierreEvento` que el PDF de cierre y genera un PDF diferente:
  cabecera con artista (o espacio en blanco), tabla fecha/hora +
  variante + bruto + Kalian + artista, totales, recibí firmable.
- [x] Botón "Recibí para el Artista" en `AdminEventos.tsx`, junto al
  botón "Descargar Cierre". Mismo criterio de visibilidad (evento
  pasado, sección de histórico).
- [x] Nombre del fichero: `recibi-<slug-titulo>-<YYYYMMDD>.pdf`.

## 7. Reglas Firestore

- [x] `isValidEvento` en `firestore.rules` (vía helper
  `isValidAportacionKalian`) acepta los 3 campos nuevos con
  `value is number && value >= 0`, con cap contra el precio de la
  misma variante cuando esté presente.
- [x] El validator de `finanzas` (`isValidFinanza`) acepta
  `monto_bruto`, `monto_artista`, `variante_precio` como opcionales,
  y cuando los tres están presentes verifica `monto == monto_bruto -
  monto_artista` y el enum de `variante_precio`. Aplica a admin y
  portero (mismo validator en `create`).
- [x] Tests en `tests/firestore.rules.test.ts`:
  - Admin no puede crear evento con `aportacion_kalian_cupon` no
    numérica ni con valor > `precioCupon`.
  - Admin y portero pueden escribir un doc de `finanzas` con los 4
    campos si son coherentes; rechazado si `monto ≠ monto_bruto -
    monto_artista`, si `variante_precio` no está en el enum, o si
    `monto_bruto` es negativo.
  - Escritura sin los campos nuevos (path antiguo) sigue siendo
    válida.

## 8. Tests unitarios

- [x] `tests/unit/reparto.test.ts` (ruta real, no `tests/lib/`):
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
  - **No implementado**: la UI final usa literales en castellano
    ("Aportación Kalian Estándar (€)", "Descargar Cierre", "Bruto
    ... · Kalian ... · Artista ...") en vez de `t()`. Contradice
    `CLAUDE.md §5`. Queda como deuda técnica; no se resuelve en este
    archivado.

## 10. Docs

- [x] `SPEC.md §5 eventos` — nuevos campos + fallback.
- [x] `SPEC.md §5 finanzas` — nuevos campos + **redefinición del
  significado de `monto` para `categoria == 'Evento'`** (neto Kalian).
- [x] `DOCUMENTATION.md §5 Manual Staff — Eventos` — cómo se
  configura, cómo se lee en Contabilidad, cómo se genera el Recibí.
- [x] `DOCUMENTATION.md` glosario — "Aportación Kalian", "Recibí del
  artista", "Variante de precio".
- [x] `SECURITY_SPEC.md` — nuevos invariantes de `firestore.rules`
  (`isValidAportacionKalian`, `isValidFinanza`).
- [x] Al mergear: mover a `openspec/changes/archive/YYYY-MM-DD-*` los
  tres cambios (`add-informe-cierre-evento`,
  `add-reparto-taquilla-evento`, `update-reparto-neto-por-variante`)
  y consolidar los deltas en `openspec/specs/eventos/spec.md` y
  `openspec/specs/finanzas/spec.md`. Hecho en este archivado.

## 11. Validación manual

- [x] Confirmado en producción por el gerente: al configurar un
  cupón de venta anticipada en `AdminEventos`, aparece el tercer
  input "Aportación Kalian Cupón (€)" junto a estándar y soci@, los
  tres precargados a 5 €.
- [ ] Evento de prueba con las 3 variantes + walk-in, verificación de
  `AdminContabilidad` (`Bruto 44 € · Kalian 18 € · Artista 26 €`),
  generación del "Recibí del artista" con 4 filas y dry-run sobre el
  evento de gospel del 19-sep-2026 histórico: no verificado de forma
  estática en este archivado.
