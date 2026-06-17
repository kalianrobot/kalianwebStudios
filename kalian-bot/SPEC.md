# SPEC.md — KalianBot

Especificación técnica del asistente IA para gestión de alquileres turísticos.

---

## 1. Visión general

KalianBot es un asistente conversacional (Telegram) respaldado por Claude API que automatiza la operativa de una empresa de alquileres turísticos. Sustituye dos roles: administrativo/financiero y front desk.

**Sistemas externos**: Icnea (PMS), Holded (ERP), Booking.com, Airbnb, Gmail.

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22 + TypeScript |
| Estructura | Monorepo (npm workspaces) |
| IA | Claude API (Anthropic SDK) con tool use |
| Interfaz principal | Telegram Bot (grammY) |
| Interfaz secundaria | WhatsApp Business API (fase tardía) |
| Speech-to-text | OpenAI Whisper API |
| Base de datos | PostgreSQL (Supabase) |
| Cola de tareas | BullMQ + Redis |
| PDF/OCR | pdf-parse + Claude Vision |
| Almacenamiento | Google Cloud Storage |
| Deploy | Docker en Cloud Run (europe-west1) |
| CI/CD | GitHub Actions |

---

## 3. Arquitectura: Orquestador → Agentes → Skills → MCP Servers

### 3.1 Principio

El sistema tiene cuatro capas:

1. **Orquestador** — un agente Claude que clasifica la intención del usuario y delega al agente especializado correcto.
2. **Agentes** — cada uno con system prompt propio, dominio acotado y lista de skills autorizados.
3. **Skills** — funciones atómicas reutilizables. Un skill = una acción concreta con inputs/outputs tipados.
4. **MCP Servers** — adaptadores que conectan skills con APIs externas.

### 3.2 Agentes

| ID | Nombre | Dominio | Skills |
|---|---|---|---|
| `contable` | Contable | Facturación, impuestos, contabilidad | `crear_factura`, `calcular_impuestos`, `registrar_gasto`, `exportar_excel`, `comparar_proveedores` |
| `cobros` | Cobros | Seguimiento de pagos | `listar_impagados`, `redactar_reclamacion`, `enviar_email` |
| `inbox` | Inbox | Gestión de correo | `clasificar_email`, `etiquetar_email`, `proponer_respuesta`, `reenviar_email`, `descargar_adjunto` |
| `facturas_recibidas` | Facturas Recibidas | Escaneo/registro de facturas | `extraer_pdf`, `ocr_factura`, `registrar_gasto`, `verificar_comision` |
| `reviews` | Reviews | Reputación online | `consultar_reviews`, `generar_informe_reviews`, `redactar_respuesta_review`, `proponer_mejora` |
| `propietarios` | Propietarios | Cargos y comunicación | `listar_cargos`, `registrar_cargo_icnea`, `notificar_propietario` |
| `social` | Social | Redes sociales, leads, blog | `publicar_post`, `programar_campana`, `seguimiento_lead`, `publicar_blog` |
| `ops` | Ops | Backups, mantenimiento, RGPD | `backup_financiero`, `purgar_datos_rgpd`, `health_check` |

### 3.3 Definición de agente (estructura)

Cada agente se define en `packages/core/src/agents/<id>.ts` con:

```typescript
interface AgentDefinition {
  id: string;
  name: string;
  systemPrompt: string;       // personalidad, dominio, límites
  skills: string[];            // IDs de skills autorizados
  mcpServers: string[];        // MCP servers que puede usar
  confirmationPolicy: 'always' | 'writes_only' | 'never';
}
```

### 3.4 Skills (catálogo)

Cada skill se define en `packages/core/src/skills/<nombre>.ts`:

```typescript
interface SkillDefinition {
  id: string;
  description: string;
  agents: string[];            // agentes que lo pueden usar
  mcpServer: string;           // MCP server subyacente
  inputs: Record<string, SchemaField>;
  outputs: Record<string, SchemaField>;
  requiresConfirmation: boolean;
}
```

#### Skills de facturación
| Skill | MCP Server | Confirmación | Descripción |
|---|---|---|---|
| `crear_factura` | mcp-holded | Si | Crea factura borrador en Holded |
| `calcular_impuestos` | (interno) | No | Calcula IVA/IRPF según tipo de operación |
| `registrar_gasto` | mcp-holded | Si | Registra un gasto/factura recibida en Holded |
| `exportar_excel` | (interno) | No | Genera Excel con datos estructurados |
| `comparar_proveedores` | mcp-pdf | No | Analiza PDFs de proveedores y genera comparativa |

