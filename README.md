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
| `firebase deploy` | Despliegue completo (hosting + functions + reglas) |

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
