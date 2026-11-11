## 1. Modelo de datos
- [x] Campos opcionales `tipoAportacion` y `aportacionFijaMensual` en `cursos`.
- [x] Campo `origenImporte` en el movimiento `Cierre Aportación Curso`.

## 2. Lógica
- [x] `src/lib/cierreAportacionCurso.ts`: importe propuesto según tipo y pagos del profesor; validación del importe confirmado.

## 3. UI
- [x] Formulario del curso: selector de tipo de aportación e importe fijo mensual.
- [x] Botón de cierre siempre activo para admin; confirmación con importe editable.
- [x] El bloque de cierre muestra el tipo (fija/variable) y el importe propuesto.

## 4. Reglas Firestore
- [x] `isValidCurso` valida los campos nuevos cuando están presentes.

## 5. Tests
- [x] Unit: curso fijo, curso variable con y sin pagos, importe manual, importe inválido.

## 6. Docs
- [x] `SPEC.md` modelo de `cursos`.
- [x] `DOCUMENTATION.md` manual de Staff.
- [x] `SECURITY_SPEC.md` validación de `cursos`.
