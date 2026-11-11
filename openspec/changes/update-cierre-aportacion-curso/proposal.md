## ¿Por qué?

En Staff > Cursos, el botón "Cerrar Aportación Mes" aparece deshabilitado
siempre que el profesor no haya marcado pagos en su panel, así que para el
gerente "no funciona". Además el cálculo solo contempla cursos cuya
aportación depende del número de alumnos, pero hay dos cursos (Big Band y
Percusión Brasileña) que pagan una cantidad fija al mes a Kalian, sea cual
sea la asistencia. El gerente necesita un control global para confirmar que
el pago del mes de un curso se ha recibido, lo haya registrado el profesor o
no.

## ¿Qué cambia?

- Cada curso tiene un **tipo de aportación**: `variable` (por defecto, según
  alumnos que pagan) o `fija` (importe mensual fijo configurable en la ficha
  del curso). Big Band y Percusión Brasileña se configuran como fija, 150 €/mes.
  El importe es editable por el admin cuando cambie.
- El botón "Cerrar Aportación Mes" **siempre está activo** para el admin
  (salvo mientras procesa). Al pulsarlo se abre una confirmación con el
  importe propuesto:
  - Curso fijo: el importe fijo del curso.
  - Curso variable: la suma de lo que el profesor haya marcado como pagado;
    si no ha marcado nada, el importe sale vacío.
  - En ambos casos el admin **puede corregir el importe** antes de confirmar
    (macro control). No se admite 0 ni negativo.
- Al confirmar: se registra un ingreso en contabilidad (`Cierre Aportación
  Curso`) con el importe confirmado, se bloquean los pagos que el profesor
  hubiera marcado ese mes y el curso queda cerrado para el mes.
- El texto de la confirmación y del registro indica si el importe es fijo,
  calculado a partir de los pagos del profesor, o introducido a mano.
- El botón "revertir cierre" sigue funcionando como hasta ahora.

No cambia cómo el profesor marca los pagos de sus alumnos ni la cuota de
socio de 15 €.

## Impacto

- **Colecciones/reglas afectadas**: `cursos` gana dos campos opcionales
  `tipoAportacion` (`'fija' | 'variable'`) y `aportacionFijaMensual` (número
  ≥ 0). `isValidCurso` en `firestore.rules` los valida cuando están
  presentes. `finanzas` (categoría `Cierre Aportación Curso`) gana el campo
  informativo `origenImporte` (`'fijo' | 'pagos_profesor' | 'manual'`).
- **Cloud Functions afectadas**: ninguna.
- **UI afectada**: `src/components/admin/AdminCursos.tsx` (formulario del
  curso y bloque de cierre). Lógica de cálculo extraída a
  `src/lib/cierreAportacionCurso.ts` con unit tests.
- **Riesgos**:
  - Cursos existentes sin el campo se tratan como `variable` (comportamiento
    actual). Big Band y Percusión hay que marcarlos como fijos una vez
    desplegado (lo hace el admin desde la ficha del curso).
  - Si el admin confirma un importe a mano distinto de lo marcado por el
    profesor, contabilidad refleja el importe del admin; los pagos del
    profesor quedan solo como control.

## Impacto en docs

- `SPEC.md`: actualizar modelo de datos de `cursos` con los dos campos nuevos.
- `DOCUMENTATION.md`: actualizar el manual de Staff (cierre de aportación de
  curso) con el control global y los cursos de importe fijo.
- `SECURITY_SPEC.md`: actualizar la validación de `cursos` en reglas.
- `README.md`: no impacta.
