import { describe, it, expect } from 'vitest';
import { indexarPersonas, categoriaPersona, filasListadoEmergencia } from '../../src/lib/listadoEmergencia';

const evento = { id: 'evt-1', titulo: 'Salsa', precio_estandar: 15, precio_descuento: 10 };

const socios = [
  { id: '11111111A', dni: '11111111A', nombre: 'Santxo', email: 'santxo@x.com', estado: 'activo', membresias: { Salsa: '2099-01-01' } },
  { id: '22222222B', dni: '22222222B', nombre: 'Begoña', email: 'bego@x.com', estado: 'activo' },
  { id: '33333333C', dni: '33333333C', nombre: 'Natalia Pedruelo', email: 'Natalia@X.com', estado: 'activo' },
  { id: '44444444D', dni: '44444444D', nombre: 'Baja', email: 'baja@x.com', estado: 'inactivo' },
];
const profesores = [{ id: 'p1', nombre: 'Natalia Pedruelo', email: 'natalia@x.com', activo: true }];
const indice = indexarPersonas(socios, profesores);

describe('categoriaPersona', () => {
  it('socio por DNI aunque la reserva no tuviera descuento', () => {
    expect(categoriaPersona({ dni: '11111111a' }, indice)).toBe('SOCIO/A');
  });
  it('profesora por su email de socia (gana a socia)', () => {
    expect(categoriaPersona({ dni: '33333333C' }, indice)).toBe('PROFESOR/A');
    expect(categoriaPersona({ email: 'NATALIA@x.com' }, indice)).toBe('PROFESOR/A');
  });
  it('socio inactivo y desconocido son NO SOCIO', () => {
    expect(categoriaPersona({ dni: '44444444D' }, indice)).toBe('NO SOCIO');
    expect(categoriaPersona({ dni: '99999999Z' }, indice)).toBe('NO SOCIO');
  });
  it('plaza verificada como socio en puerta cuenta como socio', () => {
    expect(categoriaPersona({ dni: '99999999Z', validadoSocio: true }, indice)).toBe('SOCIO/A');
  });
  it('socio con rol profesor', () => {
    const idx = indexarPersonas([{ id: '5', dni: '5', rol: 'profesor', estado: 'activo' }], []);
    expect(categoriaPersona({ dni: '5' }, idx)).toBe('PROFESOR/A');
  });
});

describe('filasListadoEmergencia', () => {
  const reservas = [
    {
      // Santxo reserva sin precio de socio (su academia no tenía descuento) y Begoña
      // entra como acompañante verificada con carnet en la puerta.
      id: 'r1', ticketID: 'AAA111', nombreTitular: 'Santxo', dniTitular: '11111111A', emailTitular: 'santxo@x.com',
      esSocio: false, acompañantes: 1, numPersonas: 2,
      slots: [
        { tipo: 'titular', estado: 'pendiente', precio: 15, ingresado: true },
        { tipo: 'acompañante', estado: 'validado_socio', precio: 10, ingresado: true, socio_id: '22222222B', socio_nombre: 'Begoña' },
      ],
    },
    {
      id: 'r2', ticketID: 'BBB222', nombreTitular: 'Natalia Pedruelo', dniTitular: '33333333C', emailTitular: 'natalia@x.com',
      esSocio: true, acompañantes: 0, numPersonas: 1,
      slots: [{ tipo: 'titular', estado: 'validado_socio', precio: 10, ingresado: false }],
    },
    { id: 'r3', estado: 'cancelada', nombreTitular: 'Cancelada', dniTitular: 'X', acompañantes: 0, slots: [] },
  ];
  const asistencias = [
    { id: 'a1', eventoId: 'evt-1', reservaId: 'r1', tipo: 'reserva' },
    { id: 'a2', eventoId: 'evt-1', socioId: '11111111A', nombre: 'Covadonga', tipo: 'socio_carnet', precio: 10 },
    { id: 'a3', eventoId: 'evt-1', tipo: 'walk-in', precio: 15 },
  ];

  const res = filasListadoEmergencia({ reservas, asistencias, evento, indice });

  it('categorías reales de titulares y acompañantes', () => {
    expect(res.filas[0][2]).toBe('SOCIO/A');
    expect(res.filas[1][0]).toBe('  ↳ Begoña');
    expect(res.filas[1][1]).toBe('22222222B');
    expect(res.filas[1][2]).toBe('SOCIO/A');
    expect(res.filas[2][2]).toBe('PROFESOR/A');
  });

  it('marca quién está dentro', () => {
    expect(res.filas[0][7]).toBe('DENTRO');
    expect(res.filas[2][7]).toBe('');
  });

  it('incluye entradas sin reserva y omite canceladas y asistencias de reserva', () => {
    expect(res.filas).toHaveLength(5);
    expect(res.filas[3][6]).toBe('CARNET');
    expect(res.filas[4][6]).toBe('TAQUILLA');
    expect(res.filas[4][2]).toBe('NO SOCIO');
    expect(res.filas.some(f => f[0] === 'Cancelada')).toBe(false);
  });

  it('totales', () => {
    expect(res.reservas).toBe(2);
    expect(res.acompanantes).toBe(1);
    expect(res.sinReserva).toBe(2);
    expect(res.totalPersonas).toBe(5);
    expect(res.porCategoria).toEqual({ 'PROFESOR/A': 1, 'SOCIO/A': 3, 'NO SOCIO': 1 });
  });

  it('usa precioSlot para el titular si se pasa', () => {
    const r = filasListadoEmergencia({ reservas: [reservas[0]], asistencias: [], evento, indice, precioSlot: () => 8 });
    expect(r.filas[0][5]).toBe('8€');
  });
});
