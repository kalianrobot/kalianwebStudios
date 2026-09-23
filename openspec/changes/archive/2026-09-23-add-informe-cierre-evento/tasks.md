# Tasks — add-informe-cierre-evento

## 1. Helper de datos

- [ ] Crear `src/lib/informeCierreEvento.ts` con
  `construirCierreEvento(eventoId: string): Promise<CierreEvento>`
  que devuelva:
  - `evento` (doc de `eventos`),
  - `entradasQR` (docs de `asistencia_eventos` con
    `tipo in ('reserva', 'reserva_socio', 'socio_carnet')`),
  - `entradasWalkIn` (docs con `tipo == 'walk-in'`),
  - `reservasNoShow` (slots de `reservas` con `ingresado != true`
    y estado no `cancelada`),
  - `ingresosFinanzas` (docs de `finanzas` con
    `categoria == 'Evento' && eventoId == <id>`),
  - `totales` (efectivo, tarjeta, transferencia, suma precios
    asistencia, descuadre).
- [ ] Test unitario del cálculo del descuadre con fixtures
  representativas (evento sin walk-in, evento con no-shows, precios
  faltantes).

## 2. Generador de PDF

- [ ] Crear `src/lib/informeCierreEventoPdf.ts` que reciba un
  `CierreEvento` y devuelva un `Blob` de PDF usando `jspdf` +
  `jspdf-autotable`.
- [ ] Secciones del PDF:
  1. Cabecera (título del evento, fecha, aforo máximo, aforo final).
  2. Tabla "Entradas por QR" — nombre/DNI, tipo (reserva /
     reserva-socio / socio-carnet), precio, hora de entrada.
  3. Tabla "Reservas no presentadas" — nombre/DNI, tipo, precio
     reservado, canal (invitado / socio / …).
  4. Tabla "Entradas puerta (walk-in)" — hora, precio, socio si
     aplica.
  5. Tabla "Caja del evento" — desglose por método de pago
     (`Efectivo`, `Tarjeta`, `Transferencia`).
  6. Reconciliación — total caja, suma precios asistencia, descuadre;
     descuadre ≠ 0 resaltado.
  7. Pie con timestamp de generación y usuario que lo generó.

## 3. UI en AdminEventos

- [ ] Añadir en `src/components/admin/AdminEventos.tsx` un botón
  "Descargar cierre" en cada fila de evento, visible solo cuando
  `evento.fecha < hoy` (o el evento tiene `estado == 'finalizado'`
  si el campo existe; verificar antes).
- [ ] `onClick` llama al helper, genera el PDF y hace `saveAs`.
- [ ] Feedback UI: spinner en el botón mientras se genera; toast de
  éxito/error.
- [ ] Nombre del fichero: `cierre-<slug-titulo>-<YYYYMMDD>.pdf`.

## 4. i18n

- [ ] Añadir claves en `src/i18n/es.ts` y `src/i18n/eu.ts`:
  - `admin.eventos.descargarCierre`
  - `admin.eventos.cierreGenerando`
  - `admin.eventos.cierreError`
  - Etiquetas de las columnas del PDF (aunque el contenido va en
    castellano; los headers de secciones pueden ir en `t()` para el
    tooltip del botón).

## 5. Reglas Firestore

- [ ] Verificar que `admin` puede hacer `list` de `asistencia_eventos`
  filtrado por `eventoId`. Ya lo permite (`isAdmin() || isPortero()
  || isTeacher()`); no se toca la regla.
- [ ] Confirmar que `finanzas` permite `list` con
  `where('eventoId', '==', X)` para admin. Si no, ampliar la regla
  y actualizar `SECURITY_SPEC.md` en el mismo PR (nueva propuesta si
  el cambio de regla es amplio).

## 6. Docs

- [ ] Actualizar `SPEC.md §5` con la nota "fuente autoritativa de la
  recaudación por evento".
- [ ] Actualizar `DOCUMENTATION.md §5` (Manual Staff — Eventos) con la
  operativa del cierre.
- [ ] Añadir "Informe de cierre" al glosario de `DOCUMENTATION.md`.
- [ ] Al mergear a `main`: mover
  `openspec/changes/add-informe-cierre-evento/` a
  `openspec/changes/archive/YYYY-MM-DD-add-informe-cierre-evento/`
  y consolidar el delta en `openspec/specs/eventos/spec.md`.

## 7. Validación manual

- [ ] Generar el cierre de un evento pasado real (con permiso del
  gerente) y verificar que:
  - los totales cuadran contra `AdminContabilidad`,
  - las no-show coinciden con lo que reportó el portero,
  - el descuadre reproduce (o no) el caso del 19-sep-2026.
