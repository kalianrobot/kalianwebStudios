# CLAUDE.md — KalianBot

Reglas operativas para Claude Code en este repo.

---

## 1. Idioma y tono

- Responde en castellano.
- Conciso. No narres deliberación interna.
- No uses emojis salvo que el usuario los pida.

---

## 2. Workflow git

- Rama designada por sesión.
- Nunca push a `main` sin permiso.
- Nunca `--no-verify`, `--amend` o `push --force` sin pedirlo.
- Formato: `tipo(scope): mensaje`. Tipos: `feat`, `fix`, `docs`, `refactor`, `chore`.
- Scopes: `core`, `holded`, `icnea`, `gmail`, `pdf`, `booking`, `social`, `shared`, `docs`.

---

## 3. Reglas de documentación

Cada plan debe terminar con "Impacto en docs":
- `SPEC.md` — si toca arquitectura, agentes, skills, MCP servers, modelo de datos.
- `DOCUMENTATION.md` — si toca reglas de negocio, flujos o manual de uso.
- `SECURITY_SPEC.md` — si toca secretos, acceso, RGPD o audit.
- `README.md` — si cambian comandos de arranque.

---

## 4. Comandos útiles

| Tarea | Comando |
|---|---|
| Type-check | `npm run typecheck` |
| Tests | `npm run test` |
| Lint | `npm run lint` |
| Dev (bot local) | `npm run dev` |
| Build | `npm run build` |

Corre type-check antes de commit. No despliegues a producción por iniciativa propia.

---

## 5. Trampas conocidas

- **MCP servers** se ejecutan por stdio. Cada uno es un proceso independiente.
- **Skills con confirmación**: nunca ejecutes un skill con `requiresConfirmation: true` sin el paso de confirmación del usuario.
- **Audio de voz**: se borra en ≤24h. No lo almacenes en la DB.
- **Facturas**: siempre borradores en Holded. Nunca finalizar automáticamente.
- **Gmail OAuth tokens**: cifrados en DB. No los loguees.
- **Icnea API**: acceso pendiente. El MCP server puede tener stubs iniciales.

---

## 6. Cosas que NO hacer sin permiso

- Deploy a producción.
- Push a `main`, force-push a cualquier rama.
- Modificar `.env` o archivos con credenciales.
- Instalar dependencias nuevas por iniciativa propia.
- Finalizar facturas en Holded (solo borradores).
- Enviar emails reales en desarrollo (usar modo dry-run).
- Borrar datos del audit_log.

---

## 7. Punteros a la documentación

- Arquitectura, agentes, skills, modelo de datos → `SPEC.md`
- Reglas de negocio, manual de uso → `DOCUMENTATION.md`
- Seguridad, RGPD, amenazas → `SECURITY_SPEC.md`
- Setup y comandos → `README.md`
