# Documentación funcional — Kalian HKG

> **Documentos relacionados**
> - [README.md](README.md) — Entry point + cómo arrancar
> - [SPEC.md](SPEC.md) — Cómo está construido (técnica)
> - DOCUMENTATION.md — Qué hace + manual *(este documento)*
> - [SECURITY_SPEC.md](SECURITY_SPEC.md) — Invariantes de seguridad

Este documento describe **qué hace** el sistema desde el punto de vista de negocio y de cada perfil de usuario. Para detalles técnicos (colecciones, funciones, convenciones de código) ver `SPEC.md`.

---

## 1. Visión

Kalian HKG es una asociación cultural sin ánimo de lucro. Esta plataforma centraliza la gestión de socios, oferta académica (música, danza), locales de ensayo, eventos, contabilidad, control de aforo en puerta y comunicación por newsletter.

Una sola web sirve **cinco interfaces** según el rol del usuario autenticado: pública, socio, profesor, staff/admin y portero. Para la matriz de roles ver [SPEC.md §6](SPEC.md).

---

## 2. Reglas de negocio

### 2.1 Cuota Única Mensual (15 €)

- Todo socio activo aporta **15 €/mes** para el sostenimiento de la asociación.
- **Jerarquía de cobro**: si un socio pertenece a un local, el pago mensual del local cubre la cuota de todos sus inquilinos. Si un inquilino ya pagó su cuota individual ese mes (`CUOTA_*` viva en `finanzas`), el pago bulk del local **lo excluye** del importe para no contabilizar dos veces; la reversión del bulk solo revierte a los socios que fueron marcados por ese bulk (`pagos_mensuales.localId`).
- El profesor valida la cuota al pasar lista (panel teacher).
- **Registro de pago**: `src/lib/finanzas.ts → registrarIngreso()`. Para cuotas usa un ID determinista `CUOTA_{anio}_{mes}_{socio_id}` en la colección `finanzas`, lo que evita duplicados aunque se marque varias veces el mismo mes.
- **Reversión (soft-delete)**: desmarcar un pago no borra el documento; pone `deletedAt`. Los balances contables filtran por `deletedAt == null`.

### 2.2 Socio Activo vs Inactivo

Implementado en `src/lib/socioService.ts → syncSocioStatus()`. Un socio es **activo** si cumple al menos una de estas condiciones:

1. Tiene un curso inscrito con `fechaFin >= hoy` y sin `deletedAt`.
2. Pertenece a un local cuyo `ultimoPagoMesAnio` es el mes actual **o el anterior** (1 mes de gracia).

Si no cumple ninguna, su `estado` pasa a `'inactivo'`. **No se borran las membresías** (`membresias.local = '2099-12-31'` o similares siguen vivas) porque la vigencia firmada no debe limpiarse por un mes sin pago — eso lo lleva `pagos_mensuales` por separado.

**Consecuencias de la inactividad**:
- Si un socio inactivo intenta entrar a `/home` o `/perfil`, el guard en `src/App.tsx` redirige a `/` con un mensaje. Implementado para roles `socio` e `invitado_registrado` (no se aplica al master).
- El badge visual en `AdminSocios` lo distingue.

### 2.3 Categorías de ingresos

En `finanzas` cada documento tiene `categoria` ∈ `'Socio' | 'Curso' | 'Evento' | 'Aportación Socio Local' | 'Cierre Aportación Curso'`. El panel de Contabilidad filtra por categoría y mes/año.

### 2.4 Aforo de eventos

- Reservas (incluso de invitado) incrementan `eventos.{id}.aforo_reservado` de forma atómica.
- Las reglas de Firestore solo permiten incrementos acotados (`+20` máximo por update, nunca superando `aforo_maximo`) → ver `firestore.rules → isSafeAforoUpdate()`.
- El portero (rol `portero`) puede actualizar `aforo_actual` y `aforo_reservado` desde la tablet de puerta.

### 2.4bis Reserva pública (invitado, sin cuenta)

