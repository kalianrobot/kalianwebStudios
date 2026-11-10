import { describe, it, expect } from 'vitest';
import * as cliente from '../../src/lib/descuentoSocio';
import * as servidor from '../../functions/src/descuentoSocio';

const HOY = '2026-11-10';

describe.each([
  ['cliente (src/lib)', cliente],
  ['servidor (functions/src)', servidor],
])('tieneDescuentoSocio — %s', (_nombre, m) => {
  const concierto = { categoria: 'musica', academias_descuento: ['Music is Cool', 'local'] };

  it('socio de Music is Cool en un concierto con esa academia marcada', () => {
    expect(m.tieneDescuentoSocio({ 'Music is Cool': '2027-06-28' }, concierto, HOY)).toBe(true);
  });

  it('academia no marcada en el evento → sin descuento', () => {
    expect(m.tieneDescuentoSocio({ 'SBK CLUB': '2027-06-28' }, concierto, HOY)).toBe(false);
  });

  it('membresía caducada → sin descuento', () => {
    expect(m.tieneDescuentoSocio({ 'Music is Cool': '2026-11-09' }, concierto, HOY)).toBe(false);
  });

  it('vence hoy → todavía tiene descuento', () => {
    expect(m.tieneDescuentoSocio({ 'Music is Cool': HOY }, concierto, HOY)).toBe(true);
  });

  it('socio de local con local marcado', () => {
    expect(m.tieneDescuentoSocio({ local: '2099-12-31' }, concierto, HOY)).toBe(true);
  });

  it('socio de local con local desmarcado', () => {
    expect(m.tieneDescuentoSocio({ local: '2099-12-31' }, { academias_descuento: ['Music is Cool'] }, HOY)).toBe(false);
  });

  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(m.tieneDescuentoSocio({ 'music  is cool ': '2027-01-01' }, concierto, HOY)).toBe(true);
  });

  it('claves antiguas musica/danza equivalen a Music is Cool / SBK CLUB', () => {
    expect(m.tieneDescuentoSocio({ musica: '2027-01-01' }, concierto, HOY)).toBe(true);
    expect(m.tieneDescuentoSocio({ danza: '2027-01-01' }, { academias_descuento: ['SBK CLUB'] }, HOY)).toBe(true);
  });

  it('evento antiguo de música sin el campo nuevo: Music is Cool y local', () => {
    expect(m.tieneDescuentoSocio({ 'Music is Cool': '2027-01-01' }, { categoria: 'musica' }, HOY)).toBe(true);
    expect(m.tieneDescuentoSocio({ local: '2099-12-31' }, { categoria: 'musica' }, HOY)).toBe(true);
    expect(m.tieneDescuentoSocio({ 'SBK CLUB': '2027-01-01' }, { categoria: 'musica' }, HOY)).toBe(false);
  });

  it('evento antiguo de danza sin el campo nuevo: SBK CLUB y local', () => {
    expect(m.tieneDescuentoSocio({ 'SBK CLUB': '2027-01-01' }, { categoria: 'danza' }, HOY)).toBe(true);
    expect(m.tieneDescuentoSocio({ local: '2099-12-31' }, { categoria: 'danza' }, HOY)).toBe(true);
  });

  it('evento con categoría ninguno o lista vacía → nadie tiene descuento', () => {
    expect(m.tieneDescuentoSocio({ 'Music is Cool': '2027-01-01' }, { categoria: 'ninguno' }, HOY)).toBe(false);
    expect(m.tieneDescuentoSocio({ 'Music is Cool': '2027-01-01' }, { categoria: 'musica', academias_descuento: [] }, HOY)).toBe(false);
  });

  it('sin membresías → sin descuento', () => {
    expect(m.tieneDescuentoSocio(undefined, concierto, HOY)).toBe(false);
    expect(m.tieneDescuentoSocio({}, concierto, HOY)).toBe(false);
  });

  it('Club Flamenco: solo si el evento lo marca', () => {
    const flamenco = { categoria: 'musica', academias_descuento: ['Music is Cool', 'Club Flamenco', 'local'] };
    expect(m.tieneDescuentoSocio({ 'CLUB FLAMENCO': '2027-01-01' }, flamenco, HOY)).toBe(true);
    expect(m.tieneDescuentoSocio({ 'CLUB FLAMENCO': '2027-01-01' }, concierto, HOY)).toBe(false);
  });
});
