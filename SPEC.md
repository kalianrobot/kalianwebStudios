# Kalian HKG — Spec

> **Documentos relacionados**
> - [README.md](README.md) — Entry point + cómo arrancar
> - SPEC.md — Cómo está construido *(este documento)*
> - [DOCUMENTATION.md](DOCUMENTATION.md) — Qué hace + manual
> - [SECURITY_SPEC.md](SECURITY_SPEC.md) — Invariantes de seguridad

Documento vivo de referencia para spec-driven development. Define qué es Kalian, cómo está construido y qué convenciones seguimos. Cuando una decisión queda fijada, vive aquí. Cuando algo cambia en el código, este documento se actualiza en el mismo PR.

**Foco de este documento**: arquitectura, código y convenciones. Las **reglas de negocio** (cuota mensual, socio activo/inactivo, manuales por rol) viven en [DOCUMENTATION.md](DOCUMENTATION.md). Las **invariantes y payloads de seguridad** viven en [SECURITY_SPEC.md](SECURITY_SPEC.md).

---

## 1. Resumen

**Kalian Hiri Kultur Gunea** es una asociación cultural sin ánimo de lucro. Esta web es:

- **Cara pública**: landing, programación, eventos, galería, donaciones, formulario de reserva como invitado.
- **Panel de soci@s**: acceso privado, perfil, membresías, carnet digital.
- **Panel de staff (admin)**: gestión integral — cursos, eventos, socios, locales, profesores, academias, newsletter, contabilidad, reservas, exposiciones, configuración, traducción EU.
- **Panel de profesor**: gestión de su curso, alumnos, pagos.
- **Panel de puerta (portero)**: control de acceso sin login de usuario, validación por contraseña compartida.
- **Newsletter** con doble opt-in vía Brevo + landing de estado.

Una sola SPA sirve todos los paneles según el rol del usuario autenticado.

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Estilos | Tailwind CSS 4 (`@tailwindcss/vite`) |
| Router | `react-router-dom` |
| Animación | `motion` |
| Auth | Firebase Auth |
| Base de datos | Firestore (region UE) |
| Backend | Firebase Cloud Functions v2, Node 22, `europe-west1` |
| Hosting | Firebase Hosting (`dist/`) |
| Storage | Firebase Storage |
| Email transaccional + listas | Brevo (Sendinblue) |
| Pagos donaciones | Transferencia (IBAN/QR), Bitcoin/Lightning, USDC |
| QR | `qrcode.react`, `html5-qrcode` |
| PDFs | `jspdf` + `jspdf-autotable` |
| Calendario | `@fullcalendar/*` |
| i18n | Diccionarios planos `es` / `eu` vía contexto propio |

---

## 3. Arquitectura

### Cliente
SPA React. Routing en `src/App.tsx`. `Suspense + lazy()` para todas las páginas y paneles. Contextos globales:
- `AuthContext` — usuario Firebase + rol + datos de socio.
- `LanguageContext` — diccionarios `es`/`eu`, persistido en `localStorage.kalian_lang`.

### Backend
Firebase. Tres bloques:
1. **Firestore + reglas** (`firestore.rules`): única fuente de verdad para todos los datos del dominio. Reglas server-side estrictas por colección.
2. **Cloud Functions** (`functions/src/index.ts`, region `europe-west1`):
   - `validatePuertaAccess` — auth de tablet de puerta por contraseña compartida → custom token rol `portero`.
   - `sendWelcomeEmail`, `sendMembershipUpdateEmail`, `sendReservationConfirmation` — emails transaccionales vía Brevo.
   - `gestionarReservaInvitado` — gestión de reserva sin login (capability token `manageToken`).
   - `brevoWebhook` — recibe `unsubscribed/spam/hardbounce/blocked`, marca bajas en Firestore.
   - `onNewsletterSubscriberDeleted` — sincroniza borrado admin → DELETE en Brevo.
   - `reconciliarNewsletterBrevo` — cron semanal (lunes 04:00 UTC). Sincroniza ambas direcciones, promueve `pendiente_confirmacion → activo`, marca bajas por caducidad o ausencia en Brevo.
3. **Hosting**: SPA estática con CSP estricto, HSTS, X-Frame-Options DENY (`firebase.json`).

### Integración Brevo
- **API** `https://api.brevo.com/v3/...`. Header `api-key: <BREVO_API_KEY>`.
- **Webhooks** validados con `?secret=<BREVO_WEBHOOK_SECRET>` (Brevo no firma HMAC).
- **Doble opt-in** activado nativamente en la lista de newsletter. NO usamos webhook DOI propio: la confirmación se refleja en Firestore vía la reconciliación semanal.
- **Secretos (Firebase Secret Manager)**: `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET`, `BREVO_NEWSLETTER_LIST_ID`.

