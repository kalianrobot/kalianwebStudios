import { describe, it, expect } from 'vitest';
import {
  plazasAcompanantes,
  slotsDesdeReserva,
  precioSocioEnEvento,
  ingresoEntrada,
  entradaSocioCarnet,
  slotComoSocio,
  marcarSlotIngresado,
  entradaSlotReserva,
  precioWalkIn,
  entradaWalkIn,
  plazasLibres,
  idAsistenciaCarnet,
  hoyPuerta,
} from '../../src/lib/puerta';
import { calcularCierreEvento } from '../../src/lib/cierreEvento';

const evento = {
  id: 'evt-1',
  titulo: 'Jazz',
  categoria: 'musica',
  academias_descuento: ['Music is Cool', 'local'],
  precio_estandar: 15,
  tiene_descuento: true,
  precio_descuento: 10,
  cupon: 'JAZZ',
  precioCupon: 8,
  aportacion_kalian_estandar: 5,
  aportacion_kalian_descuento: 4,
  aportacion_kalian_cupon: 3,
  aforo_maximo: 40,
  aforo_actual: 0,
  aforo_reservado: 0,
};

const titular = (extra: any = {}) => ({ tipo: 'titular', estado: 'pendiente', precio: 15, ingresado: false, nombre: 'Ane', dni: 'X1', ...extra });
const acomp = (extra: any = {}) => ({ tipo: 'acompañante', estado: 'pendiente', precio: 15, ingresado: false, ...extra });

describe('plazasAcompanantes', () => {
  it('usa acompañantes, luego numPersonas y luego slots', () => {
    expect(plazasAcompanantes({ acompañantes: 2 })).toBe(2);
    expect(plazasAcompanantes({ numPersonas: 3 })).toBe(2);
    expect(plazasAcompanantes({ slots: [{}, {}] })).toBe(1);
    expect(plazasAcompanantes({})).toBe(0);
  });
});

describe('slotsDesdeReserva', () => {
  it('corrige el precio del titular con cupón vigente', () => {
    const r = { acompañantes: 1, cuponUsado: 'jazz', slots: [titular(), acomp()] };
    const s = slotsDesdeReserva(r, evento);
    expect(s.map(x => x.precio)).toEqual([8, 15]);
  });

  it('ajusta las plazas a los acompañantes de la reserva', () => {
    const r = { acompañantes: 2, slots: [titular()] };
    expect(slotsDesdeReserva(r, evento)).toHaveLength(3);
  });

  it('construye plazas virtuales para reservas antiguas sin slots', () => {
    const r = { acompañantes: 1, precioPorPersona: 12, nombreTitular: 'Jon', dniTitular: 'D', esSocio: true };
    const s = slotsDesdeReserva(r, evento);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ tipo: 'titular', nombre: 'Jon', estado: 'validado_socio', precio: 12 });
    expect(s[1]).toMatchObject({ tipo: 'acompañante', precio: 12 });
  });
});

describe('precios de socio y de puerta', () => {
  it('precioSocioEnEvento', () => {
    expect(precioSocioEnEvento(evento, true)).toBe(10);
    expect(precioSocioEnEvento(evento, false)).toBe(15);
  });
  it('precioWalkIn', () => {
    expect(precioWalkIn(evento, false)).toBe(15);
    expect(precioWalkIn(evento, true)).toBe(10);
  });
  it('hoyPuerta da YYYY-MM-DD', () => {
    expect(hoyPuerta(new Date('2026-11-10T12:00:00Z'))).toBe('2026-11-10');
  });
});

