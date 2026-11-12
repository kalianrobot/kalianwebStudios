## 1. Datos (`informeCierreEvento.ts`)
- [x] Construir la lista de entradas del Recibí: movimientos `finanzas` de `Evento` más asistencias con `precio == 0` (variante `gratis`).
- [x] Calcular el resumen por variante: número, precio unitario (o rango si hay varios), bruto, Kalian, artista.
- [x] Leer los movimientos `Pago Artista` del evento y calcular total artista, pagado y pendiente.
- [x] Calcular avisos: precio cobrado distinto del configurado para la variante; diferencia entre entradas de pago en asistencia y movimientos en finanzas.

## 2. PDF (`recibiArtistaEventoPdf.ts`)
- [x] Tabla resumen por tipo de entrada con fila de totales.
- [x] Sección "Liquidación" y frase de recibí con el pendiente rellenado.
- [x] Bloque de avisos de control (solo si hay alguno).
- [x] Anexo con el detalle entrada a entrada, incluidas las gratuitas.
- [x] Mantener el aviso de datos históricos.

## 3. Tests
- [x] Unit: resumen por variante (socio, cupón, gratis, histórico).
- [x] Unit: liquidación con y sin pagos previos.
- [x] Unit: avisos de precio distinto y de diferencia de entradas.
- [x] Unit: el PDF no contiene nombres ni DNIs de asistentes.

## 4. Docs
- [x] `SPEC.md` §5.
- [x] `DOCUMENTATION.md` §3.1.
