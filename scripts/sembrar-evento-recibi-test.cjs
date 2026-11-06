/**
 * Siembra en el proyecto de TEST un evento pasado inventado con entradas de
 * todos los tipos, para probar el "Recibí para el artista".
 *
 * Idempotente: borra lo que hubiera de una ejecución anterior (mismo eventoId)
 * y lo vuelve a crear. Solo toca docs ligados a EVENTO_ID.
 *
 * Uso: TARGET_PROJECT=<id-test> TARGET_CREDENTIALS=<sa.json> NODE_PATH=functions/node_modules \
 *      node scripts/sembrar-evento-recibi-test.cjs
 */
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const PROJECT = process.env.TARGET_PROJECT;
if (!PROJECT || PROJECT === 'kalianhkg-886a6') {
  console.error('TARGET_PROJECT vacío o es producción. Abortado.');
  process.exit(1);
}

const app = initializeApp({
  credential: cert(JSON.parse(fs.readFileSync(process.env.TARGET_CREDENTIALS, 'utf8'))),
  projectId: PROJECT,
});
const db = getFirestore(app);

const EVENTO_ID = '2026-10-31-prueba-recibi-artista';
const INICIO = new Date('2026-10-31T21:00:00+01:00');
const ts = (min) => Timestamp.fromDate(new Date(INICIO.getTime() + min * 60000));

const evento = {
  titulo: 'PRUEBA Recibí - Concierto inventado',
  descripcion: 'Evento de prueba para el Recibí del artista. No es real.',
  fecha: '2026-10-31T21:00',
  fecha_fin: '2026-10-31T23:30',
  hora_fin: '23:30',
  categoria: 'musica',
  sala: 'Kalian Hub',
  artista: 'Los Inventados',
  aforo_maximo: 60,
  aforo_reservado: 0,
  aforo_actual: 28,
  max_acompanantes: 3,
  precio_estandar: 16,
  tiene_descuento: true,
  precio_descuento: 12,
  cupon: 'PRUEBA',
  precioCupon: 8,
  fechaCupon: '2026-10-01T00:00',
  aportacion_kalian_estandar: 5,
  aportacion_kalian_descuento: 5,
  aportacion_kalian_cupon: 3,
  imagenUrl: '',
};

const aportacion = { estandar: 5, descuento_socio: 5, walkin_estandar: 5, walkin_socio: 5, cupon: 3 };

// [tipo asistencia, variante, precio, método, número de entradas]
const lotes = [
  ['reserva', 'estandar', 16, 'Efectivo', 6],
  ['reserva', 'estandar', 16, 'Tarjeta', 4],
  ['reserva_socio', 'descuento_socio', 12, 'Efectivo', 3],
  ['socio_carnet', 'descuento_socio', 12, 'Tarjeta', 1],
  ['reserva', 'cupon', 8, 'Efectivo', 2],
  ['walk-in', 'walkin_estandar', 16, 'Efectivo', 3],
  ['walk-in', 'walkin_socio', 12, 'Efectivo', 2],
  ['walk-in', 'gratis', 0, null, 3],
  // Simula una entrada con cupón cobrada a precio completo (fallo antiguo): aviso de precio.
  ['reserva', 'cupon', 16, 'Efectivo', 1],
];

async function borrarAnterior() {
  for (const col of ['asistencia_eventos', 'finanzas', 'reservas']) {
    const snap = await db.collection(col).where('eventoId', '==', EVENTO_ID).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
    console.log(`${col}: borrados ${snap.size}`);
  }
}

