# Security Spec — Kalian HKG

> **Documentos relacionados**
> - [README.md](README.md) — Entry point + cómo arrancar
> - [SPEC.md](SPEC.md) — Cómo está construido (técnica)
> - [DOCUMENTATION.md](DOCUMENTATION.md) — Qué hace + manual
> - SECURITY_SPEC.md — Invariantes de seguridad *(este documento)*

Spec de seguridad operativa: invariantes que las reglas de Firestore deben mantener y los **"Dirty Dozen" payloads** que sirven como casos de prueba. Para la matriz de roles a alto nivel ver [SPEC.md §6](SPEC.md). Las reglas reales viven en `firestore.rules`.

---

## 1. Invariantes

Estas afirmaciones deben ser ciertas en cualquier estado de la base de datos. Si una falla, hay un bug en `firestore.rules` o en el código que escribe.

1. **Roles**: el campo `users/{uid}.role` solo lo puede modificar un admin. Un usuario nunca se autoasigna `'admin'`. (`firestore.rules` → `match /users/{userId}` allow update sin `role`.)
2. **Reservas válidas**: una reserva solo se crea si referencia un `eventoId` que existe en `eventos` o `cursos`. (`isValidReserva` + `exists(/databases/.../eventos|cursos)`.) El campo opcional `precioVerificado` (bool) marca si `totalPagar` se validó server-side con `calcularPrecioReserva`; cuando es `false` AdminReservas muestra un aviso para revisión manual.
3. **Capacidad mínima**: `reservas.numPersonas ≥ 1 && ≤ 20`. (`isValidReserva`.)
4. **Aforo monotónico (alta pública)**: el alta de reserva solo puede **incrementar** `eventos.{id}.aforo_reservado`, nunca decrementar, en pasos ≤ 20, y nunca por encima de `aforo_maximo`. (`isSafeAforoUpdate`.)
5. **Newsletter — estado inicial**: el alta pública de `newsletter_subscribers` solo admite `estado: 'pendiente_confirmacion'`. El doc ID es el email, así que la re-alta sobre un doc en `'baja'` o `'pendiente_confirmacion'` se permite (update público con `incoming().email == existing().email`) pero un doc en `'activo'` no puede degradarse desde un contexto anónimo. La promoción a `'activo'` la hacen Cloud Functions o admin. (`isValidNewsletter`.)
6. **Ownership de reservas**: el lector de una reserva debe ser admin, portero, el `uidTitular`, o coincidir con `emailTitular` en su token. (`match /reservas/{id}` allow read.)
7. **Edición de reserva por owner**: el titular puede modificar **solo** `acompañantes`. Cualquier otro campo requiere admin/portero. (`match /reservas/{id}` allow update.)
8. **Capability tokens**: gestionar reserva de invitado requiere el `manageToken` (16-64 chars) emitido al hacer la reserva. La verificación ocurre en la Cloud Function `gestionarReservaInvitado`.
9. **Validación de socio**: el alta de socio (`socios`) exige `uid == request.auth.uid`. (`isValidSocioCreate`.)
10. **Solo admin lee la newsletter**: alta pública validada, pero lectura, edición y borrado son admin-only. Esto impide enumeración de emails. (`match /newsletter_subscribers/{id}`.)
11. **Webhook autenticado**: `brevoWebhook` rechaza cualquier request sin `?secret=<BREVO_WEBHOOK_SECRET>` válido. (`functions/src/index.ts` → `brevoWebhook`.)
12. **Portero acotado**: el custom token de `portero` solo permite actualizar `aforo_actual`/`aforo_reservado` en eventos. Nada más. (`isPorteroAforoUpdate`.)

---

## 2. Dirty Dozen — payloads de ataque y respuesta esperada

Cada payload es un test conceptual. La columna **Estado** indica si el payload está actualmente cubierto por las reglas o necesita atención.

