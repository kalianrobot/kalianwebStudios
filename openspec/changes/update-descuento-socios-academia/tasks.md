## 1. Regla compartida
- [x] Función pura `tieneDescuentoSocio(membresias, evento, hoy)` en `src/lib/descuentoSocio.ts`, con la equivalencia de eventos antiguos.
- [x] Copia equivalente en `functions/src` (las Functions no importan de `src/`), con los mismos tests.

## 2. Cloud Functions
- [x] `calcularPrecioInterno` usa la regla compartida.

## 3. UI
- [x] `AdminEventos`: casillas de academias + "Local de ensayo"; precarga desde la equivalencia al editar eventos antiguos.
- [x] `ReservaForm` y `AuthContext`: usar la regla compartida.
- [x] `ControlAcceso`: carnet de socio, verificación de socio en reserva y entrada de socio sin reserva.

## 4. Reglas Firestore
- [x] `isValidEvento`: `academias_descuento` opcional, lista de ≤ 20 textos.

## 5. Tests
- [x] Unit: regla compartida (academia marcada, no marcada, caducada, local, claves antiguas, evento antiguo, mayúsculas/espacios).
- [x] Reglas: `academias_descuento` válido e inválido.

## 6. Docs
- [x] `SPEC.md`, `DOCUMENTATION.md`, `SECURITY_SPEC.md`.
