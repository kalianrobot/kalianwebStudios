## ADDED Requirements

### Requirement: Cierre mensual de aportación de curso como control del admin

El admin DEBE poder cerrar la aportación mensual de cualquier curso activo
aunque el profesor no haya registrado pagos de alumnos ese mes.

Cada curso PUEDE tener `tipoAportacion` (`'fija' | 'variable'`, por defecto
`'variable'`) y `aportacionFijaMensual` (número ≥ 0).

Al iniciar el cierre, el sistema DEBE proponer un importe:

- `fija`: `aportacionFijaMensual`.
- `variable`: suma de `monto` de los `pagos_mensuales` del curso, mes y año
  con `pagado == true`; vacío si no hay ninguno.

El admin PUEDE modificar el importe propuesto. El sistema NO DEBE registrar
un cierre con importe ≤ 0.

Al confirmar, el sistema DEBE crear un movimiento `finanzas` con
`categoria: 'Cierre Aportación Curso'`, `cursoId`, `mes`, `anio`, `monto`
igual al importe confirmado y `origenImporte` ∈ `'fijo' | 'pagos_profesor' |
'manual'`; DEBE bloquear los `pagos_mensuales` pagados del curso en ese mes;
y DEBE marcar el curso como cerrado para ese mes.

#### Scenario: Curso fijo sin pagos registrados por el profesor
- **WHEN** el admin cierra noviembre de Big Band con `tipoAportacion: 'fija'`,
  `aportacionFijaMensual: 150` y ningún pago marcado por el profesor
- **THEN** la confirmación propone 150 €, y al aceptar se crea un movimiento
  de 150 € con `origenImporte: 'fijo'` y el curso queda cerrado para noviembre

#### Scenario: Curso variable con pagos del profesor
- **WHEN** el profesor ha marcado 4 pagos de 20 € y el admin cierra el mes
  sin tocar el importe
- **THEN** se crea un movimiento de 80 € con `origenImporte: 'pagos_profesor'`
  y los 4 pagos quedan bloqueados

#### Scenario: Curso variable sin pagos registrados
- **WHEN** el profesor no ha marcado ningún pago y el admin introduce 60 €
- **THEN** se crea un movimiento de 60 € con `origenImporte: 'manual'`

#### Scenario: Importe inválido
- **WHEN** el admin confirma con importe vacío, 0 o negativo
- **THEN** no se registra nada y se muestra un aviso

#### Scenario: Curso histórico sin tipo
- **WHEN** un curso no tiene `tipoAportacion`
- **THEN** se trata como `variable`
