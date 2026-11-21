## ADDED Requirements

### Requirement: Criterio único de socio activo
El sistema DEBE considerar activo a un socio si y solo si tiene un curso inscrito con fecha de fin igual o posterior a hoy y no borrado, o pertenece a un local cuyo último pago es del mes actual o del anterior. Las fechas de membresía NO DEBEN influir en el estado. El bloqueo del panel del socio y el panel de Socios del staff DEBEN usar este mismo criterio.

#### Scenario: Membresía lejana sin actividad
- **WHEN** un socio tiene una membresía con fecha 2099-12-31 pero ningún curso vigente ni local pagado
- **THEN** aparece en la pestaña Inactivos del panel de Socios y no puede entrar a su panel privado

#### Scenario: Curso vigente
- **WHEN** un socio está inscrito en un curso cuya fecha de fin es posterior a hoy
- **THEN** aparece en la pestaña Activos

### Requirement: Recalculo del estado al abrir el panel de Socios
El sistema DEBE guardar el estado recalculado de cada socio no bloqueado cuyo estado guardado no coincida con el criterio único cuando un admin abre el panel de Socios.

#### Scenario: Curso que terminó
- **WHEN** el curso de un socio terminó ayer y su estado guardado sigue siendo activo
- **THEN** al abrir el panel de Socios su estado guardado pasa a inactivo

### Requirement: Limpieza de inactivos por última actividad
El sistema DEBE medir la antigüedad de la inactividad desde la última actividad: la fecha de fin más tardía de sus cursos no borrados o el último día del mes de gracia de su local, o la fecha de alta si nunca tuvo. El bloqueo de 4 meses y el botón Eliminar solo DEBEN actuar sobre socios inactivos según el criterio único.

#### Scenario: Eliminar a los 120 días
- **WHEN** un socio inactivo tuvo su último curso terminado hace más de 120 días
- **THEN** el botón Eliminar de su ficha está habilitado

#### Scenario: Socio activo no eliminable
- **WHEN** un socio está activo
- **THEN** el botón Eliminar está deshabilitado y el bloqueo de 4 meses no lo toca
