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

import { construirCierreEvento, construirRecibiArtista } from '../../src/lib/informeCierreEvento';

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

describe('construirRecibiArtista', () => {
  const evento = { precio_estandar: 16, precio_descuento: 12, precioCupon: 8 };
  const ingreso = (variantePrecio: any, bruto: number, kalian: number, extra: any = {}) => ({
    id: Math.random().toString(36), monto: kalian, montoBruto: bruto, montoArtista: bruto - kalian,
    variantePrecio, metodo: 'Efectivo' as const, fecha: null, esFallbackHistorico: false, ...extra,
  });
  const repetir = <T,>(n: number, f: () => T) => Array.from({ length: n }, f);

  it('resume por variante con descuentos de socio y cupón', () => {
    const ingresosFinanzas = [
      ...repetir(10, () => ingreso('estandar', 16, 5)),
      ...repetir(4, () => ingreso('descuento_socio', 12, 5)),
      ...repetir(2, () => ingreso('cupon', 8, 5)),
    ];
    const asistencias = repetir(16, () => ({ precio: 1, fecha: null }));

    const r = construirRecibiArtista({ evento, ingresosFinanzas, asistencias, pagosArtista: [] });

    expect(r.resumen).toEqual([
      { variante: 'estandar', numEntradas: 10, precioMin: 16, precioMax: 16, bruto: 160, kalian: 50, artista: 110 },
      { variante: 'descuento_socio', numEntradas: 4, precioMin: 12, precioMax: 12, bruto: 48, kalian: 20, artista: 28 },
      { variante: 'cupon', numEntradas: 2, precioMin: 8, precioMax: 8, bruto: 16, kalian: 10, artista: 6 },
    ]);
    expect(r.totales).toEqual({ numEntradas: 16, bruto: 224, kalian: 80, artista: 144 });
    expect(r.avisos).toEqual([]);
  });

  it('cuenta las entradas gratuitas desde asistencia', () => {
    const r = construirRecibiArtista({
      evento,
      ingresosFinanzas: [],
      asistencias: repetir(3, () => ({ precio: 0, fecha: null })),
      pagosArtista: [],
    });

    expect(r.resumen).toEqual([
      { variante: 'gratis', numEntradas: 3, precioMin: 0, precioMax: 0, bruto: 0, kalian: 0, artista: 0 },
    ]);
    expect(r.entradas).toHaveLength(3);
  });

  it('liquidación sin pagos previos: el pendiente es el total del artista', () => {
    const r = construirRecibiArtista({
      evento, ingresosFinanzas: [ingreso('estandar', 16, 5)], asistencias: [{ precio: 16, fecha: null }], pagosArtista: [],
    });
    expect(r.liquidacion).toEqual({ totalArtista: 11, pagado: 0, pendiente: 11 });
  });

  it('liquidación con pago previo: descuenta lo ya entregado', () => {
    const ingresosFinanzas = repetir(16, () => ingreso('estandar', 14, 5)); // artista 9 × 16 = 144
    const r = construirRecibiArtista({
      evento: {},
      ingresosFinanzas,
      asistencias: repetir(16, () => ({ precio: 14, fecha: null })),
      pagosArtista: [{ id: 'p1', importe: 100, metodo: 'Efectivo', fecha: null }],
    });
    expect(r.liquidacion).toEqual({ totalArtista: 144, pagado: 100, pendiente: 44 });
    expect(r.avisos).toEqual([]);
  });

  it('avisa si se ha pagado más de lo que corresponde, sin pendiente negativo', () => {
    const r = construirRecibiArtista({
      evento: {},
      ingresosFinanzas: [ingreso('estandar', 16, 5)],
      asistencias: [{ precio: 16, fecha: null }],
      pagosArtista: [{ id: 'p1', importe: 20, metodo: 'Efectivo', fecha: null }],
    });
    expect(r.liquidacion.pendiente).toBe(0);
    expect(r.avisos.some(a => a.includes('superan lo que le corresponde'))).toBe(true);
  });

  it('avisa de entradas cobradas a un precio distinto del configurado', () => {
    const r = construirRecibiArtista({
      evento,
      ingresosFinanzas: repetir(2, () => ingreso('cupon', 16, 5)),
      asistencias: repetir(2, () => ({ precio: 16, fecha: null })),
      pagosArtista: [],
    });
    expect(r.avisos).toEqual([
      'Cupón: 2 entradas cobradas a un precio distinto del configurado en el evento (8.00€).',
    ]);
  });

  it('no avisa de precio en movimientos históricos', () => {
    const r = construirRecibiArtista({
      evento,
      ingresosFinanzas: [ingreso('estandar', 20, 20, { esFallbackHistorico: true })],
      asistencias: [{ precio: 20, fecha: null }],
      pagosArtista: [],
    });
    expect(r.avisos).toEqual([]);
  });

  it('avisa de diferencia entre entradas de pago en puerta y cobros en contabilidad', () => {
    const r = construirRecibiArtista({
      evento: {},
      ingresosFinanzas: repetir(19, () => ingreso('estandar', 16, 5)),
      asistencias: repetir(20, () => ({ precio: 16, fecha: null })),
      pagosArtista: [],
    });
    expect(r.avisos).toEqual([
      'En puerta constan 20 entradas de pago y en contabilidad 19 cobros (diferencia de 1). Revisar antes de firmar.',
    ]);
  });
});

describe('construirCierreEvento → recibí', () => {
  it('lee los pagos al artista (en positivo) y excluye los borrados', async () => {
    state.asistencia = [
      { id: 'a1', data: { eventoId: 'evt-1', tipo: 'reserva', precio: 16, fecha: fecha(1) } },
      { id: 'a2', data: { eventoId: 'evt-1', tipo: 'walk-in', precio: 0, fecha: fecha(2) } },
    ];
    state.finanzas = [
      { id: 'f1', data: { eventoId: 'evt-1', categoria: 'Evento', monto: 5, monto_bruto: 16, monto_artista: 11, variante_precio: 'estandar', metodo: 'Efectivo', fecha: fecha(1) } },
      { id: 'p1', data: { eventoId: 'evt-1', categoria: 'Pago Artista', monto: -6, metodo: 'Efectivo', fecha: fecha(3) } },
      { id: 'p2', data: { eventoId: 'evt-1', categoria: 'Pago Artista', monto: -5, metodo: 'Efectivo', fecha: fecha(4), deletedAt: fecha(5) } },
    ];

    const cierre = await construirCierreEvento('evt-1');

    expect(cierre.pagosArtista).toEqual([{ id: 'p1', importe: 6, metodo: 'Efectivo', fecha: new Date(3) }]);
    expect(cierre.recibi.liquidacion).toEqual({ totalArtista: 11, pagado: 6, pendiente: 5 });
    expect(cierre.recibi.resumen.map(f => [f.variante, f.numEntradas])).toEqual([['estandar', 1], ['gratis', 1]]);
  });
});