async function main() {
  await borrarAnterior();
  const batch = db.batch();
  batch.set(db.collection('eventos').doc(EVENTO_ID), evento);

  let n = 0;
  const conteo = {};
  for (const [tipo, variante, precio, metodo, cantidad] of lotes) {
    for (let i = 0; i < cantidad; i++) {
      n++;
      const id = `prueba-recibi-${String(n).padStart(2, '0')}`;
      batch.set(db.collection('asistencia_eventos').doc(id), {
        eventoId: EVENTO_ID,
        tipo,
        precio,
        fecha: ts(n),
        ...(tipo === 'walk-in' ? { staff: 'portero' } : {}),
        ...(tipo !== 'walk-in' ? { slotNombre: `Asistente prueba ${n}` } : {}),
      });
      if (precio > 0) {
        const kalian = Math.min(aportacion[variante], precio);
        batch.set(db.collection('finanzas').doc(id), {
          eventoId: EVENTO_ID,
          categoria: 'Evento',
          concepto: `Entrada Evento: ${evento.titulo} (prueba ${n})`,
          monto: kalian,
          monto_bruto: precio,
          monto_artista: precio - kalian,
          variante_precio: variante,
          metodo,
          socio_id: 'anonimo',
          staff_id: 'script-prueba',
          fecha: ts(n),
          deletedAt: null,
        });
      }
      conteo[variante] = (conteo[variante] || 0) + 1;
    }
  }

  // Entrada de pago registrada en puerta sin su cobro en contabilidad: aviso de diferencia.
  n++;
  batch.set(db.collection('asistencia_eventos').doc(`prueba-recibi-${n}`), {
    eventoId: EVENTO_ID, tipo: 'walk-in', precio: 16, fecha: ts(n), staff: 'portero',
  });

  // Adelanto ya entregado al artista: el pendiente debe bajar en 50 €.
  batch.set(db.collection('finanzas').doc('prueba-recibi-pago-artista'), {
    eventoId: EVENTO_ID,
    categoria: 'Pago Artista',
    concepto: `Pago artista: ${evento.titulo}`,
    monto: -50,
    metodo: 'Efectivo',
    staff_id: 'script-prueba',
    fecha: ts(200),
    deletedAt: null,
  });

  // Una reserva no presentada, para que el PDF de cierre también tenga contenido.
  batch.set(db.collection('reservas').doc('prueba-recibi-noshow'), {
    eventoId: EVENTO_ID,
    eventoTitulo: evento.titulo,
    categoria: 'musica',
    uidTitular: 'invitado',
    dniTitular: '00000000T',
    nombreTitular: 'No presentado prueba',
    emailTitular: 'noshow@example.com',
    ticketID: 'PRUEBA',
    numPersonas: 1,
    totalPagar: 16,
    totalPendiente: 16,
    fechaReserva: '2026-10-20T10:00:00.000Z',
    fechaActividad: evento.fecha,
    slots: [{ tipo: 'titular', estado: 'pendiente', precio: 16, ingresado: false, dni: '00000000T', nombre: 'No presentado prueba' }],
    esCurso: false,
    acompañantes: 0,
    asistentes_ingresados: 0,
    cuponUsado: null,
    esSocio: false,
  });

  await batch.commit();
  console.log(`Evento ${EVENTO_ID} sembrado en ${PROJECT}:`, JSON.stringify(conteo), '+1 entrada sin cobro, +1 pago artista de 50 €');

  await sembrarEventoCompleto();
}

/**
 * Evento 2: flujo completo y SIN errores, reproduciendo lo que escriben
 * ReservaForm (reservas con slots) y ControlAcceso (asistencia + finanzas).
 * El Recibí debe salir sin avisos y el cierre sin descuadre.
 */
const EVENTO2_ID = '2026-11-05-prueba-recibi-completo';
const INICIO2 = new Date('2026-11-05T21:00:00+01:00');
const ts2 = (min) => Timestamp.fromDate(new Date(INICIO2.getTime() + min * 60000));

const evento2 = {
  titulo: 'PRUEBA 2 - Noche de jazz inventada',
  descripcion: 'Evento de prueba para el Recibí del artista. No es real.',
  fecha: '2026-11-05T21:00',
  fecha_fin: '2026-11-05T23:30',
  hora_fin: '23:30',
  categoria: 'musica',
  sala: 'Kalian Hub',
  artista: 'Trío Ficticio',
  aforo_maximo: 50,
  max_acompanantes: 3,
  precio_estandar: 15,
  tiene_descuento: true,
  precio_descuento: 10,
  cupon: 'JAZZ',
  precioCupon: 9,
  fechaCupon: '2026-10-15T00:00',
  aportacion_kalian_estandar: 6,
  aportacion_kalian_descuento: 4,
  aportacion_kalian_cupon: 3,
  imagenUrl: '',
};

const APORT2 = { estandar: 6, walkin_estandar: 6, descuento_socio: 4, walkin_socio: 4, cupon: 3 };

