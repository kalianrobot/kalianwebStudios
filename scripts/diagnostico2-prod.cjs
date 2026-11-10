/** Temporal y SOLO LECTURA: recuentos agregados, sin datos personales. */
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const EVENTO_ID = '2026-10-17-KALIAN-JUZZ-CLUB-PERICO-SANBEAT';
const app = initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.SOURCE_CREDENTIALS, 'utf8'))), projectId: 'kalianhkg-886a6' });
const db = getFirestore(app);
const contar = (arr, f) => arr.reduce((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a; }, {});
const out = (t, o) => console.log(`\n== ${t}\n` + JSON.stringify(o, null, 1));

async function main() {
  // 1. Entradas de más por reserva en el evento del 31/10
  const res = (await db.collection('reservas').where('eventoId', '==', EVENTO_ID).get()).docs;
  const asis = (await db.collection('asistencia_eventos').where('eventoId', '==', EVENTO_ID).get()).docs.map(d => d.data());
  const porReserva = contar(asis.filter(a => a.reservaId), a => a.reservaId);
  const exceso = res.map(r => ({ personas: r.data().numPersonas, entradas: porReserva[r.id] || 0 })).filter(x => x.entradas > x.personas);
  out('Reservas con más entradas registradas que personas', { reservas: exceso.length, entradasDeMas: exceso.reduce((a, x) => a + x.entradas - x.personas, 0) });
  const mismoSegundo = contar(asis.filter(a => a.reservaId), a => `${a.reservaId}|${a.slotTipo}|${Math.floor(a.fecha.toMillis() / 1000)}`);
  out('Entradas duplicadas (misma reserva, mismo tipo, mismo segundo)', Object.values(mismoSegundo).filter(n => n > 1).reduce((a, n) => a + n - 1, 0));

  // 2. Mismo análisis en todos los eventos con entradas
  const todas = (await db.collection('asistencia_eventos').get()).docs.map(d => d.data()).filter(a => a.reservaId);
  const reservasIds = [...new Set(todas.map(a => a.reservaId))];
  const resDocs = await Promise.all(reservasIds.map(id => db.collection('reservas').doc(id).get()));
  const porRes = contar(todas, a => a.reservaId);
  const porEvento = {};
  resDocs.forEach(r => {
    if (!r.exists) return;
    const n = porRes[r.id] - (r.data().numPersonas || 1);
    if (n > 0) porEvento[r.data().eventoId] = (porEvento[r.data().eventoId] || 0) + n;
  });
  out('Entradas de más por evento (todos los eventos)', porEvento);

  // 3. Claves de membresía en socios y categorías de cursos
  const socios = (await db.collection('socios').get()).docs.map(d => d.data());
  out('Socios por clave de membresía', contar(socios.flatMap(s => Object.keys(s.membresias || {})), k => k));
  const cursos = (await db.collection('cursos').get()).docs.map(d => d.data());
  out('Cursos por categoria', contar(cursos, c => String(c.categoria)));
  const hoy = new Date().toISOString().slice(0, 10);
  out('Socios con membresía vigente pero sin clave musica/danza/local', socios.filter(s => {
    const m = s.membresias || {};
    const vig = Object.entries(m).filter(([, f]) => (f || '') >= hoy).map(([k]) => k);
    return vig.length > 0 && !vig.some(k => ['musica', 'danza', 'local'].includes(k));
  }).length);
}
main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