#### Skills de correo
| Skill | MCP Server | Confirmación | Descripción |
|---|---|---|---|
| `clasificar_email` | mcp-gmail | No | Clasifica un email por categoría/urgencia |
| `etiquetar_email` | mcp-gmail | No | Aplica etiquetas a emails |
| `proponer_respuesta` | mcp-gmail | Si | Genera borrador de respuesta |
| `reenviar_email` | mcp-gmail | Si | Reenvía email a destinatario |
| `enviar_email` | mcp-gmail | Si | Envía email nuevo |
| `descargar_adjunto` | mcp-gmail | No | Descarga adjuntos de un email |

#### Skills de PDF
| Skill | MCP Server | Confirmación | Descripción |
|---|---|---|---|
| `extraer_pdf` | mcp-pdf | No | Extrae datos estructurados de PDF de factura |
| `ocr_factura` | mcp-pdf | No | OCR + extracción de factura escaneada |

#### Skills de PMS
| Skill | MCP Server | Confirmación | Descripción |
|---|---|---|---|
| `consultar_reservas` | mcp-icnea | No | Lista reservas con filtros |
| `registrar_cargo_icnea` | mcp-icnea | Si | Registra cargo a propietario en Icnea |
| `generar_tabla_mensual` | mcp-icnea | No | Genera tabla resumen mensual |

#### Skills de reviews
| Skill | MCP Server | Confirmación | Descripción |
|---|---|---|---|
| `consultar_reviews` | mcp-booking | No | Obtiene reviews de Booking/Airbnb |
| `generar_informe_reviews` | (interno) | No | Genera informe de reputación |
| `redactar_respuesta_review` | (interno) | Si | Redacta respuesta a review |
| `proponer_mejora` | (interno) | No | Propone mejoras basado en reviews |

#### Skills de cobros
| Skill | MCP Server | Confirmación | Descripción |
|---|---|---|---|
| `listar_impagados` | mcp-holded | No | Lista facturas impagadas |
| `redactar_reclamacion` | (interno) | Si | Redacta email de reclamación de pago |

#### Skills de social
| Skill | MCP Server | Confirmación | Descripción |
|---|---|---|---|
| `publicar_post` | mcp-social | Si | Publica en red social |
| `programar_campana` | mcp-social | Si | Programa campaña en redes |
| `seguimiento_lead` | (interno) | No | Actualiza estado de lead |
| `publicar_blog` | mcp-social | Si | Publica en blog/web |

#### Skills de ops
| Skill | MCP Server | Confirmación | Descripción |
|---|---|---|---|
| `backup_financiero` | (interno) | No | Backup de archivos financieros a GCS |
| `purgar_datos_rgpd` | (interno) | Si | Purga datos personales según RGPD |
| `health_check` | (interno) | No | Verifica estado de integraciones |

---

## 4. MCP Servers

Cada MCP server es un paquete independiente en `packages/mcp-<nombre>/`.

| MCP Server | API externa | Transporte | Tools expuestos |
|---|---|---|---|
| `mcp-holded` | Holded REST API | stdio | `holded_create_contact`, `holded_create_invoice`, `holded_list_invoices`, `holded_create_expense`, `holded_get_accounts` |
| `mcp-icnea` | Icnea REST API | stdio | `icnea_list_reservations`, `icnea_create_invoice`, `icnea_get_property`, `icnea_list_owners`, `icnea_post_charge` |
| `mcp-gmail` | Gmail API (OAuth2) | stdio | `gmail_search`, `gmail_read`, `gmail_send`, `gmail_label`, `gmail_download_attachment` |
| `mcp-pdf` | pdf-parse + Claude Vision | stdio | `pdf_extract_text`, `pdf_extract_invoice`, `pdf_ocr` |
| `mcp-booking` | Booking Partner API | stdio | `booking_get_reviews`, `booking_get_commissions`, `booking_list_reservations` |
| `mcp-social` | Meta Graph API + LinkedIn API | stdio | `social_post`, `social_schedule`, `social_get_leads` |

---

## 5. Modelo de datos

### conversations
```
id: uuid PK
user_id: string              -- Telegram user ID
channel: 'telegram' | 'whatsapp'
messages: jsonb[]            -- {role, content, timestamp, tool_calls?}
agent_id: string | null      -- último agente usado
created_at: timestamptz
updated_at: timestamptz
```

