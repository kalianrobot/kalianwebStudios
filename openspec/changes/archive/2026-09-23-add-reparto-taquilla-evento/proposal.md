# add-reparto-taquilla-evento

## ¿Por qué?

Kalian no se queda toda la taquilla de un evento: de cada entrada
pagada retiene una **comisión fija (5 € por defecto)** para cubrir
sala/servicios y el resto es del artista.

Hoy esa regla vive en la cabeza del gerente. Consecuencias:

- El PDF de cierre (`add-informe-cierre-evento`) mostraría el total de
  caja pero no lo que hay que dar al artista, así que la liquidación
  sigue haciéndose a mano en el momento de pagar.
- La contabilidad (`AdminContabilidad`) trata cada entrada como
  ingreso íntegro de Kalian, cuando en realidad ~80% es un pasivo
  hacia el artista hasta que se liquida.
- El descuadre del 19-sep-2026 pudo pasar precisamente porque no hay
  una línea "a pagar al artista" que obligue a cuadrar en el acto.

## ¿Qué cambia?

- Nueva regla de reparto por evento:
  - Kalian retiene `evento.comision_kalian_por_entrada` (€) de cada
    entrada con `precio > 0`, tope máximo el propio precio (no
    tomamos más de lo que se cobró).
  - Entradas con `precio == 0` no generan ni comisión ni pago a
    artista.
  - El resto (`precio - comision_efectiva`) es "a pagar al artista".
- Nuevo campo en `eventos`:
  - `comision_kalian_por_entrada: number` (€, no negativo). Default
    server-side `5`. Editable por admin en `AdminEventos` al crear o
    editar un evento.
- El PDF de cierre añade una sección "Reparto":
  - `Σ comisión_kalian` — lo que se queda la casa.
  - `Σ a_pagar_artista` — lo que hay que entregar.
  - Desglose por método de pago si aplica (para saber si se paga en
    efectivo del sobre o queda pendiente por transferencia).
  - Nombre del artista (si `evento.artista` está poblado; si no,
    espacio en blanco para escribirlo a mano).
- Fuera de alcance:
  - No se automatiza el pago al artista: no se crea automáticamente un
    movimiento de egreso en `finanzas`. Se hará manual desde
    `AdminContabilidad` referenciando el `eventoId` (mismo criterio
    que el resto de egresos).
  - No se retroaplica la comisión a eventos anteriores. Los eventos
    sin `comision_kalian_por_entrada` en el doc asumen `5` en el PDF
    de cierre.

## Impacto

- **Colecciones/reglas afectadas**:
  - `eventos`: nuevo campo `comision_kalian_por_entrada`. Actualizar
    `firestore.rules → isValidEvento` (o el validator equivalente) si
    existe, para aceptar el campo y validar que sea `number >= 0`.
- **Cloud Functions afectadas**: ninguna directamente. Si en el futuro
  se automatiza el egreso al artista, ya iría en Function.
- **UI afectada**:
  - `src/components/admin/AdminEventos.tsx` — nuevo input "Comisión
    Kalian por entrada (€)" en el formulario de crear/editar.
  - `src/lib/informeCierreEvento.ts` (definido en
    `add-informe-cierre-evento`) — extender el `CierreEvento` con
    `reparto: { comisionKalian, aPagarArtista, ... }`.
  - `src/lib/informeCierreEventoPdf.ts` — nueva sección "Reparto".
- **Riesgos**:
  - Eventos históricos sin el campo: hay que decidir un fallback.
    Solución: si el campo falta, asumir `5` (regla actual escrita).
    Esto DEBE quedar en `SPEC.md`.
  - Cambiar la comisión **después** de que el evento haya empezado a
    vender genera confusión. Solución: permitir edición pero
    documentar que el cálculo del cierre usa el valor al momento del
    cierre (no snapshot histórico). Si en algún momento hace falta
    inmutabilidad, se congelará al marcar el evento como
    "finalizado".

## Impacto en docs

- **`SPEC.md`**: actualizar §5 (colección `eventos`) documentando el
  nuevo campo `comision_kalian_por_entrada` y el fallback a `5` para
  eventos que no lo tengan. Añadir mención breve en §12 al mergear.
- **`DOCUMENTATION.md`**: actualizar §5 Manual Staff — Eventos con la
  operativa: cómo se fija la comisión, qué muestra el PDF, cómo se
  liquida al artista (registro manual en Contabilidad). Añadir
  "Comisión de sala" y "A pagar al artista" al glosario.
- **`SECURITY_SPEC.md`**: actualizar invariante de validación de
  `eventos` en `firestore.rules` si existe (aceptar el nuevo campo y
  validar rango `>= 0`). Añadir el requisito al listado de
  invariantes de la colección.
- **`README.md`**: no impacta.