| # | Target | Ataque | Respuesta esperada | Regla / función | Estado |
|---|---|---|---|---|---|
| 1 | `users/{uid}` update | Cambiar `role` a `'admin'` siendo el propio usuario | `PERMISSION_DENIED` | `match /users/{userId}` allow update sin `role` | ✅ cubierto |
| 2 | `reservas/{id}` create | Inyectar campos extra (`isAdmin: true`, `esSocio: true`) | El campo se ignora; el rol real depende de `users/{uid}.role`, no del payload | `isValidReserva` valida tipos pero **no usa `hasOnly`** — campos extra inertes | ⚠️ verificar: riesgo bajo (el rol vive en `users/`), endurecer con `hasOnly` |
| 3 | `reservas/{id}` create | `numPersonas: -10` o `numPersonas: 0` | `PERMISSION_DENIED` | `isValidReserva` exige `>= 1 && <= 20` | ✅ cubierto |
| 4 | `eventos/{id}` create con ID gigante | Path con string de 2 KB | `PERMISSION_DENIED` (admin-only para create) | `match /eventos/{id}` allow create solo admin | ✅ cubierto vía admin gate |
| 5 | `eventos/{id}` update directo | Subir `aforo_reservado` sin crear reserva | `PERMISSION_DENIED` salvo admin/portero/incremento acotado | `isSafeAforoUpdate` exige incremento ≤ 20 y ≤ `aforo_maximo`; alternativa `isPorteroAforoUpdate` | ✅ cubierto |
| 6 | `reservas/{id}` update | Cambiar `uidTitular` a otro UID | `PERMISSION_DENIED` | allow update solo si `uidTitular == request.auth.uid` y `affectedKeys.hasOnly(['acompañantes'])` | ✅ cubierto |
| 7 | `socios/{id}` create | Crear con `uid != request.auth.uid` | `PERMISSION_DENIED` | `isValidSocioCreate` exige `uid == request.auth.uid` | ✅ cubierto |
| 8 | `reservas/{id}` create | Reserva contra evento inexistente | `PERMISSION_DENIED` | `exists(.../eventos/$(eventoId)) \|\| exists(.../cursos/$(eventoId))` | ✅ cubierto |
| 9 | `reservas/{id}` update | Revivir reserva cancelada (`estado: 'cancelado' → 'pendiente'`) | N/A — el modelo actual **borra** la reserva al cancelar (`gestionarReservaInvitado`); no hay campo `estado` | — | 🟡 obsoleto: esquema antiguo |
| 10 | `users/{uid}` create | Auto-asignar email de admin en el doc | `PERMISSION_DENIED` para `role`; el master se detecta por `request.auth.token.email`, no por el campo del doc | `isMasterAdmin()` valida contra `request.auth.token.email` | ✅ cubierto |
| 11 | `reservas` list | `query` sin filtro por UID/email | `PERMISSION_DENIED` para no-admin/portero | allow read por owner/admin/portero; list sin filtro requiere read en cada doc | ✅ cubierto |
| 12 | `newsletter_subscribers/{id}` create | Alta directa con `estado: 'activo'` | `PERMISSION_DENIED` | `isValidNewsletter` exige `estado == 'pendiente_confirmacion'` si se informa | ✅ cubierto (PR #5) |

**Leyenda**:
- ✅ cubierto — la regla actual rechaza el payload.
- ⚠️ verificar — el escenario práctico está controlado pero la regla podría endurecerse.
- 🟡 obsoleto — el payload describe un esquema antiguo; ya no aplica.

---

## 3. Endurecimientos recomendados

Backlog ordenado por impacto/coste.

1. **`isValidReserva` con `hasOnly`** — limitar las claves permitidas en `reservas` al crear para impedir campos extra inertes (Payload #2). Coste bajo.
2. **`isValidNewsletter` con `hasOnly`** — mismo razonamiento sobre `newsletter_subscribers`.
3. **Tests automatizados** — definir suite (`functions/test/rules.test.ts` con `@firebase/rules-unit-testing`) que ejecute cada payload contra el emulador. Pendiente desde la versión original de este documento.
4. **Mover `VITE_BREVO_API_KEY` al servidor** — está expuesta en el bundle del cliente. Tracked también en [SPEC.md §12](SPEC.md).
5. **Validar firma HMAC de webhooks Brevo** — actualmente usamos query secret porque Brevo no firma. Si Brevo añade firma, migrar.

---

## 4. Hallazgos pendientes — auditoría junio 2026

Auditoría exhaustiva de `firestore.rules`, Cloud Functions y cliente. Los hallazgos abajo se gestionan como sprints. Cuando uno se cierre, mover de "pendiente" a "✅ cerrado" indicando el PR/commit.

### Sprint 1 — Críticos

| # | Área | Hallazgo | Mitigación | Estado |
|---|---|---|---|---|
| C1 | Cliente | `VITE_BREVO_API_KEY` expuesta en bundle (`src/lib/brevoService.ts`, `NewsletterForm.tsx:64`). Permite enviar emails como Kalian, enumerar contactos. | Migrar envíos a Cloud Function callable. Quitar la VITE_ var. | ✅ cerrado (`fix/security-criticos`) |
| C2 | Functions | `sendReservationConfirmation` es `onCall` **sin auth ni validación de origen**. Cualquiera dispara emails con remitente verificado. | Validar que `manageToken` existe en `reservas` y leer los datos del doc, no del request. | ✅ cerrado (`fix/security-criticos`) |
| C3 | Functions | Inyección HTML en plantillas de email (`${nombre}`, `${eventoTitulo}`, etc. sin escape). CSS injection / phishing en clientes de email. | Helper `escapeHtml` aplicado a toda interpolación. | ✅ cerrado (`fix/security-criticos`) |
| C4 | Functions | PII (emails completos) en logs de `brevoWebhook`, `onNewsletterSubscriberDeleted`, `reconciliarNewsletterBrevo`. Retención por defecto 30 días → riesgo RGPD. | Helper `maskEmail()` o hash SHA-256 corto. | ✅ cerrado (`fix/security-criticos`) |

### Sprint 2 — Altos

| # | Área | Hallazgo | Mitigación | Estado |
|---|---|---|---|---|
| A1 | Functions | `brevoWebhook` sin HMAC ni validación de timestamp → replay si secret se filtra. | Validar timestamp del payload + rate limit por IP. | ✅ cerrado — timestamp validation en `brevoWebhook` (≤5 min). Brevo no firma HMAC; secret en query sigue siendo la primera línea de defensa. |
| A2 | Functions | `onNewsletterSubscriberDeleted` no reintenta ante 500/timeout/429 de Brevo → contacto sigue activo aunque borrado de Firestore (RGPD). | Retry con backoff exponencial (3 intentos) o Cloud Task. | ✅ cerrado — `withRetry` (3 intentos, backoff 2 s/4 s) en `onNewsletterSubscriberDeleted`. |
| A3 | Functions | `validatePuertaAccess` compara contraseña con `!==` (timing) y sin rate limit. | `crypto.timingSafeEqual()` + throttle por IP. | ✅ cerrado — `timingSafeEqual` + rate limit 5 intentos/min en memoria de instancia. |
| A4 | Cliente | Cálculo de `totalPagar` 100% client-side (`ReservaForm.tsx`). Firestore no valida precio. | Mover cálculo a Cloud Function. Cobertura inmediata de futuros pagos electrónicos. | ✅ cerrado — `calcularPrecioReserva` callable; cliente usa resultado del servidor al enviar. Display local sigue siendo real-time. |
| A5 | Hosting | CSP con `'unsafe-inline'` en `script-src` (`firebase.json:49`). XSS residual sin protección. | Migrar a nonces o eliminar scripts inline. | ✅ cerrado — `'unsafe-inline'` eliminado de `script-src`. App usa `<script type="module">` en producción; GTM no está activo en el código. |
| A6 | Cliente | `console.error/warn` con `uid`/`email` sin guard `isDev` (`ReservaForm.tsx:167,382,387`). PII en DevTools y herramientas de monitorización. | `if (isDev)` o helper `logger.dev()`. | ✅ cerrado — todos los `console.error/warn` con PII envueltos en `isDev` (`ReservaForm.tsx`). |

### Sprint 3 — Medios (higiene)

| # | Hallazgo | Estado |
|---|---|---|
| M1 | `isValidReserva`, `isValidSolicitud`, `isValidNewsletter` sin `hasOnly` (campos arbitrarios inertes pero feos). | ✅ cerrado — `hasOnly` con allowlist explícita en las tres reglas. |
| M2 | `emailTitular` en reservas sin regex (las otras `isValid*` sí la tienen). | ✅ cerrado — `data.emailTitular.matches('.+@.+\\..+')` añadido. |
| M3 | `isPorteroAforoUpdate` no valida que los nuevos valores sean `number`. | ✅ cerrado — añadidos checks `aforo_actual is number` y `aforo_reservado is number`. |
| M4 | Matching de email en `socios/{id}` sin `.lower()` (inconsistente con `reservas`). | ✅ cerrado — `.lower()` en ambos lados de la comparación. |
| M5 | `pagos_mensuales` sin función `isValid*`. | ✅ cerrado — `isValidPagoMensual` con `hasOnly` + tipos + rangos (mes 1-12, año ≥2024). |
| M6 | `callBrevo` sin timeout. | ✅ cerrado — `BREVO_TIMEOUT_MS = 15000` + `AbortController` en `callBrevo`, `subscribeNewsletter`, `onNewsletterSubscriberDeleted`, `reconciliarNewsletterBrevo`. |
| M7 | Validación de respuesta Brevo asume JSON sin comprobar `content-type`. | ✅ cerrado — helper `safeJson(res)` valida `content-type: application/json` antes de parsear. |
| M8 | `reconciliarNewsletterBrevo` no usa transacciones en los updates. | 🟡 pendiente — los updates son idempotentes (estado por email) y la cron corre una vez por semana; el coste de transaccionar supera al beneficio. Si en el futuro coinciden con altas concurrentes, revisitar. |
| M9 | Validaciones de fechas (`apertura_socios`, `apertura_general`) solo client-side. | 🟡 pendiente — son fechas de marketing (cuándo aparecen los CTA), no autorización. El backend ya impide reservar por encima del aforo o sobre eventos inexistentes. Bajo riesgo. |

### Sprint 4 — Bajos (limpieza)

| # | Hallazgo | Estado |
|---|---|---|
| B1 | Doble `match /asistencia_eventos` — redundante, confuso. | ✅ cerrado — eliminada la regla más restrictiva; queda solo la que incluye `isTeacher()`. |
| B2 | Regex de email `.+@.+\\..+` muy laxa (permite `@` en el local/domain). | ✅ cerrado — reemplazada por `[^@]+@[^@]+\\.[a-zA-Z]{2,}` en todas las `isValid*`. |
| B3 | `ticketID` con `Math.random()` (predecible aunque no es secreto). | ✅ cerrado — `crypto.getRandomValues(new Uint8Array(4))` en `ReservaForm.tsx`. |
| B4 | `node-fetch@2.7.0` — dependencia obsoleta cuando Node 22 tiene `fetch` nativo. | ✅ cerrado — eliminada la dependencia y el import; las `signal` casts `as any` también eliminadas. |
| B5 | Comentarios en `firestore.rules` que revelan vectores corregidos (C1/C2/C3/A4/A5…). | ✅ cerrado — comentarios de código de vulnerabilidad eliminados; la historia vive en `SECURITY_SPEC.md` y en los commits. |
| B6 | Fallback de `aforo_maximo` a 9999 en `isSafeAforoUpdate`. | 🟡 aceptado — fallback intencional para eventos sin campo `aforo_maximo`; cambiar a 0 rompería eventos existentes sin ese campo. Documentar en DOCUMENTATION.md que el campo es obligatorio al crear eventos. |
| B7 | Cupones (`cupon`, `precioCupon`) en docs `eventos` con lectura pública. | 🟡 diseño aceptado — los cupones son códigos promocionales distribuidos activamente; moverlos a colección privada requeriría refactor del flujo `ReservaForm`. Riesgo real: usuario listo puede descubrir el cupón viendo el doc del evento en Firestore. Revisitar si se añaden cupones de uso único. |

### Falsos positivos descartados

- **UID de Firebase en QR del carnet**: no es secreto, es identificador que el usuario enseña él mismo.
- **`firebase-applet-config.json` commiteado**: público por diseño; la seguridad real está en `firestore.rules` + restricciones de API key en GCP.
- **`localStorage.kalian_lang`**: solo idioma, no PII.
- **`target="_blank"`**: ya tiene `rel="noreferrer"` en los puntos auditados.

---

## 5. Cómo usar este documento

- **En code review** de PRs que toquen `firestore.rules`, `functions/src/index.ts` o flujos sensibles (auth, pagos, reservas): repasar las invariantes (§1) y los payloads relevantes (§2).
- **Al añadir una colección o un nuevo flujo**: enumerar sus invariantes en §1 y los ataques plausibles en §2.
- **Cuando un payload pase de ✅ a 🟡 o ⚠️**: actualizar este doc en el mismo PR que provoca el cambio.

### Tests ejecutables

Los invariantes y payloads de §2 tienen contraparte ejecutable en `tests/firestore.rules.test.ts` con `@firebase/rules-unit-testing` (Vitest):

| Invariante / payload | `describe` correspondiente |
|---|---|
| Escalada de privilegios `users.role` | `users / privilege escalation` |
| Lectura de socios cruzada | `socios` |
| `isValidReserva.hasOnly` + email regex | `audit: isValidReserva.hasOnly` |
| `isValidPagoMensual` (mes/anio range, type) | `audit: isValidPagoMensual` |
| `isValidNewsletter` (doble opt-in, hasOnly) | `audit: isValidNewsletter` |
| Lectura socios case-insensitive | `audit: socios read case-insensitive email` |

Comandos: `npm run test:rules` (necesita emulador Firestore en `127.0.0.1:8080`), `npm run test:unit` para los helpers puros (`escapeHtml`, `withRetry`, `safeJson`, etc.).

---

## 6. Escaneo estático

Dos capas complementarias en CI, ambas gratuitas:

### Capa 1 — ESLint security plugin

Integrado en `eslint.config.js` vía `eslint-plugin-security`. Se ejecuta en cada `npm run lint` (local + CI). Detecta patrones JS clásicos:

- `detect-eval-with-expression` — uso de `eval()` con strings dinámicos.
- `detect-non-literal-regexp` / `detect-unsafe-regex` — regex catastrófico (ReDoS).
- `detect-object-injection` — acceso `obj[clave]` con clave externa (prototype pollution).
- `detect-child-process` / `detect-non-literal-fs-filename` — comandos shell sin sanitizar.

Findings actuales: ~385 warnings, 0 errores. Triaje gradual; los `detect-object-injection` en context providers son falsos positivos legítimos (claves controladas por tipos TS).

### Capa 2 — Semgrep en CI

Paso `SAST (Semgrep)` en `.github/workflows/ci.yml` con rulesets OSS:

- `p/javascript`, `p/typescript`, `p/react` — patrones específicos del stack.
- `p/owasp-top-ten` — OWASP A01-A10 (broken access, injection, XSS, etc.).
- `p/secrets` — claves de API, tokens hardcoded.

Exclusiones en `.semgrepignore`: `dist/`, `coverage/`, `tests/`, `node_modules/`, `functions/lib/`. Findings de severidad ERROR rompen el build; WARNING solo se reportan.

### Qué NO cubre

- **CodeQL** (GitHub Advanced Security) — descartado por coste en repos privados.
- **SAST con taint analysis cross-language** — requeriría Snyk Code o similar. Opcional, sin urgencia.
- **DAST** (escaneo dinámico) — no aplicable hasta tener entorno de staging dedicado.

---

## 7. Pipeline CD — Service Account y secrets

Deploy automático a Firebase (`.github/workflows/cd.yml`) tras CI verde en `main`.

### Service Account (`github-actions-cd@kalianhkg-886a6.iam.gserviceaccount.com`)

Roles asignados, principio de mínimo privilegio:

| Rol | Para qué | Por qué no menos |
|---|---|---|
| `roles/firebase.admin` | Deploy de hosting, firestore.rules, storage.rules | El rol granular `roles/firebasehosting.admin` no cubre reglas |
| `roles/cloudfunctions.admin` | Deploy + update de Cloud Functions Gen2 | Functions Gen2 necesita admin para gestionar la imagen Cloud Run subyacente |
| `roles/iam.serviceAccountUser` | Asignar el SA de runtime a las functions Gen2 | Sin él, deploy de functions falla con `iam.serviceAccountUser permission denied` |

Roles que **NO** se otorgan:
- `roles/owner`, `roles/editor` — demasiado amplios.
- `roles/secretmanager.admin` — el SA no necesita gestionar los `defineSecret('BREVO_*')`; esos se rotan manualmente.

### Secrets en GitHub Actions

| Secret | Origen | Uso |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON descargado de GCP Console (paso de alta del SA) | Auth deploy |
| `VITE_FIREBASE_*` (×7) | Firebase Console → Project settings → SDK setup | Inyectados en `npm run build` |
| `VITE_BREVO_API_KEY`, `VITE_BREVO_NEWSLETTER_LIST_ID` | Brevo Account → API keys | Inyectados en `npm run build` (deuda técnica conocida, ver CLAUDE.md §5) |

### Invariantes operativos

- **Rotación de la key del SA**: cada 90 días. Generar nueva key → actualizar `FIREBASE_SERVICE_ACCOUNT` en GitHub → revocar la vieja en GCP.
- **Sin `--force` en el deploy**: si Firebase iba a borrar una function, falla y se revisa manualmente. Nunca añadir `--force` sin permiso explícito.
- **Deploy parcial no transaccional**: `firebase deploy` despliega target a target. Si hosting OK y functions falla, queda inconsistente. Aceptable para este proyecto (volumen bajo, rollback con re-deploy del commit anterior).
- **Channels de preview**: no se usan. Toda PR se valida con CI; el merge a `main` va directo a producción.
