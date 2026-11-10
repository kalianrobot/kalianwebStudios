import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/firebase', () => ({ functions: {}, db: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import * as cliente from '../../src/lib/reservaInvitado';
import * as servidor from '../../functions/src/helpers';

const titular = { tipo: 'titular', estado: 'pendiente', precio: 15, ingresado: false };
const acomp = (ingresado = false) => ({ tipo: 'acompañante', estado: 'pendiente', precio: 15, ingresado });

describe.each([
  ['cliente (src/lib)', cliente],
  ['servidor (functions/src)', servidor],
])('ajustarSlotsAcompanantes — %s', (_n, m) => {
  it('baja de 2 a 1 acompañante: quita la última plaza pendiente (caso 31/10)', () => {
    const r = m.ajustarSlotsAcompanantes([titular, acomp(), acomp()], 1, 15);
    expect(r).toHaveLength(2);
    expect(r[0]).toBe(titular);
  });

  it('no quita plazas ya ingresadas', () => {
    const r = m.ajustarSlotsAcompanantes([titular, acomp(true), acomp(true)], 0, 15);
    expect(r).toHaveLength(3);
  });

  it('quita las pendientes y conserva las ingresadas', () => {
    const r = m.ajustarSlotsAcompanantes([titular, acomp(true), acomp(), acomp()], 1, 15);
    expect(r.map(s => s.ingresado)).toEqual([false, true]);
  });

  it('sube de 0 a 2: añade plazas pendientes al precio estándar', () => {
    const r = m.ajustarSlotsAcompanantes([titular], 2, 16);
    expect(r).toHaveLength(3);
    expect(r[2]).toEqual({ tipo: 'acompañante', estado: 'pendiente', precio: 16, ingresado: false });
  });

  it('nunca quita al titular', () => {
    expect(m.ajustarSlotsAcompanantes([titular, acomp()], -3, 15)).toEqual([titular]);
  });

  it('reservas sin plazas se devuelven tal cual', () => {
    expect(m.ajustarSlotsAcompanantes([], 2, 15)).toEqual([]);
  });

  it('totalPendienteSlots suma solo lo pendiente y no ingresado', () => {
    expect(m.totalPendienteSlots([titular, acomp(true), { ...acomp(), estado: 'validado_socio', precio: 10 }, acomp()])).toBe(30);
  });
});
