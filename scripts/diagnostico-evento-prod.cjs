/**
 * Temporal y SOLO LECTURA: recuentos agregados de un evento de producción para
 * diagnosticar el Recibí. No imprime nombres, DNIs, emails ni IDs de personas.
 */
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = initializeApp({
  credential: cert(JSON.parse(fs.readFileSync(process.env.SOURCE_CREDENTIALS, 'utf8'))),
  projectId: 'kalianhkg-886a6',
});
const db = getFirestore(app);

const contar = (arr, f) => arr.reduce((acc, x) => { const k = f(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const out = (titulo, obj) => console.log(`\n== ${titulo}\n` + JSON.stringify(obj, null, 1));

async function main() {
  const evSnap = await db.collection('eventos').get();
  const candidatos = evSnap.docs.filter(d => String(d.data().fecha || '').startsWith('2026-10-31'));
  out('Eventos del 31/10', candidatos.map(d => ({ id: d.id, titulo: d.data().titulo })));
  const ev = candidatos.find(d => /maza/i.test(d.data().titulo || ''));
  if (!ev) throw new Error('Evento no encontrado');
  const e = ev.data();
  const FECHA = String(e.fecha).slice(0, 10);
  out('Configuración del evento', {
    categoria: e.categoria, precio_estandar: e.precio_estandar, tiene_descuento: e.tiene_descuento,
    precio_descuento: e.precio_descuento, hayCupon: !!e.cupon, precioCupon: e.precioCupon,
    aportacion_kalian_estandar: e.aportacion_kalian_estandar, aportacion_kalian_descuento: e.aportacion_kalian_descuento,
    aportacion_kalian_cupon: e.aportacion_kalian_cupon, aforo_maximo: e.aforo_maximo, aforo_actual: e.aforo_actual,
    aforo_reservado: e.aforo_reservado, apertura_socios: !!e.apertura_socios,
  });

  const [asis, fin, res] = await Promise.all(['asistencia_eventos', 'finanzas', 'reservas']
    .map(c => db.collection(c).where('eventoId', '==', ev.id).get().then(s => s.docs.map(d => d.data()))));

  out('Asistencia por tipo | precio | con socioId', contar(asis, a => `${a.tipo} | ${a.precio} | socio=${!!a.socioId}`));

  const finEv = fin.filter(f => f.categoria === 'Evento');
  out('Finanzas Evento por variante | bruto | método | borrado', contar(finEv, f => `${f.variante_precio} | ${f.monto_bruto ?? f.monto} | ${f.metodo} | borrado=${!!f.deletedAt}`));
  out('Finanzas otras categorías', contar(fin.filter(f => f.categoria !== 'Evento'), f => `${f.categoria} | ${f.monto} | borrado=${!!f.deletedAt}`));

  const vivos = res.filter(r => r.estado !== 'cancelada' && r.estado !== 'anulada');
  out('Reservas', {
    total: res.length, vivas: vivos.length,
    esSocio: vivos.filter(r => r.esSocio).length,
    conCupon: vivos.filter(r => r.cuponUsado).length,
    conDni: vivos.filter(r => r.dniTitular && r.dniTitular !== 'INVITADO').length,
    logueadas: vivos.filter(r => r.uidTitular && r.uidTitular !== 'invitado').length,
    precioVerificadoFalse: vivos.filter(r => r.precioVerificado === false).length,
  });
  const slots = vivos.flatMap(r => (r.slots || []).map(s => ({ ...s, _r: r })));
  out('Slots por tipo | estado | precio | ingresado', contar(slots, s => `${s.tipo} | ${s.estado} | ${s.precio} | ${!!s.ingresado}`));

  // ¿Titulares que eran socios con membresía vigente pero la reserva no les aplicó el descuento?
  let sociosVigentesNoMarcados = 0, ingresadosDeEsos = 0, sociosEnDb = 0;
  for (const r of vivos) {
    const dni = String(r.dniTitular || '').trim().toUpperCase();
    if (!dni || dni === 'INVITADO') continue;
    const s = await db.collection('socios').doc(dni).get();
    if (!s.exists) continue;
    sociosEnDb++;
    const m = s.data().membresias || {};
    const vigente = (m.musica || '') >= FECHA || (m.local || '') >= FECHA;
    const titular = (r.slots || [])[0] || {};
    if (vigente && titular.estado !== 'validado_socio') {
      sociosVigentesNoMarcados++;
      if (titular.ingresado) ingresadosDeEsos++;
    }
  }
  out('Titulares de reserva que son socios', { conDocSocio: sociosEnDb, vigentesSinDescuentoEnReserva: sociosVigentesNoMarcados, deEllosIngresados: ingresadosDeEsos });

  const caja = await db.collection('caja_eventos').doc(FECHA.slice(0, 7)).get();
  out('caja_eventos del mes', { total: caja.exists ? caja.data().total : null });
}

main().catch(err => { console.error(err.message); process.exit(1); });
