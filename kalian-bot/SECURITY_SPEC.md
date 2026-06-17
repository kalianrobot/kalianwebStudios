# SECURITY_SPEC.md — KalianBot

Especificación de seguridad del asistente IA.

---

## 1. Control de acceso

### 1.1 Whitelist de usuarios Telegram

Solo los user IDs en `TELEGRAM_ALLOWED_USERS` pueden interactuar con el bot. Cualquier mensaje de un usuario no autorizado se ignora silenciosamente (sin respuesta, sin log del contenido).

### 1.2 Confirmación en 2 fases

| Tipo de operación | Confirmación |
|---|---|
| Lectura (consultar, listar, clasificar) | No |
| Escritura en sistema externo (facturar, enviar email, publicar) | Si |
| Borrado o purga de datos | Si + doble confirmación |
| Operaciones programadas | Configuración requiere confirmación; ejecución automática |

### 1.3 Scope de agentes

Cada agente solo puede usar los skills y MCP servers que tiene asignados en SPEC.md §3.2. El orquestador no puede ejecutar skills directamente — siempre delega a un agente.

---

## 2. Gestión de secretos

### 2.1 Almacenamiento

- Todos los API keys y tokens en variables de entorno del servicio (Cloud Run secrets o equivalente).
- Nunca en código, nunca en logs, nunca en mensajes al usuario.
- Gmail OAuth2 refresh tokens cifrados en base de datos (AES-256-GCM).

### 2.2 Rotación

- API keys: cada 90 días.
- OAuth refresh tokens: renovación automática; revocación manual si se sospecha compromiso.
- Telegram bot token: rotar si se sospecha compromiso.

### 2.3 Principio de mínimo privilegio

- Gmail: scope `gmail.readonly` + `gmail.send` + `gmail.modify` (no `gmail.full`).
- Holded: solo endpoints de contactos, facturas y gastos.
- Cada MCP server solo tiene acceso a la API que necesita.

---

## 3. RGPD

### 3.1 Datos personales tratados

| Dato | Origen | Retención |
|---|---|---|
| Nombre/email/NIF de clientes | Holded, Icnea | 3 años tras última factura (obligación fiscal) |
| Nombre de reviewer | Booking, Airbnb | Mientras la review exista en la plataforma |
| Audio de mensajes de voz | Telegram/WhatsApp | Se transcribe y borra en ≤24h |
| Historial de conversación | Telegram | 90 días, luego se anonimiza |
| Email y adjuntos procesados | Gmail | Solo metadatos en DB; archivos en GCS con retención de 1 año |

### 3.2 Derechos del interesado

- **Derecho de acceso**: skill `gdpr_export_data` — exporta todos los datos de un cliente.
- **Derecho de supresión**: skill `purgar_datos_rgpd` — purga datos personales de la DB, marca en Holded/Icnea. Requiere doble confirmación.
- **Portabilidad**: export en JSON/CSV via `gdpr_export_data`.

### 3.3 Base legal

- Ejecución de contrato (facturación, gestión de reservas).
- Interés legítimo (cobros, reviews).
- Obligación legal (retención fiscal 3 años).

---

## 4. Integridad de datos financieros

### 4.1 Facturas

- Toda factura generada se crea como **borrador** en Holded. Nunca se finaliza automáticamente.
- El hash SHA-256 del borrador se almacena en `audit_log`.
- El usuario debe confirmar antes de crear el borrador.

### 4.2 Audit log

- Toda acción del bot queda registrada: agente, skill, inputs (resumen), outputs (resumen), éxito/error, timestamp.
- El audit log es append-only. No se puede modificar ni borrar (excepto purga RGPD de PII).
- Retención: 5 años (requisito fiscal).

---

## 5. Seguridad de la infraestructura

### 5.1 Contenedor

- Imagen Docker basada en `node:22-slim` (superficie mínima).
- Usuario no-root dentro del contenedor.
- Sin acceso SSH.

### 5.2 Red

- Solo puertos necesarios expuestos (webhook HTTPS para Telegram).
- Base de datos accesible solo desde el contenedor (VPC o Supabase connection pooler).
- Redis accesible solo desde el contenedor.

### 5.3 CI/CD

- Secrets de deploy en GitHub Actions secrets (no en el repo).
- Build y push de imagen Docker automatizado.
- No se despliega a producción sin tests verdes.

---

## 6. Amenazas y mitigaciones

| Amenaza | Mitigación |
|---|---|
| Prompt injection via Telegram | Whitelist de usuarios + system prompt robusto + no ejecutar código arbitrario |
| API key filtrada en logs | Sanitización de logs: nunca loguear valores de env vars |
| Factura fraudulenta | Confirmación 2 fases + solo borradores + audit log |
| Acceso no autorizado al bot | Whitelist de Telegram user IDs |
| Pérdida de datos | Backups diarios automáticos a GCS |
| OAuth token comprometido | Scopes mínimos + rotación + revocación remota |
| Datos personales en conversación | Retención 90 días + anonimización automática |
