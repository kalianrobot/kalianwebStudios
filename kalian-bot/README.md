# KalianBot

Asistente IA para gestión de alquileres turísticos. Bot de Telegram respaldado por Claude API con integración a Icnea (PMS), Holded (ERP), Booking.com, Airbnb y Gmail.

---

## Documentación

| Documento | Contenido |
|---|---|
| [SPEC.md](SPEC.md) | Arquitectura, stack, agentes, skills, MCP servers, modelo de datos |
| [DOCUMENTATION.md](DOCUMENTATION.md) | Manual de uso, reglas de negocio, ejemplos por agente |
| [SECURITY_SPEC.md](SECURITY_SPEC.md) | Seguridad, RGPD, gestión de secretos, amenazas |
| [CLAUDE.md](CLAUDE.md) | Reglas operativas para Claude Code |

---

## Setup

### Requisitos

- Node.js 22+
- Docker + Docker Compose (para Redis)
- PostgreSQL (local o Supabase)
- API keys: Anthropic, Telegram Bot, OpenAI (Whisper), Holded

### Instalación

```bash
git clone <repo-url>
cd kalian-bot
npm install
cp .env.example .env   # configurar variables
```

### Variables de entorno

Ver `SPEC.md §8` para la lista completa. Las mínimas para arrancar:

```env
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USERS=
OPENAI_API_KEY=
DATABASE_URL=
REDIS_URL=
```

### Desarrollo

```bash
# Arrancar Redis
docker compose up -d redis

# Bot en modo desarrollo
npm run dev

# Tests
npm run test

# Type-check
npm run typecheck

# Lint
npm run lint
```

### Build y deploy

```bash
npm run build
docker compose up -d
```

---

## Estructura

```
packages/
├── core/          Orquestador + Telegram + scheduler
├── mcp-holded/    MCP server para Holded ERP
├── mcp-icnea/     MCP server para Icnea PMS
├── mcp-gmail/     MCP server para Gmail
├── mcp-pdf/       MCP server para extracción de PDFs
├── mcp-booking/   MCP server para Booking.com
├── mcp-social/    MCP server para redes sociales
└── shared/        Tipos compartidos y utilidades
```
