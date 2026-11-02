import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Anonimizador, reemplazarSinMayus } = require('../../scripts/copiar-prod-a-test.cjs');

const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const dniValido = (d: string) => /^\d{8}[A-Z]$/.test(d) && LETRAS[Number(d.slice(0, 8)) % 23] === d[8];

function anonimizar(docs: { top: string; path: string; data: Record<string, unknown> }[]) {
  const a = new Anonimizador();
  for (const d of docs) a.recolectar(d.top, d.data);
  return docs.map((d) => ({ path: a.rutaFalsa(d.path), data: a.transformar(d.top, d.data) }));
}

describe('copiar-prod-a-test: anonimización', () => {
  const docs = [
    { top: 'socios', path: 'socios/12345678Z', data: {
      nombre: 'Josu', apellidos: 'Garcia Lopez', dni: '12345678z', email: 'Josu@Mail.com',
      telefono: '611222333', foto: 'https://firebasestorage.googleapis.com/x', estado: 'activo',
      notas: 'llamar a josu@mail.com',
    } },
    { top: 'pagos_mensuales', path: 'pagos_mensuales/2026_10_12345678Z', data: { dni: '12345678Z', importe: 15 } },
    { top: 'cursos', path: 'cursos/c1', data: {
      nombre: 'Txalaparta', alumnos: ['12345678Z'], emailProfesor: 'profe@gmail.com',
      descripcion: 'Escribe a profe@gmail.com o info@kalian.es',
    } },
    { top: 'locales', path: 'locales/l1', data: {
      nombre: 'Local A',
      inquilinos: [{ nombre: 'Ana Ruiz', dni: '87654321X', cuentaBancaria: 'ES12 3456', email: 'ana@x.es' }],
    } },
    { top: 'config', path: 'config/donaciones', data: { iban: 'ES99 REAL', email: 'contacto@gmail.com' } },
    { top: 'users', path: 'users/uid1', data: { email: 'kalianrobot@gmail.com', role: 'admin' } },
  ];
  const out = anonimizar(docs);
  const texto = JSON.stringify(out);

  it('no deja ningún dato personal real', () => {
    for (const real of ['12345678', '87654321', 'josu@mail.com', 'Josu', 'Garcia', '611222333',
      'profe@gmail.com', 'Ana Ruiz', 'ES12', 'firebasestorage']) {
      expect(texto.toLowerCase()).not.toContain(real.toLowerCase());
    }
  });

  it('mantiene la relación DNI entre socio, pago, curso e IDs', () => {
    const dni = (out[0].data as { dni: string }).dni;
    expect(dniValido(dni)).toBe(true);
    expect(out[0].path).toBe(`socios/${dni}`);
    expect(out[1].path).toBe(`pagos_mensuales/2026_10_${dni}`);
    expect((out[2].data as { alumnos: string[] }).alumnos).toEqual([dni]);
  });

  it('usa el mismo email falso en todas partes', () => {
    const c = out[2].data as { emailProfesor: string; descripcion: string };
    expect(c.emailProfesor).toMatch(/@example\.com$/);
    expect(c.descripcion).toContain(c.emailProfesor);
    expect(c.descripcion).toContain('info@kalian.es');
  });

  it('respeta catálogos, config y emails de Kalian', () => {
    expect((out[2].data as { nombre: string }).nombre).toBe('Txalaparta');
    expect((out[3].data as { nombre: string }).nombre).toBe('Local A');
    expect(out[4].data).toEqual({ iban: 'ES99 REAL', email: 'contacto@gmail.com' });
    expect((out[5].data as { email: string }).email).toBe('kalianrobot@gmail.com');
  });

  it('borra fotos y textos libres de personas', () => {
    const s = out[0].data as Record<string, unknown>;
    expect(s.foto).toBeUndefined();
    expect(s.notas).toBe('Texto de prueba');
    expect(s.estado).toBe('activo');
  });

  it('reemplazarSinMayus ignora mayúsculas', () => {
    expect(reemplazarSinMayus('a ABC b abc', 'abc', 'X')).toBe('a X b X');
  });
});