⚠️ `VITE_BREVO_API_KEY` (cliente) es vulnerabilidad reconocida — debería moverse a Functions. Tracked.

---

## 4. Dominios funcionales

> Las **reglas de negocio** (cuota mensual, criterios de activo/inactivo, manuales de cada rol) están en [DOCUMENTATION.md](DOCUMENTATION.md). Aquí solo mapeamos qué módulos sirven a qué funcionalidad.

| Módulo | Páginas / componentes | Notas |
|---|---|---|
| Landing | `LandingPage` | Home pública con CTA a programación, reservas, newsletter. |
| Programación pública | `ProgramacionPublica`, `EventPage` | Listado y detalle de eventos/cursos. |
| Galería | `GaleriaPublica` | Catálogo de exposiciones. |
| Donaciones | `DonacionesPage` | IBAN, BTC, Lightning, USDC. |
| Reserva invitado | `ReservaForm`, `MiReserva` | Reserva sin login. Capability token para gestionar. |
| Newsletter | `NewsletterPage`, `NewsletterForm`, `NewsletterEstadoPage`, `NewsletterLegalModal` | Doble opt-in nativo de Brevo. Política versionada. |
| Login | `LoginSocio`, `AdminLogin`, `TeacherLogin`, `PuertaAccess` | Cuatro flows distintos. |
| Panel socio | `HomeSocio`, `PerfilSocio` | Carnet digital, membresías. |
| Panel admin | `Admin*` (Dashboard, Eventos, Cursos, Socios, Locales, Profesores, Academias, Staff, Newsletter, Solicitudes, Contabilidad, Reservas, Exposiciones, Config, TraducirEU) | Gestión integral. Solo `role == 'admin'` o master. |
| Panel profesor | `TeacherDashboard` | Su curso, alumnos, asistencia, pagos. |
| Control acceso | `ControlAcceso`, `PuertaAccess` | Tablet de puerta. Escaneo QR. |

---

## 5. Modelo de datos (Firestore)

Convenciones:
- Nombres de colección en plural y minúscula, snake_case si compuesto.
- Campos en castellano (`nombre`, `fecha`, `estado`). Los traducibles llevan sufijo `_eu` (`titulo_eu`, `descripcion_eu`).
- Estados en minúscula: `'activo' | 'inactivo' | 'baja' | 'pendiente_confirmacion'`.
- Timestamps con `serverTimestamp()`.

### Colecciones principales

| Colección | Propósito | Acceso |
|---|---|---|
| `users/{uid}` | Perfil de cualquier usuario autenticado + rol. `role` solo lo cambia admin. | Owner read/update (sin `role`), admin todo. |
| `socios/{id}` | Alta como soci@. DNI, membresías, estado. | Owner read, admin todo. |
| `cursos/{id}` (+ `sesiones/`) | Cursos y talleres. `alumnos`, `aforo_actual`, profesor asignado. | Lectura pública, admin/teacher escritura. |
| `eventos/{id}` | Eventos puntuales. Aforo, reservas. | Lectura pública. Reserva pública (validada). |
| `reservas/{id}` | Reserva de plaza (invitado o socio). Contiene `manageToken` (capability). | Crear validado; lectura por owner/admin/portero. |
| `academias/{id}`, `profesores/{id}`, `exposiciones/{id}`, `locales/{id}` | Catálogos. | Lectura pública, admin escritura. |
| `solicitudes_cursos/{id}` | Solicitudes de inscripción públicas. | Crear validado, lectura admin/teacher. |
| `newsletter_subscribers/{id}` | Newsletter. Ver §6. | Crear público validado, resto solo admin. |
| `finanzas/{id}`, `pagos_mensuales/{id}`, `pagos_inscripciones/{id}`, `caja_eventos/{id}`, `asistencia_eventos/{id}` | Contabilidad y caja. | Mix admin/teacher/portero. |
| `notificaciones/{id}` | Notificaciones por usuario. | Owner. |
| `config/{id}` | Config pública (landing, donaciones, etc.). | Lectura pública, admin escritura. |
| `configuracion/{id}` | Config interna (incl. `clave_puerta`). | Solo admin. |

### Esquema `newsletter_subscribers`

