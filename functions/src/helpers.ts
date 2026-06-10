// Helpers puros sin dependencias de Firebase. Extraídos para poder testearse
// como unit tests sin cargar firebase-admin ni firebase-functions.

// Parsea la respuesta como JSON solo si el Content-Type lo confirma; en otro caso
// devuelve un objeto vacío. Evita "Unexpected token" cuando un upstream manda HTML/texto
// en errores de gateway o mantenimiento.
export async function safeJson(res: Response): Promise<any> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) return {};
  try { return JSON.parse(await res.text()); } catch { return {}; }
}

// Escape HTML para evitar inyección (CSS/HTML/phishing) en plantillas de email
// cuando se interpolan datos controlados por el usuario (nombre, título, etc.).
export function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Enmascara un email para logs: conserva los 2 primeros caracteres del local
// y el dominio (útil para debug), oculta el resto (RGPD: minimizar PII en logs).
export function maskEmail(email: unknown): string {
  if (typeof email !== 'string' || !email.includes('@')) return '***';
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  return `${user.slice(0, 2)}***@${domain}`;
}

// Reintenta una operación asíncrona con backoff exponencial.
export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 2000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, baseDelayMs * (2 ** (attempt - 1))));
    }
  }
  throw lastErr;
}
