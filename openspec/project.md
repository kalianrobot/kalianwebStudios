# Proyecto: Kalian HKG — Plataforma de gestión

## Contexto

Kalian HKG es una asociación cultural sin ánimo de lucro. Esta plataforma
centraliza socios, oferta académica (música y danza), locales de ensayo,
eventos, contabilidad, control de aforo en puerta y newsletter.

**Fuentes de la verdad sobre el producto**:

- `SPEC.md` — stack, arquitectura, modelo de datos, Cloud Functions,
  roles, convenciones y roadmap.
- `DOCUMENTATION.md` — reglas de negocio y manuales (Staff, Profesor,
  Socio, Portero).
- `SECURITY_SPEC.md` — invariantes de seguridad, `firestore.rules`,
  casos de ataque.
- `README.md` — comandos de arranque y mapa de docs.

Este directorio (`openspec/`) **no reemplaza** ninguno de esos ficheros:
los complementa con propuestas de cambio versionadas antes de tocar
código.

## Cómo se usa OpenSpec aquí

Cada propuesta funcional que valga la pena discutir por escrito vive en
`openspec/changes/<verbo-corto>/`:

```
openspec/
├── project.md                        # este fichero
├── AGENTS.md                         # instrucciones para asistentes
├── specs/                            # specs base por capability
│   └── <capability>/spec.md
└── changes/
    └── <change-id>/
        ├── proposal.md               # por qué + qué + impacto en docs
        ├── tasks.md                  # checklist ejecutable
        ├── design.md                 # decisiones técnicas (opcional)
        └── specs/
            └── <capability>/spec.md  # delta ADDED / MODIFIED / REMOVED
```

Cuando un cambio se implementa y se mergea a `main`, su delta se
consolida en `openspec/specs/<capability>/spec.md` y el directorio
`changes/<change-id>/` se archiva bajo `openspec/changes/archive/YYYY-MM-DD-<change-id>/`.

## Convenciones específicas del repo

Se aplican **todas** las reglas de `CLAUDE.md`, en particular:

- Idioma: castellano en propuestas, tasks y specs.
- Commits: `tipo(scope): mensaje` (`feat`, `fix`, `docs`, `refactor`,
  `chore`).
- Toda propuesta termina con una sección **"Impacto en docs"** que
  decide explícitamente qué hacer con `SPEC.md`, `DOCUMENTATION.md`,
  `SECURITY_SPEC.md` y `README.md` (aunque la decisión sea "no
  impacta").
- Los deltas de spec usan el vocabulario RFC 2119 (DEBE / DEBERÍA /
  PUEDE / NO DEBE).

## Alcance

OpenSpec **sí** cubre:

- Nuevas funcionalidades visibles al usuario (staff, socio, portero,
  público).
- Cambios en reglas de negocio o de seguridad.
- Cambios de modelo de datos o de contrato entre cliente y Cloud
  Functions.

OpenSpec **no** cubre:

- Bugfixes triviales, refactors internos, dependencias.
- Textos de UI o traducciones EU sin cambio de flujo.
- Ajustes de estilo o accesibilidad puntuales.

Para todo eso basta un commit descriptivo.