```ts
{
  nombre: string                       // 1..100
  email: string                        // lowercase, regex .+@.+\..+
  fecha: Timestamp                     // serverTimestamp
  ip?: string                          // capturada al alta
  acepto_terminos: true
  politica_version?: string            // p.ej. '2026-06-08-v2'
  estado: 'pendiente_confirmacion'     // estado inicial obligatorio en alta pública
        | 'activo'                     // tras DOI (reconciliación o admin)
        | 'baja'                       // bajas
  fecha_confirmacion?: Timestamp       // al promover a 'activo'
  motivo?: 'unsubscribed'              // webhook
        | 'spam'                       // webhook
        | 'hardbounce' | 'hard_bounce' // webhook
        | 'blocked'                    // webhook
        | 'reconciliacion'             // ausente en Brevo o blacklisted
        | 'bounce_o_baja'              // importado ya blacklisted
        | 'no_confirmado'              // sin confirmar tras 14 días
  fecha_baja?: Timestamp
  origen?: 'brevo_import'              // importado por reconciliación
}
```

---

## 6. Roles y autorización

> Las **invariantes y payloads de seguridad** que estas reglas garantizan están en [SECURITY_SPEC.md](SECURITY_SPEC.md).

| Rol | Cómo se asigna | Qué puede |
|---|---|---|
| **master** | Email == `kalianrobot@gmail.com` (hardcoded en `firestore.rules` y `MASTER_EMAIL`). | Todo (safety net). |
| **admin** | `users/{uid}.role == 'admin'` (solo asignable por admin). | Paneles `/staff/*`, lectura/escritura de todo el dominio. |
| **teacher** / `profesor` / `teacher_admin` | `users/{uid}.role` | Su panel `/profesor`, escritura limitada en sus cursos. |
| **socio** | Auth + doc en `socios` con su email/uid. | `/home`, `/perfil`. Bloqueado si `estado: 'inactivo'`. |
| **invitado_registrado** | Auth pero sin alta como socio activa. | Acceso limitado. |
| **portero** | Custom token emitido por `validatePuertaAccess`. UID `puerta-service`. | `/control-acceso`. Solo updates seguros en `eventos` (aforo). |
| **anónimo** | — | Lectura de catálogos, alta pública validada (newsletter, reserva invitado, solicitud curso). |

**Principio**: lectura pública generosa para catálogos, escritura siempre validada por forma (tamaños, regex, claves permitidas).

---

## 7. i18n

- Idiomas: **es** (default) y **eu** (euskera).
- Implementación propia (no `react-i18next`). Diccionarios planos `Record<string, string>` con claves puntuadas (`'newsletter.subtitle'`).
- API: `const { t, tField, language, setLanguage } = useLanguage()`.
- `t(key, params?)` interpola `{var}`.
- `tField(doc, 'titulo')` lee `titulo_eu` si existe y el idioma es `eu`, si no `titulo`.
- Persistencia: `localStorage.kalian_lang`.
- Fechas: `formatDate(date, language)` en `src/i18n/dateFormat.ts` (meses euskéricos hardcodeados).

**Regla**: toda cadena visible al usuario va por `t()`. Nunca hardcodear texto en componentes.

---

## 8. Branding y UI

Colores en `src/index.css`:
- `--color-kalian-dark: #1c1917` — fondo
- `--color-kalian-gold: #c5a059` — color principal de marca
- `--color-kalian-cream: #e7e5e4` — texto
- `--color-kalian-orange: #f97316`
- Acentos secundarios: `indigo-500/600` (newsletter, CTAs), `emerald` (éxito), `rose/red` (error/baja), `amber` (pendiente).

Estilo: tipografía gruesa, `font-black uppercase`, italic, `tracking-widest`, esquinas muy redondeadas (`rounded-[2rem]/[3rem]`). Look poster.

Clase utilitaria global: `kalian-poster-text` para títulos grandes.

---

## 9. Estructura del repositorio

```
/                          # raíz: configs + spec
├── src/
│   ├── App.tsx            # router + auth guard
│   ├── firebase.ts        # init Firebase + helpers
│   ├── context/           # AuthContext, LanguageContext
│   ├── i18n/              # es.ts, eu.ts, dateFormat.ts
│   ├── lib/               # adminAuth, brevoService, constants, finanzas, reservaInvitado, slug, socioService, configService
│   ├── pages/             # rutas top-level (Landing, Newsletter, Reserva, etc.)
│   └── components/
│       ├── public/        # NewsletterForm, ReservaForm, Navbar, modales legales…
│       ├── auth/          # LoginSocio
│       ├── socio/         # HomeSocio, PerfilSocio
│       ├── teacher/       # TeacherDashboard
│       └── admin/         # Admin* (gestores)
├── functions/             # Cloud Functions (TypeScript, Node 22)
│   └── src/index.ts       # todas las funciones
├── firestore.rules        # reglas de seguridad
├── storage.rules
├── firebase.json          # hosting + functions + emulators + CSP
└── SPEC.md                # este documento
```

---

## 10. Convenciones de desarrollo

