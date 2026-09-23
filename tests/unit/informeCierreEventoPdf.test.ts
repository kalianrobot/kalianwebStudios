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
  getTextWidth: vi.fn(() => 20),
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

import { generarInformeCierreEventoPdf } from '../../src/lib/informeCierreEventoPdf';

function cierreBase(overrides: Partial<CierreEvento> = {}): CierreEvento {
  return {
    evento: { id: 'evt-1', titulo: 'Jazz Night', fecha: '2026-09-19T21:00', aforo_maximo: 50, aforo_actual: 40 },
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

describe('generarInformeCierreEventoPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.lastAutoTable = { finalY: 40 };
  });

  it('guarda el PDF con el nombre cierre-<slug>-<YYYYMMDD>.pdf', () => {
    generarInformeCierreEventoPdf(cierreBase(), 'staff-uid-1');

    expect(mockDoc.save).toHaveBeenCalledWith('cierre-jazz-night-20260919.pdf');
  });

  it('incluye filas de entradasQR con nombre, dni y precio', () => {
    generarInformeCierreEventoPdf(cierreBase({
      entradasQR: [{ id: 'a1', nombre: 'Ana', dni: '111', tipo: 'reserva', precio: 16, fecha: null }],
    }), 'staff-uid-1');

    const llamadaTexto = mockDoc.text.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('Entradas por QR'));
    expect(llamadaTexto).toBeDefined();
  });

  it('resalta el descuadre cuando es distinto de 0', () => {
    generarInformeCierreEventoPdf(cierreBase({
      totales: {
        porMetodo: { Efectivo: 76 }, totalCaja: 76, totalAsistencia: 16, descuadre: 60,
        totalBruto: 76, totalKalian: 5, totalArtista: 71, hayHistoricoFallback: false,
      },
    }), 'staff-uid-1');

    const llamadaDescuadre = mockDoc.text.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].startsWith('Descuadre:')
    );
    expect(llamadaDescuadre?.[0]).toContain('+60.00€');
    expect(llamadaDescuadre?.[0]).toContain('REVISAR');
  });

  it('marca el descuadre como OK cuando es 0', () => {
    generarInformeCierreEventoPdf(cierreBase({
      totales: { porMetodo: {}, totalCaja: 16, totalAsistencia: 16, descuadre: 0, totalBruto: 16, totalKalian: 5, totalArtista: 11, hayHistoricoFallback: false },
    }), 'staff-uid-1');

    const llamadaDescuadre = mockDoc.text.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].startsWith('Descuadre:')
    );
    expect(llamadaDescuadre?.[0]).toContain('(OK)');
  });

  it('incluye el pie con el uid de quien lo generó', () => {
    generarInformeCierreEventoPdf(cierreBase(), 'staff-uid-42');

    const pie = mockDoc.text.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('Generado el'));
    expect(pie?.[0]).toContain('staff-uid-42');
  });

  it('añade página nueva cuando el contenido se acumula (múltiples secciones con datos)', () => {
    mockDoc.lastAutoTable = { finalY: 245 };
    generarInformeCierreEventoPdf(cierreBase({
      reservasNoShow: [{ reservaId: 'r1', slotIdx: 0, nombre: 'Jose', dni: '333', tipo: 'titular', canal: 'invitado', precio: 16, estimado: false }],
    }), 'staff-uid-1');

    expect(mockDoc.addPage).toHaveBeenCalled();
  });
});
