# Tasks — add-reparto-taquilla-evento

## 1. Modelo de datos

- [ ] Añadir `comision_kalian_por_entrada?: number` al tipo de
  `evento` en `src/lib/finanzas.ts` (o el fichero donde vivan los
  tipos de eventos).
- [ ] Constante `COMISION_KALIAN_DEFAULT = 5` en
  `src/lib/constants.ts`. El PDF y la UI la usan como fallback.

## 2. Reglas Firestore

- [ ] Localizar el validator de `eventos` en `firestore.rules` (o
  crearlo si no existe todavía) y aceptar
  `comision_kalian_por_entrada` como `number` con
  `value >= 0 && value <= 100`. Rechazar cadenas y negativos.
- [ ] Añadir un test de reglas en `tests/rules/` que cubra:
  - Admin puede escribir el campo con valor válido.
  - Admin no puede escribir con valor negativo o no numérico.
  - Portero no puede modificar el campo (solo `aforo_actual` /
    `aforo_reservado`).

## 3. UI — AdminEventos

- [ ] Añadir campo "Comisión Kalian por entrada (€)" en el
  formulario de crear/editar evento
  (`src/components/admin/AdminEventos.tsx`). Default a
  `COMISION_KALIAN_DEFAULT` al crear.
- [ ] Validación cliente: número, >= 0, mostrar aviso si es > al
  `precio_estandar` (edge case: la comisión se capa al precio, pero
  configurarlo así es probable error de dedo).

## 4. Helper de cálculo

- [ ] Extender `construirCierreEvento` (introducido en
  `add-informe-cierre-evento`) con un bloque `reparto`:
  - `comisionKalianPorEntrada` (con fallback a
    `COMISION_KALIAN_DEFAULT` si el campo no está en el doc).
  - `totalComisionKalian` = `Σ min(comision, precio)` sobre cada
    entrada con `precio > 0` (asistencia efectiva; los no-shows no
    entran).
  - `totalAPagarArtista` = `Σ (precio - min(comision, precio))`.
  - `entradasIncluidas` (contador informativo).
- [ ] Test unitario del cálculo con:
  - Precio 10 €, comisión 5 → Kalian 5, artista 5.
  - Precio 3 €, comisión 5 → Kalian 3, artista 0.
  - Precio 0 → Kalian 0, artista 0.
  - Evento sin campo → aplica default 5.

## 5. PDF — sección "Reparto"

- [ ] Extender `src/lib/informeCierreEventoPdf.ts` con la nueva
  sección al final del documento, antes del pie:
  - Título "Reparto".
  - Línea "Artista: <nombre>" (o campo vacío si `evento.artista`
    falta).
  - Tabla: total ingresos con precio > 0, comisión Kalian, a pagar
    artista, desglose por método de pago del total ingresos.
  - Firma en blanco: "Recibí de Kalian HKG la cantidad de _______ €
    en concepto de caché del evento" con línea para firma y DNI.

## 6. i18n

- [ ] Añadir claves en `src/i18n/es.ts` y `src/i18n/eu.ts`:
  - `admin.eventos.comisionKalianLabel`
  - `admin.eventos.comisionKalianHelp`
  - `admin.eventos.comisionKalianAvisoAlta`

## 7. Docs

- [ ] `SPEC.md §5` — documentar `comision_kalian_por_entrada` y
  fallback.
- [ ] `DOCUMENTATION.md §5` — operativa del reparto y de la
  liquidación manual del artista.
- [ ] `SECURITY_SPEC.md` — invariante del validator de eventos.
- [ ] Glosario en `DOCUMENTATION.md`: "Comisión de sala", "A pagar
  al artista".
- [ ] Al mergear: archivar bajo
  `openspec/changes/archive/YYYY-MM-DD-add-reparto-taquilla-evento/`
  y consolidar el delta en `openspec/specs/eventos/spec.md`.

## 8. Validación manual

- [ ] Con el evento del 19-sep-2026 (gospel), verificar que:
  - El PDF muestra `comisión_kalian = 5 * entradas_con_precio`.
  - El `a_pagar_artista` cuadra con lo que el gerente recuerda haber
    entregado ese día — y si no cuadra, ahí sale el descuadre real.

## 9. Dependencias

- [ ] Este cambio depende de `add-informe-cierre-evento`. No
  mergear antes.
