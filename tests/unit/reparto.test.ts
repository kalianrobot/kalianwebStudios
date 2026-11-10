import { describe, it, expect } from 'vitest';
import {
  calcularReparto,
  resolverAportacionKalian,
  resolverVariantePrecio,
  segmentoDeVariante,
  precioSlotEnPuerta,
} from '../../src/lib/finanzas';
import { APORTACION_KALIAN_DEFAULT } from '../../src/lib/constants';

describe('calcularReparto', () => {
  it('variante estándar: precio 16, kalian 5 → kalian 5, artista 11', () => {
    expect(calcularReparto(16, 5)).toEqual({ kalian: 5, artista: 11 });
  });

  it('variante descuento_socio: precio 12, kalian 5 → kalian 5, artista 7', () => {
    expect(calcularReparto(12, 5)).toEqual({ kalian: 5, artista: 7 });
  });

  it('variante cupón: precio 8, kalian 3 → kalian 3, artista 5', () => {
    expect(calcularReparto(8, 3)).toEqual({ kalian: 3, artista: 5 });
  });

  it('variante gratis: precio 0 → kalian 0, artista 0', () => {
    expect(calcularReparto(0, 5)).toEqual({ kalian: 0, artista: 0 });
  });

  it('cap: precio 4, kalian configurada 5 → kalian 4, artista 0 (nunca negativo)', () => {
    expect(calcularReparto(4, 5)).toEqual({ kalian: 4, artista: 0 });
  });

  it('nunca produce artista negativo aunque kalian configurada sea negativa', () => {
    expect(calcularReparto(10, -3)).toEqual({ kalian: 0, artista: 10 });
  });
});

describe('segmentoDeVariante', () => {
  it('estandar, walkin_estandar y gratis mapean a "estandar"', () => {
    expect(segmentoDeVariante('estandar')).toBe('estandar');
    expect(segmentoDeVariante('walkin_estandar')).toBe('estandar');
    expect(segmentoDeVariante('gratis')).toBe('estandar');
  });

  it('descuento_socio y walkin_socio mapean a "descuento"', () => {
    expect(segmentoDeVariante('descuento_socio')).toBe('descuento');
    expect(segmentoDeVariante('walkin_socio')).toBe('descuento');
  });

  it('cupon mapea a "cupon"', () => {
    expect(segmentoDeVariante('cupon')).toBe('cupon');
  });
});

describe('resolverAportacionKalian', () => {
  it('usa el campo del evento cuando existe', () => {
    const evento = { aportacion_kalian_cupon: 3 };
    expect(resolverAportacionKalian('cupon', evento)).toBe(3);
  });

  it('fallback: evento sin aportacion_kalian_cupon aplica el default (5)', () => {
    expect(resolverAportacionKalian('cupon', {})).toBe(APORTACION_KALIAN_DEFAULT);
  });

  it('fallback también si el evento es undefined', () => {
    expect(resolverAportacionKalian('estandar', undefined)).toBe(APORTACION_KALIAN_DEFAULT);
  });

  it('ignora un valor no numérico y aplica el default', () => {
    expect(resolverAportacionKalian('estandar', { aportacion_kalian_estandar: 'cinco' as any })).toBe(APORTACION_KALIAN_DEFAULT);
  });
});