describe('ingresoEntrada', () => {
  it('devuelve null si la entrada es gratis', () => {
    expect(ingresoEntrada({ evento, precio: 0, origen: 'walkin', esSocio: false, concepto: 'x', metodo: 'Efectivo', socioId: 'anonimo', staffId: 'u' })).toBeNull();
  });
  it('limita la aportación de Kalian al precio cobrado', () => {
    const i = ingresoEntrada({ evento: { ...evento, aportacion_kalian_cupon: 9 }, precio: 8, origen: 'reserva', esSocio: false, esCupon: true, concepto: 'x', metodo: 'Tarjeta', socioId: 'anonimo', staffId: 'u' });
    expect(i).toMatchObject({ monto: 8, monto_bruto: 8, monto_artista: 0, variante_precio: 'cupon', categoria: 'Evento', eventoId: 'evt-1', metodo: 'Tarjeta' });
  });
});

describe('entradaSocioCarnet', () => {
  const socio = { id: 'S1', nombre: 'Socia', membresias: { 'Music is Cool': '2099-01-01' } };

  it('socio con membresía en vigor paga precio de socio', () => {
    const e = entradaSocioCarnet({ evento, socio, hoy: '2026-11-10', metodo: 'Efectivo', staffId: 'u' });
    expect(e.tieneDescuento).toBe(true);
    expect(e.precio).toBe(10);
    expect(e.asistenciaId).toBe('evt-1_S1');
    expect(e.asistencia).toEqual({ eventoId: 'evt-1', socioId: 'S1', nombre: 'Socia', precio: 10, tipo: 'socio_carnet' });
    expect(e.ingreso).toMatchObject({ monto: 4, monto_artista: 6, variante_precio: 'descuento_socio', socio_id: 'S1', concepto: 'Entrada Evento: Jazz (Soci@)' });
  });

  it('membresía caducada paga precio estándar', () => {
    const e = entradaSocioCarnet({ evento, socio: { ...socio, membresias: { 'Music is Cool': '2020-01-01' } }, hoy: '2026-11-10', metodo: 'Efectivo', staffId: 'u' });
    expect(e.tieneDescuento).toBe(false);
    expect(e.precio).toBe(15);
    expect(e.ingreso).toMatchObject({ monto: 5, variante_precio: 'estandar' });
  });

  it('idAsistenciaCarnet', () => {
    expect(idAsistenciaCarnet('e', 's')).toBe('e_s');
  });
});

describe('slotComoSocio', () => {
  it('pasa la plaza a precio de socio y guarda el socio', () => {
    expect(slotComoSocio(acomp(), evento, { id: 'S2', nombre: 'Mikel' })).toMatchObject({
      estado: 'validado_socio', precio: 10, socio_id: 'S2', socio_nombre: 'Mikel', tipo: 'acompañante',
    });
  });
});

describe('marcarSlotIngresado', () => {
  const reserva = { acompañantes: 2, slots: [titular(), acomp(), acomp()] };

  it('marca la plaza, persiste el precio cobrado y deja la reserva pendiente', () => {
    const m = marcarSlotIngresado({ reservaServidor: reserva, evento, slotIdx: 0, slotLocal: titular({ precio: 8 }) })!;
    expect(m.slots[0]).toMatchObject({ ingresado: true, precio: 8 });
    expect(m).toMatchObject({ ingresados: 1, total: 3, estado: 'pendiente' });
  });

  it('guarda la verificación de socio hecha en puerta', () => {
    const m = marcarSlotIngresado({ reservaServidor: reserva, evento, slotIdx: 1, slotLocal: slotComoSocio(acomp(), evento, { id: 'S2', nombre: 'M' }) })!;
    expect(m.slots[1]).toMatchObject({ estado: 'validado_socio', socio_id: 'S2', socio_nombre: 'M', precio: 10, ingresado: true });
  });

  it('valida la reserva cuando entra la última plaza', () => {
    const casi = { acompañantes: 1, slots: [titular({ ingresado: true }), acomp()] };
    expect(marcarSlotIngresado({ reservaServidor: casi, evento, slotIdx: 1, slotLocal: acomp() })!.estado).toBe('validado');
  });

  it('devuelve null si la plaza ya había entrado o no existe', () => {
    const ya = { acompañantes: 0, slots: [titular({ ingresado: true })] };
    expect(marcarSlotIngresado({ reservaServidor: ya, evento, slotIdx: 0, slotLocal: titular() })).toBeNull();
    expect(marcarSlotIngresado({ reservaServidor: ya, evento, slotIdx: 5, slotLocal: titular() })).toBeNull();
  });
});

