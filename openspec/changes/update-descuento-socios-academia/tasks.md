## 1. Regla compartida
- [ ] Función pura `tieneDescuentoSocio(membresias, evento, hoy)` en `src/lib/descuentoSocio.ts`, con la equivalencia de eventos antiguos.
- [ ] Copia equivalente en `functions/src` (las Functions no importan de `src/`), con los mismos tests.

## 2. Cloud Functions
- [ ] `calcularPrecioInterno` usa la regla compartida.

## 3. UI
- [ ] `AdminEventos`: casillas de academias + "Local de ensayo"; precarga desde la equivalencia al editar eventos antiguos.
- [ ] `ReservaForm` y `AuthContext`: usar la regla compartida.
- [ ] `ControlAcceso`: carnet de socio, verificación de socio en reserva y entrada de socio sin reserva.

## 4. Reglas Firestore
- [ ] `isValidEvento`: `academias_descuento` opcional, lista de ≤ 20 textos.

## 5. Tests
- [ ] Unit: regla compartida (academia marcada, no marcada, caducada, local, claves antiguas, evento antiguo, mayúsculas/espacios).
- [ ] Reglas: `academias_descuento` válido e inválido.

## 6. Docs
- [ ] `SPEC.md`, `DOCUMENTATION.md`, `SECURITY_SPEC.md`.
