import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockSetDoc, mockAddDoc, mockDocFn } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(() => Promise.resolve()),
  mockAddDoc: vi.fn(() => Promise.resolve()),
  mockDocFn: vi.fn((_db: unknown, _col: string, id?: string) => `ref:${id ?? 'auto'}`),
}));

vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mockCol'),
  addDoc: mockAddDoc,
  serverTimestamp: vi.fn(() => 'TS'),
  Timestamp: {},
  setDoc: mockSetDoc,
  doc: mockDocFn,
}));

import { registrarIngreso } from '../../src/lib/finanzas';

describe('registrarIngreso (unit)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('usa setDoc con ID determinista CUOTA_{anio}_{mes}_{socio_id}', async () => {
    await registrarIngreso({ monto: 15, concepto: 'Cuota', categoria: 'Socio', metodo: 'Efectivo', socio_id: 'S1', mes: 6, anio: 2026 });
    expect(mockDocFn).toHaveBeenCalledWith({}, 'finanzas', 'CUOTA_2026_6_S1');
    expect(mockSetDoc).toHaveBeenCalledOnce();
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('normaliza cuota_socio → Socio en el payload', async () => {
    await registrarIngreso({ monto: 15, concepto: 'Cuota', categoria: 'cuota_socio' as any, metodo: 'Efectivo', socio_id: 'S2', mes: 1, anio: 2026 });
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ categoria: 'Socio', deletedAt: null }),
    );
  });

  it('setDoc idempotente — dos llamadas iguales usan el mismo ref', async () => {
    const data = { monto: 15, concepto: 'Cuota', categoria: 'Socio' as const, metodo: 'Efectivo' as const, socio_id: 'S3', mes: 3, anio: 2026 };
    await registrarIngreso(data);
    await registrarIngreso(data);
    expect(mockDocFn).toHaveBeenCalledWith({}, 'finanzas', 'CUOTA_2026_3_S3');
  });

  it('usa addDoc para categorías no-cuota', async () => {
    await registrarIngreso({ monto: 50, concepto: 'Evento', categoria: 'Evento', metodo: 'Tarjeta' });
    expect(mockAddDoc).toHaveBeenCalledOnce();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('propaga errores de Firestore', async () => {
    mockSetDoc.mockRejectedValue(new Error('perm'));
    await expect(
      registrarIngreso({ monto: 15, concepto: 'X', categoria: 'Socio', metodo: 'Efectivo', socio_id: 'S1', mes: 6, anio: 2026 })
    ).rejects.toThrow('perm');
  });
});
