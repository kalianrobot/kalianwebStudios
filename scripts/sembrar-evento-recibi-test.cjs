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
  console.log(`Evento ${EVENTO_ID} sembrado en ${PROJECT}:`, conteo, '+1 entrada sin cobro, +1 pago artista de 50 €');
}

main().catch(err => { console.error(err); process.exit(1); });
