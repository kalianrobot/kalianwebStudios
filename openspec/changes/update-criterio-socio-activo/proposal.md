## ¿Por qué?

Había dos criterios distintos de "socio activo". El bloqueo del panel del
socio usaba cursos vigentes y locales pagados (`syncSocioStatus`), pero las
pestañas Activos/Inactivos de `/staff/socios`, sus indicadores, el bloqueo de
4 meses y el botón Eliminar usaban las fechas de `membresias`. Un socio con una
membresía de fecha lejana (p. ej. `local: '2099-12-31'`) salía como activo para
siempre en el panel aunque no tuviera curso ni local, y nunca se podía limpiar.

## ¿Qué cambia?

- Un único criterio (`calcularEstadoSocio`) para todo: curso vigente no borrado
  o local pagado este mes o el anterior.
- El panel de Socios usa ese criterio en pestañas, indicadores, detección de
  duplicados, bloqueo de 4 meses y botón Eliminar.
- La antigüedad de la inactividad se mide desde la última actividad real
  (`ultimaFechaActividad`), no desde la membresía más lejana.
- Al abrir `/staff/socios`, el panel corrige en Firestore los `estado`
  desfasados, porque no hay tarea programada que los recalcule.
- Las membresías siguen mostrándose como vigencia del carnet, sin decidir el
  estado.

## Impacto

- **Colecciones/reglas afectadas**: `socios.estado` (escritura por admin, ya
  permitida). Sin cambios en `firestore.rules`.
- **Cloud Functions afectadas**: ninguna.
- **UI afectada**: `AdminSocios`.
- **Riesgos**: socios que antes salían como activos solo por su membresía pasan
  a Inactivos y, al abrir el panel, su `estado` se guarda como inactivo, lo que
  les bloquea `/home` y `/perfil` (ya les pasaba al iniciar sesión).

## Impacto en docs

- `SPEC.md`: no impacta.
- `DOCUMENTATION.md`: actualizar §2.2 (criterio único, recálculo, limpieza
  manual) y la tabla del manual de Staff.
- `SECURITY_SPEC.md`: no impacta.
- `README.md`: no impacta.
