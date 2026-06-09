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
2. **Reservas válidas**: una reserva solo se crea si referencia un `eventoId` que existe en `eventos` o `cursos`. (`isValidReserva` + `exists(/databases/.../eventos|cursos)`.)
3. **Capacidad mínima**: `reservas.numPersonas ≥ 1 && ≤ 20`. (`isValidReserva`.)
4. **Aforo monotónico (alta pública)**: el alta de reserva solo puede **incrementar** `eventos.{id}.aforo_reservado`, nunca decrementar, en pasos ≤ 20, y nunca por encima de `aforo_maximo`. (`isSafeAforoUpdate`.)
5. **Newsletter — estado inicial**: el alta pública de `newsletter_subscribers` solo admite `estado: 'pendiente_confirmacion'`. La promoción a `'activo'` la hacen Cloud Functions o admin. (`isValidNewsletter`.)
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

## 4. Cómo usar este documento

- **En code review** de PRs que toquen `firestore.rules`, `functions/src/index.ts` o flujos sensibles (auth, pagos, reservas): repasar las invariantes (§1) y los payloads relevantes (§2).
- **Al añadir una colección o un nuevo flujo**: enumerar sus invariantes en §1 y los ataques plausibles en §2.
- **Cuando un payload pase de ✅ a 🟡 o ⚠️**: actualizar este doc en el mismo PR que provoca el cambio.
- Los tests conceptuales se materializan idealmente en `functions/test/rules.test.ts` con `@firebase/rules-unit-testing`.