### Código
- TypeScript en todo. `any` solo cuando interactúas con Firestore data sin tipar (común aquí).
- Componentes funcionales con hooks. Nada de clases.
- Sin comentarios decorativos. Solo cuando expliquen un porqué no obvio (constraint legal, workaround, decisión arquitectónica).
- Sin `console.log` en producción: usar `import.meta.env.DEV` para guardarlo.
- Sin backwards-compat hacks ni feature flags improvisados.
- No usar emojis en texto al usuario salvo en componentes ya establecidos (éxito/error visual).

### Firestore
- Validar siempre en `firestore.rules` con función `isValid<Entidad>(data)` y reglas `match` por colección.
- `serverTimestamp()` para todas las fechas de servidor.
- Strings que vienen del usuario: trim + lowercase para `email`.

### Cloud Functions
- Region `europe-west1` siempre.
- Secretos vía `defineSecret(...)`, nunca env vars planas para Brevo.
- Webhook entrante: validar secret antes de procesar.
- Devolver 200 incluso en eventos ignorados (evita reintentos innecesarios).

### Newsletter
- **Alta**: cliente escribe `estado: 'pendiente_confirmacion'`. La reconciliación promueve a `activo`. Editar este flujo requiere actualizar también `firestore.rules` (`isValidNewsletter`).
- **Bajas**: nunca borrar `newsletter_subscribers/{id}` directamente sin pasar por el webhook o flow admin (el trigger `onNewsletterSubscriberDeleted` propaga al Brevo).
- **Política RGPD**: actualizar `POLITICA_VERSION` en `NewsletterForm.tsx` + texto en `nlLegal.*` cuando cambien las condiciones.

### Commits
- Mensajes en castellano, scope entre paréntesis: `feat(newsletter): ...`, `fix(socios): ...`, `docs(legal): ...`.
- Una intención por commit.
- Footer: enlace de sesión Claude Code.

---

## 11. Despliegue

```bash
npm run build            # vite build → dist/
firebase deploy          # hosting + functions + reglas
firebase deploy --only functions
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

Predeploy de functions: `npm --prefix functions install && npm --prefix functions run build`.

Emuladores locales:
```bash
firebase emulators:start
# Firestore: 8080, Storage: 9199
```

CSP y cabeceras de seguridad: definidas en `firebase.json` (HSTS, X-Frame DENY, CSP estricta con whitelist de Brevo, Google, Firebase, ipify, mymemory).

---

## 12. Estado actual y roadmap

### Hecho recientemente
- Doble opt-in nativo Brevo + landing `/newsletter/estado` polivalente (PR #5).
- Reconciliación semanal ampliada: promociones, caducidad, baja por ausencia.
- Badge "PENDIENTE" en `AdminNewsletter`.
- Reglas Firestore: estado inicial restringido en alta pública.

### Pendiente operativo (no código)
- Activar doble opt-in en la lista Brevo + plantilla DOI con URL final `/newsletter/estado?accion=confirmado`.
- Crear atributos `RECONFIRMADO` (bool) + `FECHA_RECONFIRMACION` (date) en Brevo.
- Lanzar campaña de reconfirmación RGPD: dos CTA ("Sigo dentro" / "Darme de baja"), eliminar al final los `RECONFIRMADO != true`.

### Deuda técnica conocida
- `VITE_BREVO_API_KEY` expuesta al cliente → migrar envíos al servidor (Cloud Function).
- `brevoWebhook` aún no escucha confirmación DOI (se decidió delegar en la reconciliación). Reconsiderar si latencia semanal molesta.
- `AdminNewsletter` no tiene filtro explícito por estado `pendiente_confirmacion` (solo badge visual).

---

## 13. Cómo usar este documento

Cuatro documentos, cuatro responsabilidades. No dupliques entre ellos:

| Cuándo | Documento |
|---|---|
| Vas a tocar código | **SPEC.md** (este) |
| Vas a explicar qué hace la app, manual de usuario, reglas de negocio | **DOCUMENTATION.md** |
| Vas a revisar un cambio sensible o auditar seguridad | **SECURITY_SPEC.md** |
| Es la primera vez que abres el repo | **README.md** |

**Reglas para mantenerlos vivos**:
- Si un PR introduce un nuevo concepto técnico (estado, función, integración, convención), actualiza SPEC.md en el mismo PR.
- Si un PR cambia el flujo de usuario o una regla de negocio, actualiza DOCUMENTATION.md.
- Si un PR introduce o cambia una invariante de seguridad, actualiza SECURITY_SPEC.md.
- Si descubres que el código y un doc se contradicen, decide cuál es la verdad y actualiza el otro lado en el mismo PR.
- Rechaza PRs que añadan complejidad sin reflejarse en el documento que corresponda.

El objetivo es que cualquier desarrollador (humano o agente) pueda ponerse al día con `README → SPEC → DOCUMENTATION` y los puntos del código que citan.
