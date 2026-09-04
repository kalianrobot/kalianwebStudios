import { describe, it, expect } from 'vitest';
import { normalizeDni, isValidDni, calcularLetraDni, DNI_NIE_REGEX } from '../../src/lib/dni';

describe('normalizeDni', () => {
  it('recorta espacios y pasa a mayúsculas', () => {
    expect(normalizeDni('  12345678z  ')).toBe('12345678Z');
  });
});

describe('calcularLetraDni', () => {
  it('calcula la letra de control de un DNI', () => {
    expect(calcularLetraDni('12345678T')).toBe('Z');
    expect(calcularLetraDni('00000000T')).toBe('T');
  });

  it('calcula la letra de control de un NIE (X/Y/Z inicial)', () => {
    expect(calcularLetraDni('X1234567T')).toBe('L');
    expect(calcularLetraDni('Y1234567T')).toBe('X');
    expect(calcularLetraDni('Z1234567T')).toBe('R');
  });

  it('devuelve null si el formato no encaja', () => {
    expect(calcularLetraDni('ABCDEFGHI')).toBeNull();
    expect(calcularLetraDni('1234567')).toBeNull();
    expect(calcularLetraDni('')).toBeNull();
  });
});

describe('isValidDni', () => {
  it('acepta un DNI con la letra de control correcta', () => {
    expect(isValidDni('12345678Z')).toBe(true);
  });

  it('acepta un NIE con la letra de control correcta', () => {
    expect(isValidDni('X1234567L')).toBe(true);
  });

  it('rechaza un DNI con formato correcto pero letra incorrecta', () => {
    // Regresión: antes de calcular el checksum, cualquier letra A-Z pasaba
    // la validación con formato válido. La letra real de 12345678 es Z.
    expect(isValidDni('12345678A')).toBe(false);
  });

  it('rechaza formato inválido', () => {
    expect(isValidDni('1234567Z')).toBe(false); // 7 dígitos
    expect(isValidDni('123456789')).toBe(false); // sin letra
    expect(isValidDni('W1234567L')).toBe(false); // W no es prefijo NIE válido
  });
});

describe('DNI_NIE_REGEX', () => {
  it('valida solo el formato, sin comprobar la letra', () => {
    // Documenta la diferencia con isValidDni: la regex sola no basta.
    expect(DNI_NIE_REGEX.test('12345678A')).toBe(true);
    expect(isValidDni('12345678A')).toBe(false);
  });
});