// Reservas: [id, ticket, cupón, método, slots[{tipo, estado, precio, entra}]]
const reservas2 = [
  ['r1', 'PRB001', null, 'Tarjeta', [
    { tipo: 'titular', estado: 'pendiente', precio: 15, entra: true },
    { tipo: 'acompañante', estado: 'pendiente', precio: 15, entra: true },
    { tipo: 'acompañante', estado: 'pendiente', precio: 15, entra: true },
  ]],
  ['r2', 'PRB002', 'JAZZ', 'Efectivo', [
    { tipo: 'titular', estado: 'pendiente', precio: 9, entra: true },
    { tipo: 'acompañante', estado: 'pendiente', precio: 15, entra: true },
  ]],
  ['r3', 'PRB003', null, 'Efectivo', [
    { tipo: 'titular', estado: 'validado_socio', precio: 10, entra: true },
    { tipo: 'acompañante', estado: 'pendiente', precio: 15, entra: true },
  ]],
  ['r4', 'PRB004', 'JAZZ', 'Transferencia', [
    { tipo: 'titular', estado: 'pendiente', precio: 9, entra: true },
  ]],
  ['r5', 'PRB005', null, 'Tarjeta', [
    { tipo: 'titular', estado: 'validado_socio', precio: 10, entra: true },
  ]],
  ['r6', 'PRB006', null, 'Efectivo', [
    { tipo: 'titular', estado: 'pendiente', precio: 15, entra: false },
  ]],
  ['r7', 'PRB007', null, 'Efectivo', [
    { tipo: 'titular', estado: 'pendiente', precio: 15, entra: true },
    { tipo: 'acompañante', estado: 'pendiente', precio: 15, entra: false },
  ]],
  // Invitación: reserva a 0 €
  ['r8', 'PRB008', null, 'Efectivo', [
    { tipo: 'titular', estado: 'pendiente', precio: 0, entra: true },
  ]],
];

const variante2 = ({ precio, origen, esSocio, esCupon }) => {
  if (precio <= 0) return 'gratis';
  if (origen === 'walkin') return esSocio ? 'walkin_socio' : 'walkin_estandar';
  if (esSocio) return 'descuento_socio';
  if (origen === 'reserva' && esCupon) return 'cupon';
  return 'estandar';
};