describe('resolverVariantePrecio', () => {
  it('precio 0 siempre es "gratis", sea cual sea el origen', () => {
    expect(resolverVariantePrecio({ precio: 0, origen: 'reserva', esSocio: false })).toBe('gratis');
    expect(resolverVariantePrecio({ precio: 0, origen: 'walkin', esSocio: true })).toBe('gratis');
    expect(resolverVariantePrecio({ precio: 0, origen: 'socio_carnet', esSocio: true })).toBe('gratis');
  });

  it('walk-in soci@ vs estándar', () => {
    expect(resolverVariantePrecio({ precio: 16, origen: 'walkin', esSocio: true })).toBe('walkin_socio');
    expect(resolverVariantePrecio({ precio: 16, origen: 'walkin', esSocio: false })).toBe('walkin_estandar');
  });

  it('socio_carnet con descuento activo es descuento_socio', () => {
    expect(resolverVariantePrecio({ precio: 12, origen: 'socio_carnet', esSocio: true })).toBe('descuento_socio');
  });

  it('reserva con cupón usado en el titular es cupon', () => {
    expect(resolverVariantePrecio({ precio: 8, origen: 'reserva', esSocio: false, esCupon: true })).toBe('cupon');
  });

  it('reserva sin socio ni cupón es estandar', () => {
    expect(resolverVariantePrecio({ precio: 16, origen: 'reserva', esSocio: false })).toBe('estandar');
  });

  it('esSocio tiene prioridad sobre esCupon (la reserva se validó como socio)', () => {
    expect(resolverVariantePrecio({ precio: 12, origen: 'reserva', esSocio: true, esCupon: true })).toBe('descuento_socio');
  });
});

describe('integración: reparto completo por variante', () => {
  it('estándar con default: evento sin aportacion_kalian_estandar, precio 16 → kalian 5, artista 11', () => {
    const variante = resolverVariantePrecio({ precio: 16, origen: 'reserva', esSocio: false });
    const { kalian, artista } = calcularReparto(16, resolverAportacionKalian(variante, {}));
    expect(kalian).toBe(5);
    expect(artista).toBe(11);
  });

  it('cupón con comisión propia: precioCupon 8, aportacion_kalian_cupon 3 → kalian 3, artista 5', () => {
    const evento = { aportacion_kalian_cupon: 3 };
    const variante = resolverVariantePrecio({ precio: 8, origen: 'reserva', esSocio: false, esCupon: true });
    const { kalian, artista } = calcularReparto(8, resolverAportacionKalian(variante, evento));
    expect(kalian).toBe(3);
    expect(artista).toBe(5);
  });

  it('cap por mala configuración: precioCupon 4, aportacion_kalian_cupon 5 → kalian 4, artista 0', () => {
    const evento = { aportacion_kalian_cupon: 5 };
    const variante = resolverVariantePrecio({ precio: 4, origen: 'reserva', esSocio: false, esCupon: true });
    const { kalian, artista } = calcularReparto(4, resolverAportacionKalian(variante, evento));
    expect(kalian).toBe(4);
    expect(artista).toBe(0);
  });
});

describe('precioSlotEnPuerta', () => {
  const evento = { cupon: 'TXEMA', precioCupon: 8, precio_estandar: 16 };
  const titular = { tipo: 'titular', estado: 'pendiente', precio: 16 };

  it('reserva antigua con cupón y titular a precio estándar → precio del cupón', () => {
    expect(precioSlotEnPuerta(titular, { cuponUsado: 'txema ' }, evento)).toBe(8);
  });

  it('reserva nueva ya guardada con precio de cupón → sin cambios', () => {
    expect(precioSlotEnPuerta({ ...titular, precio: 8 }, { cuponUsado: 'TXEMA' }, evento)).toBe(8);
  });

  it('sin cupón en la reserva → precio guardado', () => {
    expect(precioSlotEnPuerta(titular, { cuponUsado: null }, evento)).toBe(16);
  });

  it('cupón que ya no coincide con el del evento → precio guardado', () => {
    expect(precioSlotEnPuerta(titular, { cuponUsado: 'OTRO' }, evento)).toBe(16);
  });

  it('acompañante nunca lleva cupón', () => {
    expect(precioSlotEnPuerta({ ...titular, tipo: 'acompañante' }, { cuponUsado: 'TXEMA' }, evento)).toBe(16);
  });

  it('titular validado como socio → precio guardado (descuento de socio)', () => {
    expect(precioSlotEnPuerta({ ...titular, estado: 'validado_socio', precio: 12 }, { cuponUsado: 'TXEMA' }, evento)).toBe(12);
  });

  it('precio de cupón mayor que el guardado → no sube el precio', () => {
    expect(precioSlotEnPuerta(titular, { cuponUsado: 'TXEMA' }, { cupon: 'TXEMA', precioCupon: 20 })).toBe(16);
  });
});
