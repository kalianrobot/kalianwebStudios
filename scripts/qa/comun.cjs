/**
 * Utilidades compartidas por los escenarios de QA (scripts/qa/escenarios/).
 * Solo se usan contra el proyecto de TEST: ver scripts/qa/sembrar.cjs.
 */
const crypto = require('crypto');

/** Prefijo de todo lo que crea el QA. `limpiar` borra por este prefijo. */
const PREFIJO = 'qa-';

/** Fecha de hoy en Madrid, 'YYYY-MM-DD'. */
function hoyMadrid() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

/** Sufijo corto aleatorio para que dos ejecuciones el mismo día no choquen. */
function sufijo(n = 4) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(n), b => abc[b % abc.length]).join('');
}

/**
 * ticketID de 6 caracteres como los de ReservaForm, empezando por 'Q' para
 * reconocer a simple vista que es de QA. Comprueba que no existe ya.
 */
async function ticketUnico(db, usados) {
  for (let i = 0; i < 20; i++) {
    const t = 'Q' + sufijo(5);
    if (usados.has(t)) continue;
    const snap = await db.collection('reservas').where('ticketID', '==', t).limit(1).get();
    if (snap.empty) { usados.add(t); return t; }
  }
  throw new Error('No se pudo generar un ticketID único');
}

const manageToken = () => crypto.randomBytes(24).toString('hex');
const qrUrl = (t) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=KALIAN-RES-${t}`;

// --- Regla de descuento de socio (copia de src/lib/descuentoSocio.ts) ---
const normalizar = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const ALIAS = { musica: ['music is cool'], danza: ['sbk club', 'club de baile'] };
function tieneDescuento(membresias, academias, hoy) {
  const ok = new Set(academias.map(normalizar));
  if (!membresias) return false;
  return Object.entries(membresias).some(([k, f]) => {
    if (typeof f !== 'string' || f < hoy) return false;
    const n = normalizar(k);
    return ok.has(n) || (ALIAS[n] || []).some(a => ok.has(a));
  });
}

/** Hasta `n` socios activos con descuento en un evento con esas academias. */
async function sociosConDescuento(db, academias, hoy, n) {
  const snap = await db.collection('socios').where('estado', '==', 'activo').limit(200).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.dni && tieneDescuento(s.membresias, academias, hoy))
    .slice(0, n);
}

/** Reparto Kalian/artista de una entrada (igual que la spec de eventos). */
function reparto(precio, aportacion) {
  const kalian = Math.min(aportacion, precio);
  return { bruto: precio, kalian, artista: precio - kalian };
}

/** Borra un evento de QA y todo lo ligado a él por eventoId. */
async function borrarEvento(db, eventoId) {
  const borrados = {};
  for (const col of ['reservas', 'asistencia_eventos', 'finanzas']) {
    const snap = await db.collection(col).where('eventoId', '==', eventoId).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = db.batch();
      snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
    borrados[col] = snap.size;
  }
  await db.collection('eventos').doc(eventoId).delete();
  return borrados;
}

module.exports = { PREFIJO, hoyMadrid, sufijo, ticketUnico, manageToken, qrUrl, sociosConDescuento, reparto, borrarEvento };