async function sembrarEventoCompleto() {
  for (const col of ['asistencia_eventos', 'finanzas', 'reservas']) {
    const snap = await db.collection(col).where('eventoId', '==', EVENTO2_ID).get();
    const b = db.batch();
    snap.docs.forEach(d => b.delete(d.ref));
    if (!snap.empty) await b.commit();
  }

  const batch = db.batch();
  let min = 0;
  let aforoActual = 0;
  let aforoReservado = 0;
  const conteo = {};

  const cobrar = (id, { precio, variante, metodo, socioId, concepto }) => {
    conteo[variante] = (conteo[variante] || 0) + 1;
    if (precio <= 0) return;
    const kalian = Math.min(APORT2[variante], precio);
    batch.set(db.collection('finanzas').doc(id), {
      eventoId: EVENTO2_ID, categoria: 'Evento', concepto,
      monto: kalian, monto_bruto: precio, monto_artista: precio - kalian, variante_precio: variante,
      metodo, socio_id: socioId || 'anonimo', staff_id: 'script-prueba', fecha: ts2(min), deletedAt: null,
    });
  };

  reservas2.forEach(([rid, ticket, cupon, metodo, slots], ri) => {
    const reservaId = `prueba2-${rid}`;
    const slotsGuardados = slots.map((s, si) => {
      const esTitular = si === 0;
      const nombre = esTitular ? `Titular prueba ${ri + 1}` : `Acompañante ${si} prueba ${ri + 1}`;
      const dni = esTitular ? `PRUEBA${String(ri + 1).padStart(2, '0')}` : null;
      const socioId = s.estado === 'validado_socio' ? `SOCIOPRB${ri + 1}` : null;
      if (s.entra) {
        min++;
        aforoActual++;
        const id = `prueba2-${rid}-s${si}`;
        const esSocio = s.estado === 'validado_socio';
        batch.set(db.collection('asistencia_eventos').doc(id), {
          eventoId: EVENTO2_ID, reservaId, ticketID: ticket, slotTipo: s.tipo,
          slotNombre: nombre, slotDni: dni, socioId, fecha: ts2(min), precio: s.precio,
          tipo: esSocio ? 'reserva_socio' : 'reserva',
        });
        cobrar(id, {
          precio: s.precio,
          variante: variante2({ precio: s.precio, origen: 'reserva', esSocio, esCupon: esTitular && !!cupon }),
          metodo, socioId,
          concepto: `Entrada Evento: ${evento2.titulo} (${s.tipo}${esSocio ? ' Soci@' : ''})`,
        });
      } else {
        aforoReservado++;
      }
      return {
        tipo: s.tipo, estado: s.estado, precio: s.precio, ingresado: s.entra,
        ...(esTitular ? { nombre, dni, email: `prueba${ri + 1}@example.com` } : {}),
        ...(socioId ? { socio_id: socioId, socio_nombre: nombre } : {}),
      };
    });
    const ingresados = slotsGuardados.filter(s => s.ingresado).length;
    batch.set(db.collection('reservas').doc(reservaId), {
      eventoId: EVENTO2_ID, eventoTitulo: evento2.titulo, categoria: 'musica',
      uidTitular: 'invitado', dniTitular: `PRUEBA${String(ri + 1).padStart(2, '0')}`,
      nombreTitular: `Titular prueba ${ri + 1}`, emailTitular: `prueba${ri + 1}@example.com`,
      ticketID: ticket, numPersonas: slots.length,
      totalPagar: slots.reduce((acc, s) => acc + s.precio, 0),
      totalPendiente: slotsGuardados.reduce((acc, s) => acc + (!s.ingresado && s.estado === 'pendiente' ? s.precio : 0), 0),
      fechaReserva: '2026-10-25T10:00:00.000Z', fechaActividad: evento2.fecha,
      slots: slotsGuardados, esCurso: false, acompañantes: slots.length - 1,
      asistentes_ingresados: ingresados, estado: ingresados >= slots.length ? 'validado' : 'pendiente',
      cuponUsado: cupon, esSocio: slots[0].estado === 'validado_socio', precioVerificado: true,
    });
  });

  // Socios que entran con el carnet (sin reserva): precio de socio.
  for (let i = 1; i <= 2; i++) {
    min++; aforoActual++;
    const id = `prueba2-carnet-${i}`;
    batch.set(db.collection('asistencia_eventos').doc(id), {
      eventoId: EVENTO2_ID, socioId: `SOCIOCARNET${i}`, nombre: `Socio carnet prueba ${i}`,
      fecha: ts2(min), precio: 10, tipo: 'socio_carnet',
    });
    cobrar(id, { precio: 10, variante: 'descuento_socio', metodo: 'Efectivo', socioId: `SOCIOCARNET${i}`, concepto: `Entrada Evento: ${evento2.titulo} (Soci@)` });
  }

  // Puerta sin reserva: 3 normales, 2 socios, 2 invitaciones gratis.
  const walkins = [
    [15, false, 'Efectivo'], [15, false, 'Tarjeta'], [15, false, 'Efectivo'],
    [10, true, 'Efectivo'], [10, true, 'Tarjeta'],
    [0, false, null], [0, false, null],
  ];
  walkins.forEach(([precio, esSocio, metodo], i) => {
    min++; aforoActual++;
    const id = `prueba2-puerta-${i + 1}`;
    batch.set(db.collection('asistencia_eventos').doc(id), {
      eventoId: EVENTO2_ID, tipo: 'walk-in', fecha: ts2(min), staff: 'portero', precio,
      ...(esSocio ? { socioId: `SOCIOPUERTA${i}`, nombre: `Socio puerta prueba ${i}` } : {}),
    });
    cobrar(id, {
      precio, variante: variante2({ precio, origen: 'walkin', esSocio }), metodo,
      socioId: esSocio ? `SOCIOPUERTA${i}` : null,
      concepto: `Entrada Puerta: ${evento2.titulo} (Walk-in${esSocio ? ' Soci@' : ''})`,
    });
  });

  // Adelanto de 30 € al artista.
  batch.set(db.collection('finanzas').doc('prueba2-pago-artista'), {
    eventoId: EVENTO2_ID, categoria: 'Pago Artista', concepto: `Pago artista: ${evento2.titulo}`,
    monto: -30, metodo: 'Efectivo', staff_id: 'script-prueba', fecha: ts2(300), deletedAt: null,
  });

  batch.set(db.collection('eventos').doc(EVENTO2_ID), { ...evento2, aforo_actual: aforoActual, aforo_reservado: aforoReservado });
  await batch.commit();
  console.log(`Evento ${EVENTO2_ID} sembrado:`, JSON.stringify(conteo), `aforo_actual=${aforoActual} aforo_reservado=${aforoReservado}`);
}

main().catch(err => { console.error(err); process.exit(1); });
