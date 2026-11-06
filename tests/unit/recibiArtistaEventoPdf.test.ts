import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CierreEvento } from '../../src/lib/informeCierreEvento';

const mockDoc = vi.hoisted(() => ({
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setFont: vi.fn(),
  text: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
  splitTextToSize: vi.fn((text: string) => [text]),
  setDrawColor: vi.fn(),
  line: vi.fn(),
  internal: { pageSize: { getWidth: () => 210 } },
  lastAutoTable: { finalY: 40 },
}));

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function () {
    return mockDoc;
  }),
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((doc: typeof mockDoc) => {
    doc.lastAutoTable = { finalY: doc.lastAutoTable.finalY + 20 };
  }),
}));

import { generarRecibiArtistaEventoPdf } from '../../src/lib/recibiArtistaEventoPdf';

function cierreBase(overrides: Partial<CierreEvento> = {}): CierreEvento {
  return {
    evento: { id: 'evt-1', titulo: 'Jazz Night', fecha: '2026-09-19T21:00' },
    entradasQR: [],
    entradasWalkIn: [],
    reservasNoShow: [],
    ingresosFinanzas: [],
    pagosArtista: [],
    recibi: {
      entradas: [],
      resumen: [],
      totales: { numEntradas: 0, bruto: 0, kalian: 0, artista: 0 },
      liquidacion: { totalArtista: 0, pagado: 0, pendiente: 0 },
      avisos: [],
    },
    totales: {
      porMetodo: {},
      totalCaja: 0,
      totalAsistencia: 0,
      descuadre: 0,
      totalBruto: 0,
      totalKalian: 0,
      totalArtista: 0,
      hayHistoricoFallback: false,
    },
    ...overrides,
  } as CierreEvento;
}

describe('generarRecibiArtistaEventoPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.lastAutoTable = { finalY: 40 };
  });

  it('guarda el PDF con el nombre recibi-<slug>-<YYYYMMDD>.pdf', () => {
    generarRecibiArtistaEventoPdf(cierreBase());

    expect(mockDoc.save).toHaveBeenCalledWith('recibi-jazz-night-20260919.pdf');
  });

  it('deja el nombre del artista en blanco si evento.artista no existe', () => {
    generarRecibiArtistaEventoPdf(cierreBase());

    const linea = mockDoc.text.mock.calls.find(c => typeof c[0] === 'string' && c[0].startsWith('Artista:'));
    expect(linea?.[0]).toBe('Artista: ______________________');
  });

  it('muestra el nombre del artista cuando el evento lo tiene', () => {
    generarRecibiArtistaEventoPdf(cierreBase({ evento: { id: 'evt-1', titulo: 'Jazz Night', fecha: '2026-09-19T21:00', artista: 'Los Improbables' } as any }));

    const linea = mockDoc.text.mock.calls.find(c => typeof c[0] === 'string' && c[0].startsWith('Artista:'));
    expect(linea?.[0]).toBe('Artista: Los Improbables');
  });

  it('muestra la liquidación y rellena el recibí con el pendiente', () => {
    generarRecibiArtistaEventoPdf(cierreBase({
      recibi: {
        entradas: [],
        resumen: [],
        totales: { numEntradas: 0, bruto: 0, kalian: 0, artista: 0 },
        liquidacion: { totalArtista: 144, pagado: 100, pendiente: 44 },
        avisos: [],
      },
    }));

    expect(mockDoc.text).toHaveBeenCalledWith('Total que corresponde al artista: 144.00€', 14, expect.any(Number));
    expect(mockDoc.text).toHaveBeenCalledWith('Pagos ya entregados: 100.00€', 14, expect.any(Number));
    expect(mockDoc.text).toHaveBeenCalledWith('Pendiente de pago: 44.00€', 14, expect.any(Number));
    expect(mockDoc.splitTextToSize).toHaveBeenCalledWith(
      'Recibí de Kalian HKG la cantidad de 44.00€ en concepto de caché del evento "Jazz Night".',
      expect.any(Number)
    );
  });

  it('pinta la tabla resumen por tipo con fila de totales', async () => {
    const autoTable = (await import('jspdf-autotable')).default as unknown as ReturnType<typeof vi.fn>;
    generarRecibiArtistaEventoPdf(cierreBase({
      recibi: {
        entradas: [],
        resumen: [
          { variante: 'descuento_socio', numEntradas: 4, precioMin: 12, precioMax: 12, bruto: 48, kalian: 20, artista: 28 },
          { variante: 'cupon', numEntradas: 2, precioMin: 8, precioMax: 16, bruto: 24, kalian: 10, artista: 14 },
        ],
        totales: { numEntradas: 6, bruto: 72, kalian: 30, artista: 42 },
        liquidacion: { totalArtista: 42, pagado: 0, pendiente: 42 },
        avisos: [],
      },
    }));

    const opciones = autoTable.mock.calls[0][1];
    expect(opciones.body).toEqual([
      ['Soci@', '4', '12.00€', '48.00€', '20.00€', '28.00€'],
      ['Cupón', '2', '8.00€ – 16.00€', '24.00€', '10.00€', '14.00€'],
    ]);
    expect(opciones.foot).toEqual([['Total', '6', '', '72.00€', '30.00€', '42.00€']]);
  });

  it('muestra los avisos de control solo cuando los hay', () => {
    generarRecibiArtistaEventoPdf(cierreBase());
    expect(mockDoc.text).not.toHaveBeenCalledWith('Avisos de control', 14, expect.any(Number));

    vi.clearAllMocks();
    generarRecibiArtistaEventoPdf(cierreBase({
      recibi: {
        entradas: [],
        resumen: [],
        totales: { numEntradas: 0, bruto: 0, kalian: 0, artista: 0 },
        liquidacion: { totalArtista: 0, pagado: 0, pendiente: 0 },
        avisos: ['Cupón: 2 entradas cobradas a un precio distinto del configurado en el evento (8.00€).'],
      },
    }));
    expect(mockDoc.text).toHaveBeenCalledWith('Avisos de control', 14, expect.any(Number));
  });

  it('no incluye nombres ni DNIs de asistentes', () => {
    generarRecibiArtistaEventoPdf(cierreBase({
      entradasQR: [{ id: 'a1', nombre: 'Ana Pérez', dni: '12345678Z', tipo: 'reserva', precio: 16, fecha: null }],
      reservasNoShow: [{ reservaId: 'r1', slotIdx: 0, nombre: 'Luis Gómez', dni: '87654321X', tipo: 'titular', canal: 'invitado', precio: 16, estimado: false }],
    }));

    const textos = JSON.stringify([...mockDoc.text.mock.calls, ...mockDoc.splitTextToSize.mock.calls]);
    expect(textos).not.toContain('Ana Pérez');
    expect(textos).not.toContain('12345678Z');
    expect(textos).not.toContain('Luis Gómez');
    expect(textos).not.toContain('87654321X');
  });

  it('añade el aviso de datos históricos cuando hayHistoricoFallback es true', () => {
    generarRecibiArtistaEventoPdf(cierreBase({
      totales: { porMetodo: {}, totalCaja: 16, totalAsistencia: 16, descuadre: 0, totalBruto: 16, totalKalian: 16, totalArtista: 0, hayHistoricoFallback: true },
    }));

    expect(mockDoc.splitTextToSize).toHaveBeenCalledWith(
      'Datos históricos: la comisión Kalian se aplicó al 100% del cobro.',
      expect.any(Number)
    );
  });

  it('no añade el aviso de datos históricos cuando hayHistoricoFallback es false', () => {
    generarRecibiArtistaEventoPdf(cierreBase());

    const llamadaAviso = mockDoc.splitTextToSize.mock.calls.find(c => c[0].includes('Datos históricos'));
    expect(llamadaAviso).toBeUndefined();
  });

  it('incluye la línea de firma y DNI del artista', () => {
    generarRecibiArtistaEventoPdf(cierreBase());

    expect(mockDoc.text).toHaveBeenCalledWith('Firma del artista', 14, expect.any(Number));
    expect(mockDoc.text).toHaveBeenCalledWith('DNI del artista', 110, expect.any(Number));
  });

  it('incluye el anexo con cada entrada, también las gratuitas', async () => {
    const autoTable = (await import('jspdf-autotable')).default as unknown as ReturnType<typeof vi.fn>;
    generarRecibiArtistaEventoPdf(cierreBase({
      recibi: {
        entradas: [
          { fecha: null, variante: 'descuento_socio', bruto: 12, kalian: 5, artista: 7, esFallbackHistorico: false },
          { fecha: null, variante: 'gratis', bruto: 0, kalian: 0, artista: 0, esFallbackHistorico: false },
        ],
        resumen: [],
        totales: { numEntradas: 2, bruto: 12, kalian: 5, artista: 7 },
        liquidacion: { totalArtista: 7, pagado: 0, pendiente: 7 },
        avisos: [],
      },
    }));

    expect(mockDoc.text).toHaveBeenCalledWith('Anexo: detalle de entradas', 14, 20);
    const anexo = autoTable.mock.calls[1][1];
    expect(anexo.body).toEqual([
      ['—', 'Soci@', '12.00€', '5.00€', '7.00€'],
      ['—', 'Gratis', '0.00€', '0.00€', '0.00€'],
    ]);
  });
});
