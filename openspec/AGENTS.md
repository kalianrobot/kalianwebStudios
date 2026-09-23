# Instrucciones para asistentes en `openspec/`

## Cuándo crear un cambio OpenSpec

Crea un directorio bajo `openspec/changes/<verbo-corto>/` cuando el
trabajo introduce, altera o retira una **capability** de producto:
una regla de negocio, un flujo de usuario, un contrato entre cliente
y Cloud Function, un invariante de seguridad, o un artefacto operativo
(informe, PDF, export).

No crees cambio para bugfixes triviales, refactors internos, ajustes de
copy o dependencias.

## Estructura mínima de un cambio

```
openspec/changes/<change-id>/
├── proposal.md
├── tasks.md
└── specs/
    └── <capability>/spec.md
```

`design.md` es opcional: añádelo cuando haya decisiones técnicas no
obvias (elección de librería, formato de datos, algoritmo, migración).

## `change-id`

Formato: `<verbo>-<sujeto-corto>` en kebab-case.

Verbos válidos: `add`, `update`, `remove`, `refactor`, `harden`,
`document`.

Ejemplos: `add-informe-cierre-evento`, `update-doi-brevo`,
`harden-firestore-reservas`.

## `proposal.md` — plantilla

```markdown
## ¿Por qué?

<2-4 frases. Problema real, no solución.>

## ¿Qué cambia?

- <bullet 1>
- <bullet 2>

## Impacto

- **Colecciones/reglas afectadas**: <o "ninguna">
- **Cloud Functions afectadas**: <o "ninguna">
- **UI afectada**: <componentes concretos>
- **Riesgos**: <lo que puede romperse>

## Impacto en docs

- `SPEC.md`: <actualizar sección X / no impacta>
- `DOCUMENTATION.md`: <actualizar manual Y / no impacta>
- `SECURITY_SPEC.md`: <actualizar invariante Z / no impacta>
- `README.md`: <actualizar comandos / no impacta>
```

Recordatorio de `CLAUDE.md §3`: la sección "Impacto en docs" es
**obligatoria** y decide explícitamente cada uno de los cuatro
ficheros, incluso cuando la decisión es "no impacta".

## `tasks.md` — plantilla

Checklist en Markdown, agrupada por fase:

```markdown
## 1. Modelo de datos
- [ ] ...

## 2. Cloud Functions
- [ ] ...

## 3. UI
- [ ] ...

## 4. Reglas Firestore
- [ ] ...

## 5. Tests
- [ ] ...

## 6. Docs
- [ ] ...
```

Marca cada task en cuanto se completa; no las agrupes al final.

## Deltas de spec

Un fichero `changes/<change-id>/specs/<capability>/spec.md` es un
**delta** contra la spec base (`openspec/specs/<capability>/spec.md`).

Estructura:

```markdown
## ADDED Requirements

### Requirement: <Nombre corto>
El sistema DEBE ...

#### Scenario: <Nombre>
- **WHEN** <precondición>
- **THEN** <resultado observable>

## MODIFIED Requirements

### Requirement: <Nombre existente>
<Redacción nueva, completa>

#### Scenario: <Nombre>
- **WHEN** ...
- **THEN** ...

## REMOVED Requirements

### Requirement: <Nombre existente>
**Razón**: <por qué se retira>
**Migración**: <qué hacer con datos/UI existentes>
```

Reglas:

- Cada `Requirement` debe tener **al menos un** `Scenario`.
- El texto del requirement usa RFC 2119: DEBE, DEBERÍA, PUEDE, NO DEBE.
- Los escenarios son verificables: precondición observable → resultado
  observable. Nada de "el sistema es rápido".
- Los deltas **nunca** se editan tras mergear; si algo cambia, se abre
  otro cambio.

## Archivado

Cuando el cambio se implementa, se mergea a `main` y se despliega:

1. Copia el delta a `openspec/specs/<capability>/spec.md`
   (creando la spec base si no existía, aplicando ADDED / MODIFIED /
   REMOVED).
2. Mueve `openspec/changes/<change-id>/` a
   `openspec/changes/archive/YYYY-MM-DD-<change-id>/`.
3. Deja el `proposal.md`, `tasks.md` y `design.md` intactos en el
   archivo — son historia.

## Qué NO hacer

- No inventes IDs de commit ni fechas futuras en propuestas.
- No pongas ejemplos de código completos en la spec: la spec dice
  **qué**, el código dice **cómo**.
- No incluyas emojis en specs, propuestas ni tasks.
- No mezcles varios cambios funcionales en un mismo `change-id`.