- En un **evento**, el DNI es **opcional**: solo sirve para comprobar si quien reserva es socio y aplicarle el descuento/apertura anticipada correspondiente. Sin DNI, la reserva se completa igual como invitado sin descuento.
- En un **curso**, el DNI (junto con nombre y email) es obligatorio — el alta al curso implica alta de socio.
- Si se introduce, el DNI debe tener ≥7 caracteres (lo exige `firestore.rules`); por debajo de eso se avisa en el propio formulario antes de enviar, sin llegar a tocar el servidor.
- Un invitado anónimo no puede leer la colección `reservas` (solo admin/portero/el propio titular logueado, ver SECURITY_SPEC.md invariante #6), así que la comprobación de "¿ya tengo una reserva para este evento?" y el cálculo del precio con descuento de socio se resuelven mediante Cloud Functions (`comprobarReservaDuplicada`, `calcularPrecioReserva`), no consultando Firestore directamente desde el navegador.

### 2.5 Newsletter y doble opt-in

- Alta pública con estado intermedio `'pendiente_confirmacion'`. El **doc ID es el email** (deterministic): una segunda alta del mismo email actúa como upsert, no crea duplicado.
- **Re-alta tras baja**: si el doc estaba en estado `'baja'`, el alta lo reescribe a `'pendiente_confirmacion'`. La reconciliación semanal reactiva el estado a `'activo'` si Brevo confirma y la `fecha` de re-alta es posterior a `fecha_baja` (evita revivir bajas permanentes sin nueva confirmación).
- El email de confirmación DOI lo dispara `subscribeNewsletter` vía `POST /contacts/doubleOptinConfirmation` de Brevo (plantilla transaccional `BREVO_NEWSLETTER_DOI_TEMPLATE_ID`), no un toggle nativo de la lista — el formulario vive fuera de Brevo, así que ese toggle no aplica. El contacto solo entra en la lista de Brevo al confirmar. Tras la confirmación, la reconciliación semanal (`reconciliarNewsletterBrevo` los lunes 04:00 UTC) promueve el estado a `'activo'`.
- Pendientes que no confirman en 14 días pasan a `'baja'` con `motivo: 'no_confirmado'`.

**Migración MailPoet → Brevo y consentimiento**

La lista de Brevo se creó importando la que había en MailPoet, y en esa importación no se conservó el registro de consentimiento de cada contacto. Para regularizarlo se trabaja con **dos listas**:

| Lista | Contenido | Quién la usa |
|---|---|---|
| **A — heredada** | Los contactos importados de MailPoet, sin prueba de consentimiento. | Nadie en código. Solo es el origen de la campaña de reconfirmación; se borra al cerrarla. |
| **B — con consentimiento** | Solo quien completa el doble opt-in del formulario público. | Es la lista a la que apunta `BREVO_NEWSLETTER_LIST_ID`: altas, reconciliación y envíos reales. |

No vale una sola lista: si el contacto ya pertenece a la lista destino, Brevo rechaza el doble opt-in por duplicado y el reconfirmante ve el mensaje de éxito **sin recibir el email**. Es decir, la campaña fallaría en silencio precisamente con las personas a las que va dirigida.

La señal de "hubo consentimiento" es el campo `fecha_confirmacion`: solo lo escriben la promoción DOI y el panel admin. Por eso, cuando la reconciliación semanal da de baja a un suscriptor ausente de la lista, distingue el motivo:

- `'reconciliacion'` — tenía `fecha_confirmacion`, así que confirmó en su día y luego desapareció de Brevo (baja ordinaria).
- `'migracion_sin_consentimiento'` — nunca confirmó: es un heredado de MailPoet. Al apuntar el secreto a la lista B, todos estos pasan a `'baja'` en bloque en la primera reconciliación, y vuelven a `'activo'` a medida que reconfirman.

El badge de `/staff/newsletter` muestra el motivo en texto legible ("sin consentimiento", "ausente en Brevo", …); el valor crudo sigue disponible en el tooltip.

El procedimiento operativo paso a paso (crear la lista, cambiar el secreto, enviar la campaña, borrar la lista A) está en [SPEC.md §12](SPEC.md).

**Durante la campaña, no borres suscriptores desde el panel**: el borrado dispara `onNewsletterSubscriberDeleted`, que elimina el contacto de **toda** la cuenta de Brevo, incluida la lista B. Si esa persona ya había reconfirmado, se pierde su consentimiento recién obtenido.

Para el detalle del flujo y estados ver [SPEC.md §5](SPEC.md) (esquema `newsletter_subscribers`).

---

## 3. Manual de Staff (admin)

Acceso vía `/staff/login` con email/contraseña. Solo `role == 'admin'` o master email (`kalianrobot@gmail.com`).

| Panel | Ruta | Qué se hace |
|---|---|---|
| Dashboard | `/staff` | Resumen rápido de ingresos del mes y ocupación. |
| Eventos | `/staff/eventos` | Crear/editar eventos. Definir aforo y reglas. |
| Cursos | `/staff/cursos` | Catálogo académico, profesor asignado, horarios. |
| Socios | `/staff/socios` | Alta, edición, gestión de membresías. Pestañas activos/inactivos. |
| Locales | `/staff/locales` | Salas de ensayo. Inquilinos, pagos del local. |
| Profesores | `/staff/profesores` | Alta de profesores y asignación. |
| Academias | `/staff/academias` | Catálogo de academias externas asociadas. |
| Staff | `/staff/staff` | Gestión de cuentas con rol `admin`/`teacher`. |
| Newsletter | `/staff/newsletter` | Lista de suscriptores. Badge "PENDIENTE" para no confirmados. Export CSV de activos. |
| Solicitudes | `/staff/solicitudes` | Bandeja de solicitudes de inscripción pública. |
| Contabilidad | `/staff/contabilidad` | Filtros por mes/año, drilldown por socio, purga de residuos. |
| Reservas | `/staff/reservas` | Vista de reservas (socios + invitados). |
| Galería | `/staff/galeria` | Gestión de exposiciones. |
| Config | `/staff/config` | Identidad, donaciones, configuración pública. |
| Traducir EU | `/staff/traducir-eu` | Asistente para rellenar campos `*_eu`. |

---

## 4. Manual de Profesor (teacher)

Acceso vía `/profesor/login`.

- **Pasar lista**: ve únicamente los cursos que tiene asignados.
- **Validación de cuota de socio**: la fila del alumno muestra visualmente si la cuota del mes actual está pagada.
- **Registro de pagos**: puede marcar pagos de inscripción y de cuota mensual desde el aula. Hay una **confirmación modal** antes de desmarcar un pago mensual (evita reversiones accidentales).
- **Aporta al cierre**: la aportación mensual del alumno se difiere a la contabilidad oficial hasta el cierre del curso por parte del admin.

---

## 5. Manual de Socio

Login vía `/login` con Google. Tras iniciar sesión:

- **`/home`**: panel privado del socio (`HomeSocio`).
- **`/perfil`** (`PerfilSocio`): datos personales, carnet digital con QR (`UID`), membresías activas (mes/categoría), historial.
- Si el socio queda inactivo (ver §2.2) el acceso a `/home` y `/perfil` queda bloqueado con un mensaje invitando a apuntarse a un curso para reactivar la condición.
- La newsletter es un flujo aparte en `/newsletter-kalian-privado`; está disponible incluso sin estar autenticado.

---

## 6. Manual de Portero

Acceso vía `/control-acceso`. **No requiere cuenta de usuario** — la tablet de puerta se autentica con una contraseña compartida server-side. `validatePuertaAccess` (Cloud Function) compara en tiempo constante (`timingSafeEqual`), aplica rate limit de 5 intentos/minuto por IP y emite un custom token con rol `portero`.

Desde `ControlAcceso`:
- **Selección del evento** del día.
- **Escaneo QR**: lee `ticketID` o `uid` del carnet digital. Verifica reserva, marca asistencia, decrementa aforo.
- **Caja del evento**: registra ingresos en efectivo/tarjeta/transferencia por método de pago.
- **Listado de Emergencia (PDF)**: botón `descargarListadoEmergencia` en `src/components/admin/ControlAcceso.tsx:655`. Genera un PDF con DNIs y estado de pago para control manual si cae internet. Crítico durante el evento.

Permisos restringidos por Firestore: el portero solo puede actualizar `aforo_actual`/`aforo_reservado` de eventos (`isPorteroAforoUpdate`).

---

## 7. Operativa

### 7.1 Backups

Firestore en `europe-west1`. Se recomienda configurar **exportaciones programadas** a Google Cloud Storage (consola GCP → Firestore → Export/Import → schedule). Antes de operaciones masivas (purga de socios inactivos, limpieza de residuos) hacer export manual.

### 7.2 Persistencia offline

**No está activa** actualmente. `src/firebase.ts` inicializa Firestore sin `enableIndexedDbPersistence` / `persistentLocalCache`. Si en algún momento se necesita modo offline para la tablet de puerta o para el panel de profesor, hay que activarlo explícitamente.

### 7.3 Sincronización con Brevo

- Alta → Firestore (estado `pendiente_confirmacion`) + Cloud Function `subscribeNewsletter` (la API key de Brevo vive solo en el servidor).
- Baja → webhook `brevoWebhook` actualiza Firestore con `estado: 'baja'`. Valida antigüedad del payload contra replay.
- Borrado admin → trigger `onNewsletterSubscriberDeleted` propaga DELETE a Brevo con reintentos (3, backoff exponencial).
- Reconciliación semanal → ver §2.5.

### 7.4 RGPD

- Política versionada en `POLITICA_VERSION` (`NewsletterForm.tsx`).
- Registro de IP, fecha y versión aceptada al alta.
- Conservación: 3 años tras baja, supresión total a petición en 30 días.
- Para la campaña de reconfirmación seguir el procedimiento de [SPEC.md §12](SPEC.md) (modelo de dos listas, ver §2.5).

### 7.5 Mantenimiento

- Tras desactivar un curso o pagar un local, llamar a `syncMultipleSocios()` con los IDs afectados para recomputar el estado.
- Los residuos de pagos sin socio aparecen en Contabilidad → botón Purgar.
- La integridad referencial entre `socios.cursos[]` y `cursos.alumnos[]` se valida en `AdminCursos` y `AdminSocios`.

---

## 8. Glosario

| Término | Significado |
|---|---|
| **HKG** | Hiri Kultur Gunea (en euskera: "espacio cultural urbano"). |
| **Socio activo** | Cumple ≥1 condición de §2.2. Disfruta de descuentos y ventajas. |
| **Socio inactivo** | Sin curso ni local con pago vigente. Acceso al panel bloqueado. |
| **Local** | Sala de ensayo alquilada por un grupo de socios. Su pago cubre la cuota. |
| **Aforo reservado** | Suma de reservas confirmadas para un evento. Capped por `aforo_maximo`. |
| **Carnet digital** | QR con `UID` del socio que se enseña en puerta. |
| **Listado de Emergencia** | PDF offline para el evento si cae internet. |
| **Doble opt-in** | El alta solo es válida tras clic de confirmación en el email. |
| **Master** | Cuenta con email `kalianrobot@gmail.com`. Permisos de todo (safety net). |
