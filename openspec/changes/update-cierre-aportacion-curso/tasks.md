## 1. Modelo de datos
- [ ] Campos opcionales `tipoAportacion` y `aportacionFijaMensual` en `cursos`.
- [ ] Campo `origenImporte` en el movimiento `Cierre Aportación Curso`.

## 2. Lógica
- [ ] `src/lib/cierreAportacionCurso.ts`: importe propuesto según tipo y pagos del profesor; validación del importe confirmado.

## 3. UI
- [ ] Formulario del curso: selector de tipo de aportación e importe fijo mensual.
- [ ] Botón de cierre siempre activo para admin; confirmación con importe editable.
- [ ] El bloque de cierre muestra el tipo (fija/variable) y el importe propuesto.

## 4. Reglas Firestore
- [ ] `isValidCurso` valida los campos nuevos cuando están presentes.

## 5. Tests
- [ ] Unit: curso fijo, curso variable con y sin pagos, importe manual, importe inválido.

## 6. Docs
- [ ] `SPEC.md` modelo de `cursos`.
- [ ] `DOCUMENTATION.md` manual de Staff.
- [ ] `SECURITY_SPEC.md` validación de `cursos`.
