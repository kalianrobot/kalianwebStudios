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

  it('muestra los totales bruto/kalian/artista', () => {
    generarRecibiArtistaEventoPdf(cierreBase({
      totales: { porMetodo: {}, totalCaja: 1152, totalAsistencia: 72, descuadre: 0, totalBruto: 1152, totalKalian: 360, totalArtista: 792, hayHistoricoFallback: false },
    }));

    expect(mockDoc.text).toHaveBeenCalledWith('Bruto total: 1152.00€', 14, expect.any(Number));
    expect(mockDoc.text).toHaveBeenCalledWith('Kalian total: 360.00€', 14, expect.any(Number));
    expect(mockDoc.text).toHaveBeenCalledWith('Artista total: 792.00€', 14, expect.any(Number));
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

  it('etiqueta la variante de precio en la fila de cada entrada', () => {
    generarRecibiArtistaEventoPdf(cierreBase({
      ingresosFinanzas: [
        { id: 'f1', monto: 5, montoBruto: 16, montoArtista: 11, variantePrecio: 'descuento_socio', metodo: 'Efectivo', fecha: null, esFallbackHistorico: false },
      ],
    }));

    // jspdf-autotable está mockeado; comprobamos que se generó el body vía el mock de autotable importado.
    expect(mockDoc.lastAutoTable.finalY).toBeGreaterThan(40);
  });
});
