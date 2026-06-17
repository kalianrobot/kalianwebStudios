# DOCUMENTATION.md — KalianBot

Manual de uso y reglas de negocio del asistente IA para gestión de alquileres turísticos.

---

## 1. Qué es KalianBot

Un asistente conversacional por Telegram que automatiza la operativa diaria: facturación, gestión de correo, reviews, cobros, cargos a propietarios y redes sociales. Funciona por texto y por voz.

---

## 2. Agentes y qué puedes pedirles

### 2.1 Contable

**Qué hace**: facturación, cálculo de impuestos, registro de gastos, comparativa de proveedores.

**Ejemplos de uso**:
- "Hazme una factura de 1.200€ a Turismo Vasco SL por gestión de julio"
- "¿Cuánto IVA lleva una factura de limpieza de 500€?"
- "Compara estos dos presupuestos de pintura" (adjuntar PDFs)
- "Exporta los gastos del mes a Excel"

**Flujo de facturación por voz**:
1. Envías un audio: "Factura de mil euros a Hotel Playa por alojamiento"
2. El bot transcribe y extrae: cliente=Hotel Playa, importe=1000€, concepto=alojamiento
3. Calcula: base 1000€ + IVA 21% = 1210€
4. Te muestra el resumen y pregunta "¿Confirmar?"
5. Si confirmas, crea borrador en Holded

**Reglas de impuestos**:
- IVA general: 21%
- IVA reducido (alojamiento turístico): 10%
- IVA superreducido: 4%
- IRPF profesional: 15% (7% primeros 2 años)
- El agente pregunta si tiene dudas sobre el tipo aplicable

### 2.2 Cobros

**Qué hace**: identifica facturas impagadas, redacta reclamaciones.

**Ejemplos**:
- "¿Qué facturas están sin pagar?"
- "Redacta un recordatorio de pago para la factura 2024-045"
- "Envía un seguimiento a todos los que deben más de 30 días"

**Flujo**:
1. Consulta Holded → lista facturas con status `overdue`
2. Redacta email de reclamación (tono profesional, datos de factura)
3. Te muestra el borrador → confirmas → envía por Gmail

### 2.3 Inbox

**Qué hace**: gestiona la bandeja de entrada de Gmail.

**Ejemplos**:
- "Revisa mi bandeja y clasifica los emails de hoy"
- "¿Hay algo urgente en el correo?"
- "Propón una respuesta para el email de Iberdrola"
- "Reenvía el email del fontanero a María"
- "Etiqueta como 'facturas' todos los emails de Holded"

**Categorías de clasificación**: urgente, factura, reserva, propietario, proveedor, spam, otro.

### 2.4 Facturas Recibidas

**Qué hace**: escanea facturas recibidas por email, extrae datos, registra en control de gastos.

**Ejemplos**:
- "Revisa el correo y procesa las facturas nuevas"
- "Extrae los datos de esta factura" (adjuntar PDF)
- "Verifica que las comisiones de Booking de junio cuadran"
- "Mete las facturas de esta semana en el Excel de gastos"

**Flujo automático** (programable):
1. Cada 15 min revisa Gmail buscando adjuntos PDF de facturas
2. Descarga el PDF → extrae datos (emisor, NIF, fecha, base, IVA, total)
3. Registra en tabla de gastos
4. Si hay discrepancias, te notifica por Telegram

### 2.5 Reviews

**Qué hace**: gestiona reviews de Booking y Airbnb.

**Ejemplos**:
- "¿Qué reviews nuevas hay esta semana?"
- "Prepara un informe de reputación del último mes"
- "Redacta respuestas para las reviews pendientes"
- "¿Qué quejas se repiten? Propón mejoras"

**Formato de informe**:
- Puntuación media por propiedad
- Tendencia vs mes anterior
- Top 3 elogios y top 3 quejas
- Propuestas de mejora concretas

### 2.6 Propietarios

**Qué hace**: gestiona cargos y comunicación con propietarios de viviendas.

**Ejemplos**:
- "Mete los cargos del email de consumos en Icnea para el piso de Getxo"
- "¿Qué cargos hay pendientes de registrar?"
- "Envía a los propietarios el resumen de consumos de mayo"

**Flujo de cargos desde email**:
1. Revisa carpeta de Gmail con cargos pendientes
2. Extrae: propietario, vivienda, concepto, importe
3. Te muestra resumen → confirmas → registra en Icnea

### 2.7 Social

**Qué hace**: publicación en redes, seguimiento de leads, campañas.

**Ejemplos**:
- "Publica en Instagram una foto del apartamento nuevo"
- "¿Qué leads hay sin contestar?"
- "Programa una campaña de verano en Facebook"
- "Publica este artículo en el blog"

### 2.8 Ops

**Qué hace**: backups, mantenimiento, RGPD.

**Ejemplos**:
- "Haz backup de los archivos financieros"
- "¿Están todas las integraciones funcionando?"
- "Purga datos de huéspedes de hace más de 3 años"

---

## 3. Confirmación en 2 fases

Toda acción que **modifica datos externos** (crear factura, enviar email, publicar en redes, registrar cargo) requiere confirmación explícita del usuario antes de ejecutarse.

Acciones de **solo lectura** (consultar reviews, listar impagados, clasificar emails) se ejecutan directamente.

El usuario puede responder:
- "Confirmar" / "Sí" / "OK" → ejecuta
- "No" / "Cancelar" → cancela
- Modificación → ajusta y vuelve a preguntar

---

## 4. Tareas programadas

| Tarea | Frecuencia | Agente |
|---|---|---|
| Escaneo de inbox para facturas | Cada 15 min | Facturas Recibidas |
| Facturación diaria Icnea | Diario 9:00 | Contable |
| Backup financiero | Diario 02:00 | Ops |
| Informe de reviews semanal | Lunes 8:00 | Reviews |
| Revisión de impagados | Semanal viernes | Cobros |

---

## 5. Limitaciones conocidas

- **Airbnb no tiene API pública** para property managers. Las reviews y comisiones se obtienen via email.
- **Icnea** depende de la calidad de su API (acceso pendiente). Si la API es limitada, se usará export/import de archivos.
- **WhatsApp Business** requiere aprobación de Meta (proceso lento). Telegram es prioritario.
- **Redes sociales**: LinkedIn requiere app review. Instagram/Facebook via Meta Graph API.
- El bot **nunca finaliza** una factura en Holded — siempre crea borradores para revisión humana.
- El bot **no tiene acceso a cuentas bancarias**. Solo consulta estado de facturas en Holded.
