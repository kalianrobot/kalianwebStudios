/**
 * Temporal: corrige en producción la entrada del único socio del evento del
 * 31/10 (Pablo Maza), que pagó 10 € pero se registró como entrada normal a 15 €.
 * APLICAR=true para escribir; por defecto solo muestra lo que haría.
 * No imprime datos personales.
 */
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const APLICAR = process.env.APLICAR === 'true';
const EVENTO_ID = '2026-10-17-KALIAN-JUZZ-CLUB-PERICO-SANBEAT';

const app = initializeApp({
  credential: cert(JSON.parse(fs.readFileSync(process.env.SOURCE_CREDENTIALS, 'utf8'))),
  projectId: 'kalianhkg-886a6',
});
const db = getFirestore(app);

async function main() {
  const ev = (await db.collection('eventos').doc(EVENTO_ID).get()).data();
  const precioSocio = Number(ev.precio_descuento);
  const kalianSocio = Math.min(Number(ev.aportacion_kalian_descuento ?? 5), precioSocio);
  const fecha = String(ev.fecha).slice(0, 10);

  const reservas = (await db.collection('reservas').where('eventoId', '==', EVENTO_ID).get()).docs;
  const conSocio = [];
  for (const r of reservas) {
    const dni = String(r.data().dniTitular || '').trim().toUpperCase();
    if (!dni || dni === 'INVITADO') continue;
    const s = await db.collection('socios').doc(dni).get();
    if (s.exists) conSocio.push({ r, socioId: s.id, membresias: s.data().membresias || {} });
  }
  console.log('Reservas cuyo titular es socio:', conSocio.length);
  if (conSocio.length !== 1) throw new Error('Se esperaba exactamente 1. No se toca nada.');
  const { r, socioId, membresias } = conSocio[0];
  const reserva = r.data();
  const titular = (reserva.slots || [])[0];
  console.log('Membresía música/local vigente el día del evento:',
    (membresias.musica || '') >= fecha || (membresias.local || '') >= fecha,
    '| música hasta', membresias.musica || '—', '| local hasta', membresias.local || '—');
  console.log('Titular:', { estado: titular?.estado, precio: titular?.precio, ingresado: titular?.ingresado });
  if (!titular?.ingresado) throw new Error('El titular no consta como ingresado. No se toca nada.');

  const asis = (await db.collection('asistencia_eventos').where('reservaId', '==', r.id).get()).docs
    .filter(d => d.data().eventoId === EVENTO_ID && d.data().slotTipo === 'titular');
  if (asis.length !== 1) throw new Error(`Asistencias del titular: ${asis.length}. No se toca nada.`);
  const tAsis = asis[0].data().fecha.toMillis();

  const fin = (await db.collection('finanzas').where('eventoId', '==', EVENTO_ID).get()).docs
    .filter(d => d.data().categoria === 'Evento' && !d.data().deletedAt && d.data().variante_precio === 'estandar')
    .map(d => ({ d, dt: Math.abs(d.data().fecha.toMillis() - tAsis) }))
    .sort((a, b) => a.dt - b.dt);
  const cobro = fin[0];
  console.log('Cobro asociado: diferencia de', Math.round(cobro.dt / 1000), 's con la entrada; siguiente candidato a', fin[1] ? Math.round(fin[1].dt / 1000) : '—', 's');
  if (cobro.dt > 30000) throw new Error('Ningún cobro a menos de 30 s de la entrada. No se toca nada.');

  const nuevoCobro = { monto: kalianSocio, monto_bruto: precioSocio, monto_artista: precioSocio - kalianSocio, variante_precio: 'descuento_socio', socio_id: socioId, concepto: `${cobro.d.data().concepto} Soci@ (corregido)` };
  console.log('Cobro antes:', { monto: cobro.d.data().monto, bruto: cobro.d.data().monto_bruto, artista: cobro.d.data().monto_artista, variante: cobro.d.data().variante_precio });
  console.log('Cobro después:', { monto: nuevoCobro.monto, bruto: nuevoCobro.monto_bruto, artista: nuevoCobro.monto_artista, variante: nuevoCobro.variante_precio });
  console.log('Asistencia: tipo reserva → reserva_socio, precio', asis[0].data().precio, '→', precioSocio);
  console.log('Reserva: titular pendiente → validado_socio, precio', titular.precio, '→', precioSocio, '| esSocio → true');

  if (!APLICAR) { console.log('\nSIMULACIÓN: no se ha escrito nada.'); return; }
  const slots = [...reserva.slots];
  slots[0] = { ...titular, estado: 'validado_socio', precio: precioSocio, socio_id: socioId };
  const batch = db.batch();
  batch.update(cobro.d.ref, nuevoCobro);
  batch.update(asis[0].ref, { tipo: 'reserva_socio', precio: precioSocio, socioId });
  batch.update(r.ref, { slots, esSocio: true, totalPagar: Math.max(0, Number(reserva.totalPagar || 0) - (Number(titular.precio) - precioSocio)) });
  await batch.commit();
  console.log('\nAPLICADO.');
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
