# add-informe-cierre-evento

## ¿Por qué?

Al terminar un evento, quien liquida con los músicos no tiene un
documento que cuadre asistencia con caja. El PDF actual
(`descargarListadoEmergencia`, `ControlAcceso.tsx:719`) está pensado
para consultar reservas **durante** el evento si cae internet, no para
cerrar cuentas cuando termina.

Sin ese documento se produce lo del **evento de gospel del 19 de
septiembre de 2026**: un descuadre de 60 € que nadie sabe atribuir a
una entrada concreta, porque no hay una liquidación firmable en el
momento de pagar a los músicos.

El gerente pide un PDF de cierre que muestre, para un evento pasado:

- entradas efectivas registradas por QR,
- reservas confirmadas cuyo titular no vino,
- entradas pagadas en puerta sin reserva previa (walk-in).

## ¿Qué cambia?

- Nueva capability `informe-cierre-evento`: PDF post-evento que
  liquida asistencia y caja de un evento concreto.
- Nuevo botón en `AdminEventos` (fila del evento, disponible cuando la
  fecha del evento ya ha pasado): "Descargar cierre (PDF)".
- El PDF se genera **client-side** en el navegador del staff, sin
  Cloud Function nueva, leyendo `eventos`, `reservas`,
  `asistencia_eventos` y `finanzas` filtrados por `eventoId`.
- Totales autoritativos: la caja del evento se calcula sumando
  `finanzas` (con `categoria == 'Evento'` y `eventoId == <id>`), no
  `caja_eventos/<mesAnio>` (que agrega el mes entero, no un evento).
- Reconciliación explícita en el pie del PDF: `total caja` − `Σ
  precios asistencia` = descuadre. Si sale ≠ 0, aparece resaltado.

Fuera de alcance:

- No se resuelve el descuadre del 19-sep-2026: la spec solo instrumenta
  la detección para futuros eventos.
- No se cambia el modelo de datos de `asistencia_eventos`, `reservas`
  ni `caja_eventos`.
- No se manda el PDF por email; se descarga y punto.

## Impacto

- **Colecciones/reglas afectadas**: ninguna (solo lectura; `admin` ya
  puede leer `reservas`, `asistencia_eventos` y `finanzas`).
- **Cloud Functions afectadas**: ninguna.
- **UI afectada**: `src/components/admin/AdminEventos.tsx` (botón
  nuevo), un helper nuevo (p. ej. `src/lib/informeCierreEvento.ts`)
  que reutiliza `jspdf` y `jspdf-autotable` ya presentes en el bundle.
- **Riesgos**:
  - Reservas con `slots[]` cuya `precio` sea `undefined` en documentos
    antiguos: el sumatorio debe tratarlas como 0 y avisarlas, no
    petar.
  - Consulta `finanzas.where('eventoId', '==', X)` requiere que el
    índice compuesto exista si añadimos otros `where`; hoy solo
    filtramos por un campo, así que basta con el índice single-field
    automático.
  - PDF grande si el evento tiene cientos de asistentes: usar
    `jspdf-autotable` con paginación automática.

## Impacto en docs

- **`SPEC.md`**: actualizar §5 (`asistencia_eventos`, `caja_eventos`,
  `finanzas`) para dejar por escrito que **la fuente autoritativa de
  la recaudación de un evento concreto es `finanzas` filtrada por
  `eventoId`**, no `caja_eventos` (que sigue siendo agregado mensual
  para el dashboard rápido de puerta). Añadir la nueva capability al
  §12 "Hecho recientemente" al mergear.
- **`DOCUMENTATION.md`**: actualizar §5 Manual Staff — Eventos con la
  operativa del cierre: cuándo aparece el botón, cómo leer el PDF, qué
  hacer si el descuadre no es 0. Actualizar el glosario con "Informe
  de cierre".
- **`SECURITY_SPEC.md`**: no impacta. Solo lectura de colecciones a
  las que `admin` ya accede; no toca `firestore.rules` ni añade flujo
  sensible.
- **`README.md`**: no impacta (no cambian comandos ni el mapa de
  docs).
