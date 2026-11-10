/**
 * Siembra en el proyecto de TEST un evento de HOY con descuento de socio y
 * cupón, y 4 reservas SIN validar, para probar el Control de Acceso (puerta)
 * y luego la contabilidad / PDF de cierre / Recibí del artista.
 *
 * Reproduce lo que escribe ReservaForm (reservas con slots, ingresado=false).
 * Idempotente: borra reservas/asistencia/finanzas del mismo eventoId y recrea.
 *
 * Uso: TARGET_PROJECT=<id-test> TARGET_CREDENTIALS=<sa.json> NODE_PATH=functions/node_modules \
 *      node scripts/sembrar-reservas-puerta-test.cjs
 */
const fs = require('fs');
const crypto = require('crypto');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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

const HOY = '2026-11-10';
const EVENTO_ID = `${HOY}-prueba-puerta`;

const evento = {
  titulo: 'PRUEBA Puerta - Concierto de test',
  descripcion: 'Evento de prueba para el Control de Acceso y la contabilidad. No es real.',
  fecha: `${HOY}T19:00`,
  fecha_fin: `${HOY}T23:59`,
  hora_fin: '23:59',
  categoria: 'musica',
  sala: 'Kalian Hub',
  artista: 'Banda de Prueba',
  aforo_maximo: 40,
  aforo_actual: 0,
  max_acompanantes: 3,
  precio_estandar: 15,
  tiene_descuento: true,
  precio_descuento: 10,
  cupon: 'PUERTA',
  precioCupon: 8,
  fechaCupon: '2026-11-01T00:00',
  apertura_socios: '2026-11-01T00:00',
  apertura_general: '2026-11-01T00:00',
  aportacion_kalian_estandar: 5,
  aportacion_kalian_descuento: 4,
  aportacion_kalian_cupon: 3,
  imagenUrl: '',
};

const token = () => crypto.randomBytes(24).toString('hex');
const qr = (t) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=KALIAN-RES-${t}`;

async function main() {
  for (const col of ['reservas', 'asistencia_eventos', 'finanzas']) {
    const snap = await db.collection(col).where('eventoId', '==', EVENTO_ID).get();
    const b = db.batch();
    snap.docs.forEach(d => b.delete(d.ref));
    if (!snap.empty) await b.commit();
    console.log(`${col}: borrados ${snap.size}`);
  }

  // Un socio activo real de test (datos anonimizados) para la reserva con precio de socio.
  let socio = null;
  const sSnap = await db.collection('socios').where('estado', '==', 'activo').limit(1).get();
  if (!sSnap.empty) socio = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() };

  // [ticket, nombre, dni, email, cupón, esSocio, nº acompañantes]
  const defs = [
    ['TEST01', 'Ane Prueba', 'PRUEBA01', 'ane@example.com', null, false, 2],
    ['TEST02', 'Mikel Prueba', 'PRUEBA02', 'mikel@example.com', 'PUERTA', false, 1],
    ['TEST03', 'Jon Prueba', 'PRUEBA03', 'jon@example.com', null, false, 0],
  ];
  if (socio) {
    defs.push(['TEST04', socio.nombre || 'Socio prueba', (socio.dni || 'PRUEBA04').toUpperCase(), socio.email || 'socio@example.com', null, true, 1]);
  } else {
    defs.push(['TEST04', 'Leire Prueba', 'PRUEBA04', 'leire@example.com', 'PUERTA', false, 3]);
  }

  const batch = db.batch();
  let plazas = 0;
  const resumen = [];
  defs.forEach(([ticket, nombre, dni, email, cupon, esSocio, acomp], i) => {
    const precioTitular = esSocio ? evento.precio_descuento : cupon ? evento.precioCupon : evento.precio_estandar;
    const slots = [{
      dni, nombre, email, tipo: 'titular',
      estado: esSocio ? 'validado_socio' : 'pendiente',
      precio: precioTitular, ingresado: false,
      ...(esSocio ? { socio_id: socio.id, socio_nombre: nombre } : {}),
    }];
    for (let k = 0; k < acomp; k++) {
      slots.push({ tipo: 'acompañante', estado: 'pendiente', precio: evento.precio_estandar, ingresado: false });
    }
    const total = slots.reduce((a, s) => a + s.precio, 0);
    plazas += slots.length;
    batch.set(db.collection('reservas').doc(`prueba-puerta-r${i + 1}`), {
      eventoId: EVENTO_ID,
      eventoTitulo: evento.titulo,
      categoria: 'musica',
      uidTitular: 'invitado',
      dniTitular: dni,
      nombreTitular: nombre,
      emailTitular: email,
      ticketID: ticket,
      manageToken: token(),
      qrUrl: qr(ticket),
      numPersonas: slots.length,
      totalPagar: total,
      fechaReserva: new Date().toISOString(),
      fechaActividad: evento.fecha,
      slots,
      totalPendiente: slots.reduce((a, s) => a + (s.estado === 'pendiente' ? s.precio : 0), 0),
      esCurso: false,
      acompañantes: acomp,
      asistentes_ingresados: 0,
      cuponUsado: cupon,
      esSocio,
      precioVerificado: true,
    });
    resumen.push(`${ticket} | ${nombre} | ${slots.length} personas | ${slots.map(s => s.precio).join('+')} = ${total} EUR${cupon ? ' | cupón ' + cupon : ''}${esSocio ? ' | socio' : ''}`);
  });

  batch.set(db.collection('eventos').doc(EVENTO_ID), { ...evento, aforo_reservado: plazas });
  await batch.commit();

  console.log(`\nEvento ${EVENTO_ID} sembrado en ${PROJECT} (aforo_reservado=${plazas}):`);
  resumen.forEach(l => console.log('  ' + l));
}

main().catch(err => { console.error(err); process.exit(1); });
