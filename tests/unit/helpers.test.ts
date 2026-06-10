import { describe, it, expect, vi } from 'vitest';
import { escapeHtml, maskEmail, withRetry, safeJson } from '../../functions/src/helpers';

describe('escapeHtml', () => {
  it('escapa las cinco entidades HTML peligrosas', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapa ampersand antes que el resto para evitar doble escape', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('escapa comillas simples', () => {
    expect(escapeHtml("d'Artagnan")).toBe('d&#39;Artagnan');
  });

  it('devuelve string vacío para null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('convierte valores no-string a string antes de escapar', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(true)).toBe('true');
  });
});

describe('maskEmail', () => {
  it('conserva los 2 primeros caracteres y el dominio', () => {
    expect(maskEmail('kalianrobot@gmail.com')).toBe('ka***@gmail.com');
  });

  it('funciona con email corto de 2 caracteres en el local', () => {
    expect(maskEmail('ab@x.com')).toBe('ab***@x.com');
  });

  it('devuelve *** si no es un email', () => {
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('')).toBe('***');
    expect(maskEmail(null)).toBe('***');
    expect(maskEmail(123)).toBe('***');
  });

  it('devuelve *** si hay @ pero falta local o dominio', () => {
    expect(maskEmail('@gmail.com')).toBe('***');
    expect(maskEmail('user@')).toBe('***');
  });
});

describe('withRetry', () => {
  it('devuelve el valor al primer intento si la función resuelve', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reintenta hasta maxAttempts y propaga el último error', async () => {
    const err = new Error('boom');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, 3, 0)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('resuelve si un intento intermedio tiene éxito', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('aplica backoff exponencial (2s, 4s) con baseDelayMs=2000', async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, 3, 2000);

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe('safeJson', () => {
  const mockResponse = (contentType: string, body: string): Response => ({
    headers: { get: (h: string) => h.toLowerCase() === 'content-type' ? contentType : null },
    text: async () => body,
  } as unknown as Response);

  it('parsea JSON cuando Content-Type es application/json', async () => {
    const res = mockResponse('application/json', '{"ok":true}');
    expect(await safeJson(res)).toEqual({ ok: true });
  });

  it('parsea aunque el Content-Type incluya charset', async () => {
    const res = mockResponse('application/json; charset=utf-8', '{"x":1}');
    expect(await safeJson(res)).toEqual({ x: 1 });
  });

  it('devuelve {} si Content-Type no es JSON', async () => {
    const res = mockResponse('text/html', '<html>error</html>');
    expect(await safeJson(res)).toEqual({});
  });

  it('devuelve {} si JSON está mal formado', async () => {
    const res = mockResponse('application/json', 'not json');
    expect(await safeJson(res)).toEqual({});
  });

  it('devuelve {} si falta Content-Type', async () => {
    const res = {
      headers: { get: () => null },
      text: async () => '{"x":1}',
    } as unknown as Response;
    expect(await safeJson(res)).toEqual({});
  });
});
