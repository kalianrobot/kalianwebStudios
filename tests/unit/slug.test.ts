import { describe, it, expect } from 'vitest';
import { normalizeToSlug } from '../../src/lib/slug';

describe('normalizeToSlug', () => {
  it('convierte a mayúsculas por defecto', () => {
    expect(normalizeToSlug('hola mundo')).toBe('HOLA-MUNDO');
  });

  it('quita acentos', () => {
    expect(normalizeToSlug('José Núñez')).toBe('JOSE-NUNEZ');
  });

  it('sustituye espacios por guiones', () => {
    expect(normalizeToSlug('Curso de Danza')).toBe('CURSO-DE-DANZA');
  });

  it('colapsa guiones múltiples', () => {
    expect(normalizeToSlug('uno   dos')).toBe('UNO-DOS');
    expect(normalizeToSlug('uno---dos')).toBe('UNO-DOS');
  });

  it('elimina guiones al principio y al final', () => {
    expect(normalizeToSlug(' hola ')).toBe('HOLA');
    expect(normalizeToSlug('--hola--')).toBe('HOLA');
  });

  it('funciona en minúsculas con opt lowercase', () => {
    expect(normalizeToSlug('José Núñez', { lowercase: true })).toBe('jose-nunez');
  });

  it('quita caracteres especiales no alfanuméricos', () => {
    expect(normalizeToSlug('¡Hola, mundo!')).toBe('HOLA-MUNDO');
    expect(normalizeToSlug('café & té')).toBe('CAFE-TE');
  });

  it('preserva dígitos', () => {
    expect(normalizeToSlug('Curso 2026')).toBe('CURSO-2026');
  });

  it('devuelve string vacío para entrada vacía o nula', () => {
    expect(normalizeToSlug('')).toBe('');
    expect(normalizeToSlug(null as unknown as string)).toBe('');
  });
});
