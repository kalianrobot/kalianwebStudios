import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/firebase', () => ({
  functions: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => Promise.resolve({ data: {} }),
}));

import { generarManageToken } from '../../src/lib/reservaInvitado';

describe('generarManageToken', () => {
  it('genera un token de 28 caracteres', () => {
    const token = generarManageToken();
    expect(token).toHaveLength(28);
  });

  it('usa solo caracteres base36 (a-z y 0-9)', () => {
    const token = generarManageToken();
    expect(token).toMatch(/^[a-z0-9]{28}$/);
  });

  it('genera valores distintos en llamadas sucesivas', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generarManageToken()));
    expect(tokens.size).toBe(50);
  });

  it('no es predecible (sin patrones obvios)', () => {
    const a = generarManageToken();
    const b = generarManageToken();
    expect(a).not.toBe(b);
    let coincidencias = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) coincidencias++;
    expect(coincidencias).toBeLessThan(20);
  });
});
