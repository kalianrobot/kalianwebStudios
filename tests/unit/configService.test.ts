import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockGetDoc, mockSetDoc, mockOnSnapshot } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(() => Promise.resolve()),
  mockOnSnapshot: vi.fn(),
}));

vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'mockRef'),
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  onSnapshot: mockOnSnapshot,
}));

import { getDefaultConfig, fetchConfig, updateConfig, subscribeToConfig } from '../../src/lib/configService';

describe('configService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('getDefaultConfig', () => {
    it('devuelve cuotaMensualSocio=15', () => {
      expect(getDefaultConfig()).toEqual({ cuotaMensualSocio: 15 });
    });
  });

  describe('fetchConfig', () => {
    it('devuelve la config cuando el doc existe', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ cuotaMensualSocio: 20 }) });
      expect(await fetchConfig()).toEqual({ cuotaMensualSocio: 20 });
    });

    it('crea doc con default si no existe y lo devuelve', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      const cfg = await fetchConfig();
      expect(mockSetDoc).toHaveBeenCalledWith('mockRef', { cuotaMensualSocio: 15 });
      expect(cfg).toEqual({ cuotaMensualSocio: 15 });
    });

    it('devuelve default si hay error de red', async () => {
      mockGetDoc.mockRejectedValue(new Error('network'));
      expect(await fetchConfig()).toEqual({ cuotaMensualSocio: 15 });
    });
  });

  describe('updateConfig', () => {
    it('llama a setDoc con merge:true', async () => {
      await updateConfig({ cuotaMensualSocio: 25 });
      expect(mockSetDoc).toHaveBeenCalledWith('mockRef', { cuotaMensualSocio: 25 }, { merge: true });
    });

    it('propaga el error si setDoc falla', async () => {
      mockSetDoc.mockRejectedValue(new Error('perm'));
      await expect(updateConfig({ cuotaMensualSocio: 25 })).rejects.toThrow('perm');
    });
  });

  describe('subscribeToConfig', () => {
    it('invoca callback con config cuando el doc existe', () => {
      mockOnSnapshot.mockImplementation((_ref: unknown, cb: (s: any) => void) => {
        cb({ exists: () => true, data: () => ({ cuotaMensualSocio: 30 }) });
        return () => {};
      });
      const cb = vi.fn();
      subscribeToConfig(cb);
      expect(cb).toHaveBeenCalledWith({ cuotaMensualSocio: 30 });
    });

    it('invoca callback con default cuando el doc no existe', () => {
      mockOnSnapshot.mockImplementation((_ref: unknown, cb: (s: any) => void) => {
        cb({ exists: () => false });
        return () => {};
      });
      const cb = vi.fn();
      subscribeToConfig(cb);
      expect(cb).toHaveBeenCalledWith({ cuotaMensualSocio: 15 });
    });
  });
});
