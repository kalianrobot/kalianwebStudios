/**
 * Regla de descuento de socio en eventos. Hay una copia equivalente en
 * functions/src/descuentoSocio.ts (las Functions no importan de src/); los
 * tests de tests/unit/descuentoSocio.test.ts comprueban las dos.
 */

/** Valor de `academias_descuento` que representa a los socios con local de ensayo. */
export const ACADEMIA_LOCAL = 'local';

const normalizar = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Claves antiguas de membresía, anteriores a clasificar los cursos por academia. */
const ALIAS_MEMBRESIA: Record<string, string[]> = {
  musica: ['music is cool'],
  danza: ['sbk club', 'club de baile'],
};

/**
 * Academias con descuento en el evento. Si el evento no tiene
 * `academias_descuento` (creado antes de esta regla), se deduce de `categoria`.
 */
export function academiasDescuentoDeEvento(evento: any): string[] {
  if (Array.isArray(evento?.academias_descuento)) return evento.academias_descuento.map(String);
  if (evento?.categoria === 'musica') return ['Music is Cool', ACADEMIA_LOCAL];
  if (evento?.categoria === 'danza') return ['SBK CLUB', 'Club de Baile', ACADEMIA_LOCAL];
  return [];
}

/**
 * True si alguna membresía en vigor del socio (fecha >= hoy, 'YYYY-MM-DD')
 * corresponde a una academia con descuento en el evento.
 */
export function tieneDescuentoSocio(membresias: Record<string, unknown> | null | undefined, evento: any, hoy: string): boolean {
  const permitidas = new Set(academiasDescuentoDeEvento(evento).map(normalizar));
  if (permitidas.size === 0 || !membresias) return false;
  return Object.entries(membresias).some(([clave, fecha]) => {
    if (typeof fecha !== 'string' || fecha < hoy) return false;
    const k = normalizar(clave);
    return permitidas.has(k) || (ALIAS_MEMBRESIA[k] || []).some(a => permitidas.has(a));
  });
}
