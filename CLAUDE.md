# CLAUDE.md

Reglas operativas para Claude Code en este repo. Se carga automáticamente en cada sesión. **No documenta el proyecto** — eso vive en `README.md`, `SPEC.md`, `DOCUMENTATION.md` y `SECURITY_SPEC.md`. Aquí solo va lo que afecta a **cómo** trabajas tú.

---

## 1. Idioma y tono

- Responde en **castellano**.
- Conciso. Una frase clara > un párrafo "completo".
- **No uses emojis** salvo que el usuario los pida explícitamente.
- No narres tu deliberación interna ("Voy a pensar…", "Déjame analizar…"). Estado, decisión, siguiente paso.
- Si algo está claro, actúa; si no, una pregunta corta con `AskUserQuestion`.

---

## 2. Workflow git

- Rama designada por sesión: respeta la que el entorno indica (típicamente `claude/...`). No crees ramas paralelas salvo que se pida.
- **Nunca push a `main`** sin permiso explícito del usuario.
- Nunca `--no-verify`, `--amend` o `push --force` sin pedirlo.
- Formato de commits: `tipo(scope): mensaje en castellano`. Tipos: `feat`, `fix`, `docs`, `refactor`, `chore`. Ejemplo: `feat(newsletter): doble opt-in nativo Brevo`.
- Un commit = una intención. Si el trabajo abarca docs + feature, dos commits.
- Footer estándar: enlace de sesión Claude Code.

---

## 3. Reglas de documentación

**Cada plan que produzcas en plan mode debe terminar con una sección "Impacto en docs"** que decida explícitamente qué hacer con cada archivo:

- `SPEC.md` — actualizar si el cambio toca arquitectura, stack, modelo de datos, Cloud Functions, roles, convenciones de código o roadmap.
- `DOCUMENTATION.md` — actualizar si el cambio modifica una regla de negocio, un manual de uso (Staff/Profesor/Socio/Portero) o la operativa.
- `SECURITY_SPEC.md` — actualizar si el cambio toca `firestore.rules`, invariantes de seguridad o introduce un nuevo flujo sensible.
- `README.md` — solo si cambian los comandos de arranque o el mapa de docs.

Los edits van en **el mismo PR** del cambio funcional, no después.

Si la decisión es "no impacta a ningún doc", escríbelo igualmente — así queda explícito que se ha pensado.

---

## 4. Comandos útiles

| Tarea | Comando | Dónde |
|---|---|---|
| Type-check del front | `npm run lint` | raíz |
| Build de producción | `npm run build` | raíz |
| Type-check Functions | `npx tsc --noEmit` | `functions/` |
| Emuladores Firebase | `firebase emulators:start` | raíz |
| Dev server | `npm run dev` | raíz |

Cuando termines un cambio en código, corre el type-check antes de commit. No corras `firebase deploy` nunca por iniciativa propia.

---

## 5. Trampas conocidas del repo

- **Cloud Functions** se despliegan siempre en `europe-west1`. Cualquier `onCall`/`onRequest`/`onSchedule` nuevo debe incluir `{ region: EU_REGION }`.
- **Alta de newsletter**: obligado `estado: 'pendiente_confirmacion'` (lo exige `firestore.rules → isValidNewsletter`). Si tocas el alta, también actualiza la regla.
- **Política RGPD**: al cambiar el texto de la política, bumpea `POLITICA_VERSION` en `src/components/public/NewsletterForm.tsx` y en `nlLegal.version` (`src/i18n/es.ts` + `eu.ts`).
- **Master email**: `kalianrobot@gmail.com` está hardcoded en `firestore.rules` y `src/lib/constants.ts → MASTER_EMAIL`. No lo refactorices a config sin pedirlo.
- **Botón de Emergencia (PDF)**: vive en `src/components/admin/ControlAcceso.tsx:655` (`descargarListadoEmergencia`), NO en AdminEventos.
- **i18n**: cualquier cadena visible va por `t()`. Toda nueva clave se añade en `src/i18n/es.ts` Y `src/i18n/eu.ts`.
- **Secretos Brevo** server-side: `defineSecret('BREVO_API_KEY' | 'BREVO_WEBHOOK_SECRET' | 'BREVO_NEWSLETTER_LIST_ID')`. La `VITE_BREVO_API_KEY` del cliente es deuda técnica conocida — no añadas más secretos al cliente.
- **Persistencia offline**: NO está activada. No prometas comportamiento offline sin activarla explícitamente.

---

## 6. Cosas que NO hacer sin permiso explícito

- `firebase deploy` (ningún `--only` incluido).
- Push a `main`, force-push a cualquier rama.
- Modificar `firebase-applet-config.json`, `.env`, `.env.local` o cualquier fichero con credenciales.
- Tocar `firestore.rules` sin actualizar `SECURITY_SPEC.md` en el mismo PR.
- Borrar documentos de `newsletter_subscribers` directamente — pasa por el flujo admin (dispara `onNewsletterSubscriberDeleted` que sincroniza con Brevo).
- Instalar dependencias nuevas en `package.json` o `functions/package.json` por iniciativa propia. Si hace falta, pídelo.
- `git reset --hard`, `git checkout --` sobre cambios no comiteados.

---

## 7. Punteros a la documentación

Antes de explorar a ciegas, abre el doc que toque:

- **Cómo está construido algo** (stack, modelo de datos, Cloud Functions, roles, convenciones) → `SPEC.md`.
- **Qué hace algo / regla de negocio / manual de usuario** → `DOCUMENTATION.md`.
- **Invariantes y casos de ataque** → `SECURITY_SPEC.md`.
- **Cómo arrancar / comandos** → `README.md`.

El esquema completo de `newsletter_subscribers` está en `SPEC.md §5`. La matriz de roles, en `SPEC.md §6` + `SECURITY_SPEC.md §1`.

---

## 8. Defaults útiles

- Cuando uses `AskUserQuestion`, máximo 1-2 preguntas a la vez. No agobies.
- Cuando lances agentes Explore: máximo 3, en paralelo, cada uno con foco distinto.
- Cuando edites un fichero ya existente: `Edit`, no `Write`.
- Cuando tengas dudas entre dos enfoques razonables, propone uno como recomendado y deja el otro como alternativa breve.
