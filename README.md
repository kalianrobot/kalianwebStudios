# Kalian HKG

Plataforma web de la asociación cultural **Kalian Hiri Kultur Gunea**: cara pública, panel de socios, panel de staff/admin, panel de profesores, control de acceso de puerta, gestión de newsletter con doble opt-in y contabilidad.

**Stack**: React 19 + Vite + TypeScript + Tailwind 4 · Firebase (Auth, Firestore, Functions, Hosting, Storage) en `europe-west1` · Brevo para email.

---

## Cómo arrancar

```bash
npm install
npm run dev          # Vite dev server en :3000
```

Crea un `.env.local` con las variables necesarias (al menos `VITE_BREVO_API_KEY`, `VITE_BREVO_NEWSLETTER_LIST_ID`). La configuración de Firebase del cliente vive en `firebase-applet-config.json`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Build de producción a `dist/` |
| `npm run preview` | Sirve el build local |
| `npm run lint` | `tsc --noEmit` (type-check) |
| `npm run clean` | Borra `dist/` |
| `firebase emulators:start` | Emuladores locales (Firestore :8080, Storage :9199) |
| `firebase deploy` | Despliegue completo manual (hosting + functions + reglas) — solo emergencia |

> **Producción**: el deploy es automático vía CI/CD. Cada merge a `main` dispara el CI, y al pasar arranca el workflow CD que despliega los 4 targets. Ver [Setup del CD](#setup-del-cd-administradores) abajo.

## Estructura

```
src/                # SPA React (pages, components, context, i18n, lib)
functions/          # Cloud Functions (Node 22, TypeScript)
firestore.rules     # Reglas de seguridad Firestore
storage.rules       # Reglas de Storage
firebase.json       # Hosting + CSP + functions + emuladores
```

---

## Documentación

| Fichero | Rol | Cuándo leerlo |
|---|---|---|
| [README.md](README.md) | Entry point: qué es, cómo arrancar, mapa de docs | Primer contacto con el repo |
| [SPEC.md](SPEC.md) | Cómo está construido (técnica) | Antes de tocar código |
| [DOCUMENTATION.md](DOCUMENTATION.md) | Qué hace + manuales (Staff, Profesor, Socio, Portero) + reglas de negocio | Para explicar el sistema o usarlo |
| [SECURITY_SPEC.md](SECURITY_SPEC.md) | Invariantes + Dirty Dozen contra `firestore.rules` | En code review de cambios sensibles |

Las decisiones arquitectónicas o de producto que afecten al código se actualizan en `SPEC.md` en el mismo PR que las introduce. Las reglas de negocio o cambios de flujo de usuario, en `DOCUMENTATION.md`.

> Si trabajas con **Claude Code** en este repo, hay un `CLAUDE.md` con las reglas operativas del agente (idioma, workflow git, trampas conocidas, qué no hacer). Se carga automáticamente en cada sesión.

---

## Setup del CD (administradores)

Solo necesario una vez (o al rotar credenciales). El CD se define en `.github/workflows/cd.yml`.

### 1. Crear Service Account en GCP

En [GCP Console](https://console.cloud.google.com/iam-admin/serviceaccounts) (proyecto `kalianhkg-886a6`):

1. **Service Accounts → Create service account**, nombre `github-actions-cd`.
2. Asignar estos roles (mínimo privilegio, ver `SECURITY_SPEC.md` §7):
   - `Firebase Admin`
   - `Cloud Functions Admin`
   - `Service Account User`
3. Pestaña **Keys → Add key → Create new key → JSON**. Descarga el fichero.

### 2. Configurar secrets en GitHub

En `Settings → Secrets and variables → Actions`, añadir:

| Secret | Valor |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Pegar el JSON entero del paso 1 |
| `VITE_FIREBASE_API_KEY` | De Firebase Console → Project settings → SDK setup |
| `VITE_FIREBASE_AUTH_DOMAIN` | idem |
| `VITE_FIREBASE_PROJECT_ID` | idem |
| `VITE_FIREBASE_STORAGE_BUCKET` | idem |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | idem |
| `VITE_FIREBASE_APP_ID` | idem |
| `VITE_FIREBASE_MEASUREMENT_ID` | idem |
| `VITE_BREVO_API_KEY` | De Brevo Account → SMTP & API → API keys |
| `VITE_BREVO_NEWSLETTER_LIST_ID` | ID numérico de la lista en Brevo |

### 3. (Opcional pero recomendado) Branch protection en `main`

En `Settings → Branches → Add rule` para `main`:
- Require status checks to pass before merging → marcar **CI**.
- Require pull request before merging.

Así nada llega a `main` sin pasar tests, y por tanto nada se despliega sin pasarlos.

### 4. Rotación de la key

Cada 90 días: regenerar key en GCP → actualizar `FIREBASE_SERVICE_ACCOUNT` en GitHub → revocar la vieja.