describe('entradaSlotReserva', () => {
  const reserva = { id: 'R1', ticketID: 'ABC123', cuponUsado: 'JAZZ' };

  it('titular con cupón: variante cupón y aportación de cupón', () => {
    const e = entradaSlotReserva({ evento, reserva, slot: titular({ precio: 8 }), metodo: 'Efectivo', staffId: 'u' });
    expect(e.asistencia).toEqual({
      eventoId: 'evt-1', reservaId: 'R1', ticketID: 'ABC123', slotTipo: 'titular', slotNombre: 'Ane', slotDni: 'X1',
      socioId: null, precio: 8, tipo: 'reserva',
    });
    expect(e.ingreso).toMatchObject({ monto: 3, monto_artista: 5, variante_precio: 'cupon', socio_id: 'anonimo', concepto: 'Entrada Evento: Jazz (titular)' });
  });

  it('el cupón no se aplica a los acompañantes', () => {
    const e = entradaSlotReserva({ evento, reserva, slot: acomp(), metodo: 'Efectivo', staffId: 'u' });
    expect(e.ingreso).toMatchObject({ variante_precio: 'estandar', monto: 5 });
  });

  it('plaza de socio: asistencia reserva_socio y variante de socio', () => {
    const e = entradaSlotReserva({ evento, reserva, slot: slotComoSocio(acomp(), evento, { id: 'S2' }), metodo: 'Tarjeta', staffId: 'u' });
    expect(e.asistencia).toMatchObject({ tipo: 'reserva_socio', socioId: 'S2' });
    expect(e.ingreso).toMatchObject({ variante_precio: 'descuento_socio', monto: 4, socio_id: 'S2', concepto: 'Entrada Evento: Jazz (acompañante Soci@)' });
  });

  it('plaza gratis: asistencia sin movimiento en finanzas', () => {
    const e = entradaSlotReserva({ evento, reserva: { id: 'R2', ticketID: 'T' }, slot: titular({ precio: 0 }), metodo: 'Efectivo', staffId: 'u' });
    expect(e.precio).toBe(0);
    expect(e.ingreso).toBeNull();
  });
});

describe('entradaWalkIn', () => {
  it('normal', () => {
    const e = entradaWalkIn({ evento, precio: 15, socio: null, staff: 'portero', metodo: 'Efectivo', staffId: 'u' });
    expect(e.asistencia).toEqual({ eventoId: 'evt-1', tipo: 'walk-in', staff: 'portero', precio: 15 });
    expect(e.ingreso).toMatchObject({ variante_precio: 'walkin_estandar', monto: 5, socio_id: 'anonimo', concepto: 'Entrada Puerta: Jazz (Walk-in)' });
  });
  it('socio verificado', () => {
    const e = entradaWalkIn({ evento, precio: 10, socio: { id: 'S3', nombre: 'Leire' }, staff: 'admin', metodo: 'Tarjeta', staffId: 'u' });
    expect(e.asistencia).toMatchObject({ socioId: 'S3', nombre: 'Leire', staff: 'admin' });
    expect(e.ingreso).toMatchObject({ variante_precio: 'walkin_socio', monto: 4, socio_id: 'S3', concepto: 'Entrada Puerta: Jazz (Walk-in Soci@)' });
  });
  it('invitación gratis', () => {
    expect(entradaWalkIn({ evento, precio: 0, socio: null, staff: 'portero', metodo: 'Efectivo', staffId: 'u' }).ingreso).toBeNull();
  });
});

