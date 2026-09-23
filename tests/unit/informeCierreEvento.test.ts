import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state, FakeTimestamp } = vi.hoisted(() => {
  class FakeTimestamp {
    ms: number;
    constructor(ms: number) {
      this.ms = ms;
    }
    toDate() {
      return new Date(this.ms);
    }
  }
  return {
    FakeTimestamp,
    state: {
      evento: null as any,
      asistencia: [] as any[],
      reservas: [] as any[],
      finanzas: [] as any[],
    },
  };
});

vi.mock('../../src/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  Timestamp: FakeTimestamp,
  collection: vi.fn((_db: unknown, name: string) => ({ __col: name })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  query: vi.fn((colRef: any, ...wheres: any[]) => ({ __col: colRef.__col, wheres })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ __col: col, id })),
  getDoc: vi.fn(async (ref: any) => {
    if (ref.__col === 'eventos' && state.evento && ref.id === state.evento.id) {
      return { exists: () => true, id: state.evento.id, data: () => state.evento.data };
    }
    return { exists: () => false, data: () => undefined };
  }),
  getDocs: vi.fn(async (q: any) => {
    const source = q.__col === 'asistencia_eventos' ? state.asistencia
      : q.__col === 'reservas' ? state.reservas
      : q.__col === 'finanzas' ? state.finanzas
      : [];
    return { docs: source.map(d => ({ id: d.id, data: () => d.data })) };
  }),
}));

import { construirCierreEvento } from '../../src/lib/informeCierreEvento';

const fecha = (isoMs: number) => new FakeTimestamp(isoMs);

beforeEach(() => {
  vi.clearAllMocks();
  state.evento = { id: 'evt-1', data: { titulo: 'Jazz Night', fecha: '2026-09-19T21:00', precio_estandar: 16, aforo_maximo: 50, aforo_actual: 40 } };
  state.asistencia = [];
  state.reservas = [];
  state.finanzas = [];
});

