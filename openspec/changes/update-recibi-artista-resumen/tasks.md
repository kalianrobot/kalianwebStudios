## 1. Datos (`informeCierreEvento.ts`)
- [ ] Construir la lista de entradas del Recibí: movimientos `finanzas` de `Evento` más asistencias con `precio == 0` (variante `gratis`).
- [ ] Calcular el resumen por variante: número, precio unitario (o rango si hay varios), bruto, Kalian, artista.
- [ ] Leer los movimientos `Pago Artista` del evento y calcular total artista, pagado y pendiente.
- [ ] Calcular avisos: precio cobrado distinto del configurado para la variante; diferencia entre entradas de pago en asistencia y movimientos en finanzas.

## 2. PDF (`recibiArtistaEventoPdf.ts`)
- [ ] Tabla resumen por tipo de entrada con fila de totales.
- [ ] Sección "Liquidación" y frase de recibí con el pendiente rellenado.
- [ ] Bloque de avisos de control (solo si hay alguno).
- [ ] Anexo con el detalle entrada a entrada, incluidas las gratuitas.
- [ ] Mantener el aviso de datos históricos.

## 3. Tests
- [ ] Unit: resumen por variante (socio, cupón, gratis, histórico).
- [ ] Unit: liquidación con y sin pagos previos.
- [ ] Unit: avisos de precio distinto y de diferencia de entradas.
- [ ] Unit: el PDF no contiene nombres ni DNIs de asistentes.

## 4. Docs
- [ ] `SPEC.md` §5.
- [ ] `DOCUMENTATION.md` §3.1.
