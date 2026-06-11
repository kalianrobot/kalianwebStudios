import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockGetDoc, mockUpdateDoc } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'mockRef'),
  getDoc: mockGetDoc,
  updateDoc: mockUpdateDoc,
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));

import { syncSocioStatus } from '../../src/lib/socioService';

const hoy = new Date();
const MES_ACTUAL   = `${hoy.getFullYear()}_${hoy.getMonth() + 1}`;
const MES_HACE_DOS = hoy.getMonth() <= 1
  ? `${hoy.getFullYear() - 1}_${12 - (1 - hoy.getMonth())}`
  : `${hoy.getFullYear()}_${hoy.getMonth() - 1}`;
const MAÑANA = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
const PASADO = '2000-01-01';

describe('syncSocioStatus (unit)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('no actualiza ni falla si el socio no existe', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    await syncSocioStatus('S0');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('curso activo (fechaFin futura) → actualiza a activo', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ estado: 'inactivo', cursos: ['C1'] }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ fechaFin: MAÑANA }) });
    await syncSocioStatus('S1');
    expect(mockUpdateDoc).toHaveBeenCalledWith('mockRef', { estado: 'activo' });
  });

  it('curso caducado → actualiza a inactivo', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ estado: 'activo', cursos: ['C2'] }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ fechaFin: PASADO }) });
    await syncSocioStatus('S2');
    expect(mockUpdateDoc).toHaveBeenCalledWith('mockRef', { estado: 'inactivo' });
  });

  it('local con pago este mes → actualiza a activo', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ estado: 'inactivo', localId: 'L1' }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ ultimoPagoMesAnio: MES_ACTUAL }) });
    await syncSocioStatus('S3');
    expect(mockUpdateDoc).toHaveBeenCalledWith('mockRef', { estado: 'activo' });
  });

  it('local con pago de hace 2+ meses → actualiza a inactivo', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ estado: 'activo', localId: 'L2' }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ ultimoPagoMesAnio: MES_HACE_DOS }) });
    await syncSocioStatus('S4');
    expect(mockUpdateDoc).toHaveBeenCalledWith('mockRef', { estado: 'inactivo' });
  });

  it('curso con deletedAt no cuenta como activo', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ estado: 'activo', cursos: ['C3'] }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ fechaFin: MAÑANA, deletedAt: new Date() }) });
    await syncSocioStatus('S5');
    expect(mockUpdateDoc).toHaveBeenCalledWith('mockRef', { estado: 'inactivo' });
  });

  it('sin cursos ni local y activo → actualiza a inactivo', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ estado: 'activo' }) });
    await syncSocioStatus('S6');
    expect(mockUpdateDoc).toHaveBeenCalledWith('mockRef', { estado: 'inactivo' });
  });

  it('devuelve null si hay un error inesperado', async () => {
    mockGetDoc.mockRejectedValue(new Error('red'));
    expect(await syncSocioStatus('S7')).toBeNull();
  });
});
