## ¿Por qué?

Kalian ya cobra entradas de verdad y tiene que liquidar con cada artista o grupo con un documento fiable. El "Recibí del artista" actual es una lista de cobros sin resumen por tipo de entrada. No incluye las entradas gratuitas, no tiene en cuenta lo que ya se le ha pagado al artista y deja en blanco el importe a firmar. El gerente pide un PDF que refleje todo el dinero del artista teniendo en cuenta los descuentos de socio y de cupón.

## ¿Qué cambia?

- El Recibí empieza con una **tabla resumen por tipo de entrada** (estándar, soci@, cupón, puerta, puerta soci@, gratis): número de entradas, precio unitario, bruto, parte Kalian y parte artista, con fila de totales.
- Las **entradas gratuitas e invitaciones** se cuentan (salen del registro de asistencia, porque no generan movimiento en contabilidad).
- Nueva sección **"Liquidación"**: total que corresponde al artista, pagos ya registrados ("Pago Artista") y pendiente. La frase de recibí se rellena con el pendiente en vez de dejarlo en blanco.
- **Avisos de control** sin datos personales: entradas cobradas a un precio distinto del configurado en la ficha del evento para su tipo, y diferencia entre entradas registradas en puerta y cobros en contabilidad.
- El **detalle entrada a entrada** se mantiene como anexo (fecha/hora, tipo, bruto, Kalian, artista) e incluye también las gratuitas.

No cambia cómo se cobra en puerta ni cómo se calcula el reparto por entrada. El PDF de cierre interno no se toca.

## Impacto

- **Colecciones/reglas afectadas**: ninguna escritura nueva. Se leen `eventos`, `asistencia_eventos` y `finanzas` (categorías `Evento` y `Pago Artista`), que el admin ya puede leer. Sin cambios en `firestore.rules`.
- **Cloud Functions afectadas**: ninguna.
- **UI afectada**: `src/lib/informeCierreEvento.ts` (datos), `src/lib/recibiArtistaEventoPdf.ts` (PDF). El botón de `AdminEventos` no cambia.
- **Riesgos**:
  - Asociar entradas gratuitas sin cobro: se cuentan desde `asistencia_eventos` con `precio == 0`. Si el portero registró una entrada pagada con precio 0 por error, aparecerá como gratuita (y el aviso de control lo hace visible).
  - Eventos con cupón cobrados antes del arreglo del PR #117 tienen entradas "Cupón" a precio estándar: el aviso de precio distinto las señalará, pero no las corrige.
  - El pendiente depende de que los pagos al artista se registren con el botón "+ Pago artista" de Contabilidad.

## Impacto en docs

- `SPEC.md`: actualizar §5 (PDFs de evento): contenido del Recibí, liquidación y fuente de las entradas gratuitas.
- `DOCUMENTATION.md`: actualizar §3.1 (manual de staff, cierre de un evento) con el nuevo contenido del Recibí y cómo leer los avisos.
- `SECURITY_SPEC.md`: no impacta (sin cambios de reglas; el Recibí sigue sin datos personales de asistentes).
- `README.md`: no impacta.