describe('plazasLibres', () => {
  it('descuenta los que han entrado y las reservas pendientes, nunca negativo', () => {
    expect(plazasLibres({ aforo_maximo: 40, aforo_actual: 10, aforo_reservado: 5 })).toBe(25);
    expect(plazasLibres({ aforo_maximo: 5, aforo_actual: 4, aforo_reservado: 3 })).toBe(0);
    expect(plazasLibres(null)).toBe(0);
  });
});

/**
 * Flujo completo de una noche: reservas, socio con carnet y entradas en puerta
 * simuladas con la lógica de puerta, y cierre calculado con esos mismos datos.
 * Es lo mismo que hace el escenario de QA `puerta-auto` contra la base de datos de test.
 */
describe('flujo de puerta → cierre del evento', () => {
  it('cuadra caja, reparto y no presentados', () => {
    const reservas: any[] = [
      { id: 'R1', ticketID: 'T1', acompañantes: 2, nombreTitular: 'Ane', dniTitular: 'X1', slots: [titular(), acomp(), acomp()] },
      { id: 'R2', ticketID: 'T2', acompañantes: 1, cuponUsado: 'JAZZ', nombreTitular: 'Mikel', dniTitular: 'X2', slots: [titular({ precio: 8, nombre: 'Mikel' }), acomp()] },
      { id: 'R3', ticketID: 'T3', acompañantes: 0, nombreTitular: 'Jon', dniTitular: 'X3', slots: [titular({ nombre: 'Jon' })] },
    ];
    const asistencias: any[] = [];
    const finanzas: any[] = [];
    let n = 0;
    const apuntar = (e: { asistencia: any; ingreso: any }) => {
      n++;
      asistencias.push({ id: `a${n}`, ...e.asistencia });
      if (e.ingreso) finanzas.push({ id: `f${n}`, ...e.ingreso, deletedAt: null });
    };

    // Entran todas las plazas de R1 y R2; R3 no se presenta.
    for (const r of reservas.slice(0, 2)) {
      const visibles = slotsDesdeReserva(r, evento);
      visibles.forEach((slot, i) => {
        const m = marcarSlotIngresado({ reservaServidor: r, evento, slotIdx: i, slotLocal: slot })!;
        r.slots = m.slots;
        r.estado = m.estado;
        apuntar(entradaSlotReserva({ evento, reserva: r, slot, metodo: 'Efectivo', staffId: 'u' }));
      });
    }
    apuntar(entradaSocioCarnet({ evento, socio: { id: 'S1', nombre: 'Socia', membresias: { local: '2099-12-31' } }, hoy: '2026-11-10', metodo: 'Tarjeta', staffId: 'u' }));
    apuntar(entradaWalkIn({ evento, precio: 15, socio: null, staff: 'portero', metodo: 'Efectivo', staffId: 'u' }));
    apuntar(entradaWalkIn({ evento, precio: 0, socio: null, staff: 'portero', metodo: 'Efectivo', staffId: 'u' }));

    const cierre = calcularCierreEvento({ evento, asistencias, reservas, finanzas });

    // R1 45 + R2 23 + carnet 10 + puerta 15 + invitación 0
    expect(cierre.totales.totalCaja).toBe(93);
    expect(cierre.totales.totalAsistencia).toBe(93);
    expect(cierre.totales.descuadre).toBe(0);
    expect(cierre.totales.totalKalian).toBe(15 + 8 + 4 + 5);
    expect(cierre.totales.totalArtista).toBe(93 - 32);
    expect(cierre.totales.porMetodo).toEqual({ Efectivo: 83, Tarjeta: 10 });
    expect(cierre.entradasQR).toHaveLength(6);
    expect(cierre.entradasWalkIn).toHaveLength(2);
    expect(cierre.reservasNoShow).toEqual([
      expect.objectContaining({ reservaId: 'R3', nombre: 'Jon', precio: 15, estimado: false }),
    ]);
    expect(cierre.recibi.avisos).toEqual([]);
    expect(reservas[0].estado).toBe('validado');
  });
});
