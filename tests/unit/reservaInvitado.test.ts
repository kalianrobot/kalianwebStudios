import { describe, it, expect, vi } from 'vitest';

const mockCallable = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: { ok: true } })));

vi.mock('../../src/firebase', () => ({
  functions: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => mockCallable),
}));

import {
  generarManageToken,
  consultarReserva,
  cancelarReservaInvitado,
  editarAcompanantesInvitado,
  calcularPrecioReserva,
} from '../../src/lib/reservaInvitado';

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

describe('callables de gestión de reserva', () => {
  it('consultarReserva llama con accion consultar', async () => {
    mockCallable.mockResolvedValueOnce({ data: { ok: true, reserva: {} } } as any);
    const res = await consultarReserva('tok123');
    expect(mockCallable).toHaveBeenCalledWith({ manageToken: 'tok123', accion: 'consultar' });
    expect(res).toEqual({ ok: true, reserva: {} });
  });

  it('cancelarReservaInvitado llama con accion cancelar', async () => {
    mockCallable.mockResolvedValueOnce({ data: { ok: true, cancelada: true } } as any);
    const res = await cancelarReservaInvitado('tok456');
    expect(mockCallable).toHaveBeenCalledWith({ manageToken: 'tok456', accion: 'cancelar' });
    expect(res).toEqual({ ok: true, cancelada: true });
  });

  it('editarAcompanantesInvitado pasa nuevoAcompanantes', async () => {
    mockCallable.mockResolvedValueOnce({ data: { ok: true } });
    await editarAcompanantesInvitado('tok789', 3);
    expect(mockCallable).toHaveBeenCalledWith({ manageToken: 'tok789', accion: 'editar', nuevoAcompanantes: 3 });
  });

  it('calcularPrecioReserva devuelve total y flags', async () => {
    mockCallable.mockResolvedValueOnce({ data: { total: 25, esSocio: true, esClave: false } } as any);
    const res = await calcularPrecioReserva({ eventoId: 'E1', esCurso: false, numAcompañantes: 1 });
    expect(res).toEqual({ total: 25, esSocio: true, esClave: false });
  });
});