describe('construirCierreEvento', () => {
  it('lanza si el evento no existe', async () => {
    state.evento = null;
    await expect(construirCierreEvento('evt-x')).rejects.toThrow('Evento no encontrado');
  });

  it('separa entradas QR (reserva/reserva_socio/socio_carnet) de walk-in', async () => {
    state.asistencia = [
      { id: 'a1', data: { eventoId: 'evt-1', tipo: 'reserva', precio: 16, slotNombre: 'Ana', slotDni: '111', fecha: fecha(1) } },
      { id: 'a2', data: { eventoId: 'evt-1', tipo: 'reserva_socio', precio: 12, slotNombre: 'Luis', fecha: fecha(2) } },
      { id: 'a3', data: { eventoId: 'evt-1', tipo: 'socio_carnet', precio: 5, nombre: 'Eva', socioId: '222', fecha: fecha(3) } },
      { id: 'a4', data: { eventoId: 'evt-1', tipo: 'walk-in', precio: 16, nombre: 'Marcos', fecha: fecha(4) } },
    ];

    const cierre = await construirCierreEvento('evt-1');

    expect(cierre.entradasQR).toHaveLength(3);
    expect(cierre.entradasQR.map(e => e.tipo)).toEqual(['reserva', 'reserva_socio', 'socio_carnet']);
    expect(cierre.entradasWalkIn).toHaveLength(1);
    expect(cierre.entradasWalkIn[0].nombre).toBe('Marcos');
  });

  it('lista las reservas no presentadas sin agrupar por reserva, con canal y estimado', async () => {
    state.reservas = [
      {
        id: 'r1',
        data: {
          eventoId: 'evt-1',
          nombreTitular: 'Jose',
          dniTitular: '333',
          slots: [
            { tipo: 'titular', ingresado: true, precio: 16 },
            { tipo: 'acompañante', ingresado: false, precio: 16 },
            { tipo: 'acompañante', ingresado: false, estado: 'validado_socio', socio_nombre: 'Rita', socio_id: '444' },
          ],
        },
      },
    ];

    const cierre = await construirCierreEvento('evt-1');

    expect(cierre.reservasNoShow).toHaveLength(2);
    const [noShow1, noShow2] = cierre.reservasNoShow;
    expect(noShow1).toMatchObject({ slotIdx: 1, nombre: 'Acompañante 1', canal: 'invitado', precio: 16, estimado: false });
    expect(noShow2).toMatchObject({ slotIdx: 2, nombre: 'Rita', canal: 'socio', estimado: true, precio: 16 }); // sin precio → fallback a precio_estandar
  });

  it('excluye reservas canceladas/anuladas del cálculo de no-shows', async () => {
    state.reservas = [
      { id: 'r-cancelada', data: { eventoId: 'evt-1', estado: 'cancelada', slots: [{ tipo: 'titular', ingresado: false, precio: 16 }] } },
    ];

    const cierre = await construirCierreEvento('evt-1');

    expect(cierre.reservasNoShow).toHaveLength(0);
  });

  it('filtra finanzas por categoria Evento y excluye soft-deleted', async () => {
    state.finanzas = [
      { id: 'f1', data: { eventoId: 'evt-1', categoria: 'Evento', monto: 5, monto_bruto: 16, monto_artista: 11, variante_precio: 'estandar', metodo: 'Efectivo', fecha: fecha(10) } },
      { id: 'f2', data: { eventoId: 'evt-1', categoria: 'Socio', monto: 15, metodo: 'Efectivo', fecha: fecha(11) } },
      { id: 'f3', data: { eventoId: 'evt-1', categoria: 'Evento', monto: 5, metodo: 'Tarjeta', fecha: fecha(12), deletedAt: fecha(13) } },
    ];

    const cierre = await construirCierreEvento('evt-1');

    expect(cierre.ingresosFinanzas).toHaveLength(1);
    expect(cierre.ingresosFinanzas[0].id).toBe('f1');
  });

  it('aplica fallback histórico cuando faltan monto_bruto/monto_artista/variante_precio', async () => {
    state.finanzas = [
      { id: 'f-legacy', data: { eventoId: 'evt-1', categoria: 'Evento', monto: 16, metodo: 'Efectivo', fecha: fecha(1) } },
    ];

    const cierre = await construirCierreEvento('evt-1');

    expect(cierre.ingresosFinanzas[0]).toMatchObject({
      monto: 16, montoBruto: 16, montoArtista: 0, variantePrecio: 'estandar', esFallbackHistorico: true,
    });
    expect(cierre.totales.hayHistoricoFallback).toBe(true);
  });

  it('ignora una variante_precio fuera del enum y aplica estandar', async () => {
    state.finanzas = [
      { id: 'f-bad', data: { eventoId: 'evt-1', categoria: 'Evento', monto: 5, monto_bruto: 16, monto_artista: 11, variante_precio: 'inventada', metodo: 'Efectivo', fecha: fecha(1) } },
    ];

    const cierre = await construirCierreEvento('evt-1');

    expect(cierre.ingresosFinanzas[0].variantePrecio).toBe('estandar');
    expect(cierre.ingresosFinanzas[0].esFallbackHistorico).toBe(false);
  });

  it('calcula porMetodo, totalCaja, totalAsistencia y descuadre a partir del bruto', async () => {
    state.asistencia = [
      { id: 'a1', data: { eventoId: 'evt-1', tipo: 'reserva', precio: 16, fecha: fecha(1) } },
      { id: 'a2', data: { eventoId: 'evt-1', tipo: 'walk-in', precio: 16, fecha: fecha(2) } },
    ];
    state.finanzas = [
      { id: 'f1', data: { eventoId: 'evt-1', categoria: 'Evento', monto: 5, monto_bruto: 16, monto_artista: 11, variante_precio: 'estandar', metodo: 'Efectivo', fecha: fecha(1) } },
      { id: 'f2', data: { eventoId: 'evt-1', categoria: 'Evento', monto: 5, monto_bruto: 16, monto_artista: 11, variante_precio: 'estandar', metodo: 'Tarjeta', fecha: fecha(2) } },
    ];

    const cierre = await construirCierreEvento('evt-1');

    expect(cierre.totales.porMetodo).toEqual({ Efectivo: 16, Tarjeta: 16 });
    expect(cierre.totales.totalCaja).toBe(32);
    expect(cierre.totales.totalAsistencia).toBe(32);
    expect(cierre.totales.descuadre).toBe(0);
    expect(cierre.totales.totalKalian).toBe(10);
    expect(cierre.totales.totalArtista).toBe(22);
  });

  it('detecta un descuadre cuando la caja no cuadra con la asistencia', async () => {
    state.asistencia = [
      { id: 'a1', data: { eventoId: 'evt-1', tipo: 'reserva', precio: 16, fecha: fecha(1) } },
    ];
    state.finanzas = [
      { id: 'f1', data: { eventoId: 'evt-1', categoria: 'Evento', monto: 5, monto_bruto: 76, monto_artista: 71, variante_precio: 'estandar', metodo: 'Efectivo', fecha: fecha(1) } },
    ];

    const cierre = await construirCierreEvento('evt-1');

    expect(cierre.totales.descuadre).toBe(60); // reproduce el caso del 19-sep-2026
  });
});
