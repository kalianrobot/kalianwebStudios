/**
 * Plazas (`slots`) de una reserva. Módulo puro (sin Firebase): lo usan
 * `reservaInvitado.ts` (que lo re-exporta), `puerta.ts` y los scripts de QA.
 */

/**
 * Ajusta las plazas (`slots`) de una reserva a `1 + acompañantes`.
 * Conserva el titular y las plazas ya ingresadas; quita plazas de acompañante
 * pendientes desde el final o añade nuevas a `precioBase`. Antes, cambiar los
 * acompañantes solo tocaba `numPersonas` y la puerta seguía mostrando las plazas
 * antiguas. Hay copia equivalente en functions/src/helpers.ts;
 * tests/unit/ajustarSlots.test.ts prueba las dos.
 */
export function ajustarSlotsAcompanantes(slots: any[], acompañantes: number, precioBase: number): any[] {
  if (!Array.isArray(slots) || slots.length === 0) return slots;
  const objetivo = 1 + Math.max(0, Math.floor(acompañantes));
  const resultado = [...slots];
  for (let i = resultado.length - 1; resultado.length > objetivo && i >= 1; i--) {
    if (!resultado[i]?.ingresado) resultado.splice(i, 1);
  }
  while (resultado.length < objetivo) {
    resultado.push({ tipo: 'acompañante', estado: 'pendiente', precio: precioBase, ingresado: false });
  }
  return resultado;
}

/** Importe pendiente de cobro en puerta: plazas pendientes aún no ingresadas. */
export function totalPendienteSlots(slots: any[]): number {
  return (slots || []).reduce((acc, s) => acc + (!s?.ingresado && s?.estado === 'pendiente' ? Number(s?.precio) || 0 : 0), 0);
}
