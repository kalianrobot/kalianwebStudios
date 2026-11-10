/**
 * Temporal y SOLO LECTURA: datos de la persona socia del evento del 31/10.
 * Todo sale cifrado con scripts/clave-publica-temporal.pem (repo público).
 */
const fs = require('fs');
const crypto = require('crypto');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const EVENTO_ID = '2026-10-17-KALIAN-JUZZ-CLUB-PERICO-SANBEAT';
const app = initializeApp({
  credential: cert(JSON.parse(fs.readFileSync(process.env.SOURCE_CREDENTIALS, 'utf8'))),
  projectId: 'kalianhkg-886a6',
});
const db = getFirestore(app);

async function main() {
  const reservas = (await db.collection('reservas').where('eventoId', '==', EVENTO_ID).get()).docs;
  const out = [];
  for (const r of reservas) {
    const d = r.data();
    const dni = String(d.dniTitular || '').trim().toUpperCase();
    if (!dni || dni === 'INVITADO') continue;
    const s = await db.collection('socios').doc(dni).get();
    if (!s.exists) continue;
    const sd = s.data();
    const asis = (await db.collection('asistencia_eventos').where('reservaId', '==', r.id).get()).docs.map(a => a.data());
    out.push({
      reserva: { nombre: d.nombreTitular, dni, email: d.emailTitular, ticket: d.ticketID, personas: d.numPersonas, totalPagar: d.totalPagar, fechaReserva: d.fechaReserva },
      entradas: asis.map(a => ({ tipo: a.slotTipo, nombre: a.slotNombre, precio: a.precio, hora: a.fecha?.toDate().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) })),
      ficha_socio: { nombre: sd.nombre, estado: sd.estado, membresias: sd.membresias || {}, cursos: (sd.cursos || []).length, localId: sd.localId || null },
    });
  }
  const texto = Buffer.from(JSON.stringify(out));
  // Cifrado híbrido: AES-256-GCM para el contenido, RSA-OAEP para la clave.
  const clave = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const datos = Buffer.concat([c.update(texto), c.final()]);
  const pub = fs.readFileSync(__dirname + '/clave-publica-temporal.pem', 'utf8');
  const claveCifrada = crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, clave);
  console.log('CIFRADO=' + [claveCifrada, iv, c.getAuthTag(), datos].map(b => b.toString('base64')).join('.'));
}
main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
