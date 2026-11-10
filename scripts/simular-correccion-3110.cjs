/** Temporal, SOLO LECTURA: estado de la reserva 3X6629 del 31/10, sin datos personales. */
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const EVENTO_ID = '2026-10-17-KALIAN-JUZZ-CLUB-PERICO-SANBEAT';
const app = initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.SOURCE_CREDENTIALS, 'utf8'))), projectId: 'kalianhkg-886a6' });
const db = getFirestore(app);

async function main() {
  const rs = (await db.collection('reservas').where('ticketID', '==', '3X6629').get()).docs.filter(d => d.data().eventoId === EVENTO_ID);
  if (rs.length !== 1) throw new Error('reservas encontradas: ' + rs.length);
  const r = rs[0].data();
  console.log('Reserva:', JSON.stringify({ numPersonas: r.numPersonas, acompañantes: r.acompañantes, totalPagar: r.totalPagar, asistentes_ingresados: r.asistentes_ingresados, estado: r.estado, slots: (r.slots || []).map(s => ({ tipo: s.tipo, estado: s.estado, precio: s.precio, ingresado: !!s.ingresado })) }));
  const asis = (await db.collection('asistencia_eventos').where('reservaId', '==', rs[0].id).get()).docs.map(d => ({ tipo: d.data().slotTipo, precio: d.data().precio, t: d.data().fecha.toMillis() }));
  console.log('Asistencias:', JSON.stringify(asis.map(a => ({ tipo: a.tipo, precio: a.precio, hora: new Date(a.t).toISOString() }))));
  const tMin = Math.min(...asis.map(a => a.t)) - 5000, tMax = Math.max(...asis.map(a => a.t)) + 5000;
  const fin = (await db.collection('finanzas').where('eventoId', '==', EVENTO_ID).get()).docs.map(d => d.data())
    .filter(f => f.categoria === 'Evento' && f.fecha.toMillis() >= tMin && f.fecha.toMillis() <= tMax);
  console.log('Cobros ±5 s:', JSON.stringify(fin.map(f => ({ variante: f.variante_precio, bruto: f.monto_bruto, metodo: f.metodo, borrado: !!f.deletedAt, hora: f.fecha.toDate().toISOString() }))));
  // ¿Se cambiaron los acompañantes después de reservar? Otras reservas del evento con más plazas que personas:
  const todas = (await db.collection('reservas').where('eventoId', '==', EVENTO_ID).get()).docs.map(d => d.data());
  console.log('Reservas del evento con más plazas (slots) que personas:', todas.filter(x => (x.slots || []).length > (x.numPersonas || 1)).length);
}
main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
