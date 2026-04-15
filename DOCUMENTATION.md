# KalianWeb: Documentación Técnica y de Usuario

## 1. Visión General del Proyecto

**KalianWeb** es una plataforma integral de gestión diseñada para la asociación cultural **Kalian HKG (Hiri Kultur Gunea)**. El sistema centraliza la administración de socios, la oferta académica (música, danza, etc.), la gestión de locales de ensayo, la organización de eventos y la contabilidad financiera.

### Tech Stack
- **Frontend**: Vite + React + TypeScript.
- **Styling**: Tailwind CSS + Motion (animaciones).
- **Backend/DB**: Firebase Firestore (NoSQL).
- **Autenticación**: Firebase Auth (Google Login para socios, Email/Password para Staff).
- **Hosting**: Cloud Run (Contenedores).
- **Servicios Externos**: Brevo (Email Marketing y Transaccional).

---

## 2. Arquitectura de Datos (Firestore)

El sistema utiliza una base de datos NoSQL estructurada en colecciones optimizadas para lecturas rápidas y consistencia de datos.

### Colecciones Principales

| Colección | Descripción | Relaciones Clave |
| :--- | :--- | :--- |
| `socios` | Datos de miembros, DNI, email y estado. | Vinculado a `cursos` y `locales`. |
| `cursos` | Oferta académica, horarios y precios. | Contiene lista de DNIs de `socios`. |
| `locales` | Estado de ocupación y pagos de salas. | Vinculado a `socios` (inquilinos). |
| `finanzas` | Registro de ingresos (ID determinista). | Referencia a `socio_id` o `local_id`. |
| `eventos` | Conciertos y actividades con control de aforo. | Registro de `asistencia_eventos`. |
| `profesores` | Perfiles de docentes con acceso al panel. | Vinculado a `cursos`. |
| `pagos_mensuales` | Estado de la cuota de 15€ (ID: `YYYY_MM_DNI`). | Control de acceso del socio. |

### Relaciones
- **Socio -> Curso**: Un socio tiene un array de IDs de cursos en su documento. El curso tiene un array de DNIs de alumnos.
- **Socio -> Local**: Un socio tiene un campo `localId`. El local tiene un array de `inquilinos`.
- **Socio -> Finanzas**: Los ingresos se registran con el DNI como `socio_id` para trazabilidad histórica.

---

## 3. Lógica de Negocio y Reglas Críticas

### Sistema de Cuota Única Mensual
Kalian opera bajo el modelo de **Aportación de Socio (15€/mes)**. Esta cuota es obligatoria para mantener la condición de socio activo y disfrutar de ventajas.
- **Jerarquía**: Si un socio pertenece a un local, el pago del local cubre la cuota de todos sus inquilinos.
- **Validación**: Los profesores validan este pago al pasar lista.

### Lógica de Socio Activo/Inactivo
Un socio se considera **ACTIVO** si cumple al menos una de estas condiciones:
1. Tiene una inscripción vigente en un curso (fecha fin >= hoy).
2. Pertenece a un local que ha pagado la aportación del mes actual.

**Consecuencias de Inactividad**:
- El estado cambia a `inactivo` en Firestore.
- Se limpian las categorías de membresía.
- **Bloqueo de Panel**: Si intenta acceder a `/home` o `/perfil`, el sistema lo redirige a la web pública con un aviso de suscripción inactiva.

### Sincronización de Finanzas
- **Marcado de Pago**: Al marcar un pago como realizado, se crea un documento en `finanzas` con ID determinista (`CUOTA_YYYY_MM_DNI`).
- **Reversión (Uncheck)**: Al desmarcar, el sistema busca ese ID específico y realiza un *soft delete* (`deletedAt`), actualizando los balances contables en tiempo real.

---

## 4. Manual de Usuario

### Guía para Staff (Administradores)
1. **Dashboard**: Resumen de ingresos mensuales y ocupación.
2. **Gestión de Socios**: Alta de nuevos miembros y edición de membresías manuales.
3. **Contabilidad**: Filtro por mes/año para ver el desglose de ingresos por categoría.
4. **Plan de Contingencia (Botón del Pánico)**: 
   - En el detalle de cada evento, existe un botón para **Descargar PDF de Emergencia**.
   - Genera un listado offline con DNIs y estados de pago para control manual en caso de caída de internet.

### Guía para Profesores
1. **Pasar Lista**: Acceso rápido a sus cursos asignados.
2. **Validación de Cuotas**: El panel muestra visualmente si el alumno ha pagado la cuota de socio del mes actual.
3. **Registro de Pagos**: Pueden marcar pagos de inscripciones o cuotas mensuales directamente desde el aula.

---

## 5. Guía de Desarrollo y Mantenimiento

### Estructura de Carpetas
```text
/src
  /components
    /admin      # Paneles de gestión Staff
    /teacher    # Panel de Profesores
    /socio      # Panel privado de socios
    /public     # Componentes web pública (Navbar, Footer)
  /context      # AuthContext y LanguageContext
  /lib          # Servicios (Firebase, Finanzas, SocioService)
  /pages        # Vistas principales (Landing, Logins)
  /hooks        # Hooks personalizados
```

### Despliegue y Mantenimiento
- **Despliegue**: Se realiza mediante CI/CD hacia Cloud Run.
- **Backups**: 
  - Firestore permite exportaciones programadas a Google Cloud Storage.
  - Se recomienda realizar un backup manual antes de operaciones de limpieza masiva de socios inactivos.
- **Persistencia Offline**: La app tiene habilitado `enableIndexedDbPersistence` para permitir el uso básico del Staff sin conexión a internet (los cambios se sincronizan al recuperar la red).

---
*Documentación generada por la Dirección Técnica de Kalian HKG - Abril 2026*