### invoices
```
id: uuid PK
type: 'emitted' | 'received'
source: 'voice' | 'scan' | 'icnea' | 'booking' | 'airbnb' | 'manual'
client_id: uuid FK → clients
description: text
base_amount: numeric(10,2)
tax_type: 'iva_21' | 'iva_10' | 'iva_4' | 'exento'
tax_amount: numeric(10,2)
irpf_rate: numeric(4,2) | null
irpf_amount: numeric(10,2) | null
total: numeric(10,2)
status: 'draft' | 'posted' | 'paid' | 'overdue'
holded_id: string | null
icnea_id: string | null
pdf_url: string | null
created_at: timestamptz
due_date: date | null
```

### clients
```
id: uuid PK
name: string
nif: string | null
email: string | null
phone: string | null
holded_id: string | null
type: 'guest' | 'owner' | 'supplier'
created_at: timestamptz
```

### properties
```
id: uuid PK
name: string
icnea_id: string
owner_id: uuid FK → clients
address: text
channel_ids: jsonb           -- {booking_id, airbnb_id}
created_at: timestamptz
```

### reviews
```
id: uuid PK
source: 'booking' | 'airbnb'
property_id: uuid FK → properties
rating: numeric(2,1)
text: text
reviewer_name: string
date: date
response: text | null
response_status: 'pending' | 'drafted' | 'sent'
created_at: timestamptz
```

### expenses
```
id: uuid PK
supplier_id: uuid FK → clients | null
amount: numeric(10,2)
category: string
pdf_url: string | null
extracted_data: jsonb        -- datos extraídos del PDF
holded_id: string | null
status: 'pending' | 'registered' | 'verified'
source_email_id: string | null
created_at: timestamptz
```

### owner_charges
```
id: uuid PK
owner_id: uuid FK → clients
property_id: uuid FK → properties
description: text
amount: numeric(10,2)
icnea_posted: boolean
source_email_id: string | null
created_at: timestamptz
```

### scheduled_jobs
```
id: uuid PK
type: string                 -- 'daily_invoicing', 'inbox_scan', 'backup', etc.
cron_expression: string
last_run: timestamptz | null
next_run: timestamptz
status: 'active' | 'paused' | 'failed'
config: jsonb
```

### leads
```
id: uuid PK
source: 'linkedin' | 'instagram' | 'facebook' | 'web' | 'email'
name: string
email: string | null
phone: string | null
property_interest: uuid FK → properties | null
status: 'new' | 'contacted' | 'qualified' | 'lost' | 'converted'
follow_ups: jsonb[]         -- {date, action, notes}
created_at: timestamptz
```

### audit_log
```
id: uuid PK
user_id: string
agent_id: string
skill_id: string
action: string
input_summary: text
output_summary: text
success: boolean
error: text | null
timestamp: timestamptz
```

---

## 6. Flujo de orquestación

```
1. Usuario envía mensaje (texto o audio) via Telegram
2. Gateway: si audio → Whisper STT → texto
3. Orquestador recibe texto + historial de conversación
4. Claude (orquestador) clasifica intención → selecciona agente
5. Agente recibe contexto + ejecuta skills necesarios
6. Si skill requiere confirmación → pregunta al usuario
7. Usuario confirma → skill ejecuta via MCP server
8. Resultado se devuelve al usuario via Telegram
9. Todo queda en audit_log
```

---

## 7. Convenciones de código

- TypeScript estricto (`strict: true`)
- ESM modules
- Nombres de archivos: kebab-case
- Nombres de skills: snake_case
- Nombres de agentes: camelCase en código, snake_case como ID
- Commits: `tipo(scope): mensaje` (feat, fix, docs, refactor, chore)
- Tests: vitest, colocados junto al código (`*.test.ts`)
- Linting: eslint + prettier

---

## 8. Variables de entorno

```env
# Claude
ANTHROPIC_API_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USERS=      # comma-separated user IDs

# Whisper
OPENAI_API_KEY=               # para Whisper STT

# Holded
HOLDED_API_KEY=

# Icnea
ICNEA_API_URL=
ICNEA_API_KEY=

# Gmail
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=

# Booking
BOOKING_PARTNER_ID=
BOOKING_API_KEY=

# Social
META_ACCESS_TOKEN=
LINKEDIN_ACCESS_TOKEN=

# Database
DATABASE_URL=                 # PostgreSQL connection string

# Redis
REDIS_URL=

# Storage
GCS_BUCKET=
GCS_KEY_FILE=
```

---

## 9. Roadmap

Ver sección de Roadmap en el plan (`/root/.claude/plans/`). Fases 0-7, ~20 semanas total.
