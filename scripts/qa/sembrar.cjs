/**
 * QA: prepara datos de prueba en el proyecto de TEST según un escenario.
 *
 * Escenarios en scripts/qa/escenarios/<id>.cjs. Cada uno exporta
 * { id, descripcion, sembrar(db, { fecha }) } y devuelve un resumen JSON.
 * Para añadir uno nuevo: crea el fichero y añádelo a las opciones del
 * workflow .github/workflows/qa-test.yml.
 *
 * Uso: TARGET_PROJECT=<id-test> TARGET_CREDENTIALS=<sa.json> ESCENARIO=puerta [FECHA=YYYY-MM-DD] \
 *      NODE_PATH=functions/node_modules node scripts/qa/sembrar.cjs
 *
 * Salida: resumen legible en consola, qa-resultado.json y, en GitHub Actions,
 * el mismo resumen en la página de la ejecución ($GITHUB_STEP_SUMMARY).
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { hoyMadrid } = require('./comun.cjs');

const PROD = 'kalianhkg-886a6';
const PROJECT = process.env.TARGET_PROJECT;
if (!PROJECT || PROJECT === PROD || /prod/i.test(PROJECT)) {
  console.error('TARGET_PROJECT vacío o es producción. Abortado.');
  process.exit(1);
}

const ESCENARIO = (process.env.ESCENARIO || '').trim();
const FECHA = (process.env.FECHA || '').trim() || hoyMadrid();
if (!/^\d{4}-\d{2}-\d{2}$/.test(FECHA)) {
  console.error(`FECHA no válida: "${FECHA}" (formato YYYY-MM-DD).`);
  process.exit(1);
}

const dir = path.join(__dirname, 'escenarios');
const disponibles = fs.readdirSync(dir).filter(f => f.endsWith('.cjs')).map(f => f.replace(/\.cjs$/, ''));
if (!disponibles.includes(ESCENARIO)) {
  console.error(`Escenario "${ESCENARIO}" no existe. Disponibles: ${disponibles.join(', ')}`);
  process.exit(1);
}

const eur = (n) => `${n} €`;

function aMarkdown(r) {
  const l = [`## QA: escenario \`${r.escenario}\` en \`${PROJECT}\``, ''];
  if (r.evento) {
    const e = r.evento;
    l.push(`**Evento:** ${e.titulo} — ${e.fecha} a ${e.fecha_fin} — aforo ${e.aforo_maximo} (${e.aforo_reservado} reservadas)`);
    l.push(`**Precios:** normal ${eur(e.precios.estandar)} · socio ${eur(e.precios.descuento)} · cupón \`${e.cupon}\` ${eur(e.precios.cupon)}`);
    l.push(`**Aportación Kalian:** normal ${eur(e.aportacion_kalian.estandar)} · socio ${eur(e.aportacion_kalian.descuento)} · cupón ${eur(e.aportacion_kalian.cupon)}`, '');
  }
  if (r.reservas?.length) {
    l.push('| Ticket | Titular | Tipo | Personas | Precios | Kalian | Artista | Nota |', '|---|---|---|---|---|---|---|---|');
    for (const x of r.reservas) {
      const s = (k) => x.entradas.reduce((a, e) => a + e[k], 0);
      l.push(`| **${x.ticket}** | ${x.titular} | ${x.tipo} | ${x.personas} | ${x.entradas.map(e => e.bruto).join('+')} = ${eur(s('bruto'))} | ${eur(s('kalian'))} | ${eur(s('artista'))} | ${x.nota || ''} |`);
    }
    l.push('');
  }
  if (r.puertaSinReserva?.length) {
    l.push('**Entradas en puerta sin reserva para probar:**');
    for (const p of r.puertaSinReserva) l.push(`- ${p.caso}: ${eur(p.bruto)} (Kalian ${eur(p.kalian)}, artista ${eur(p.artista)})`);
    l.push('');
  }
  if (r.esperado) {
    l.push('**Cifras esperadas (solo reservas):**');
    for (const [k, v] of Object.entries(r.esperado)) l.push(`- ${k.replace(/_/g, ' ')}: bruto ${eur(v.bruto)}, Kalian ${eur(v.kalian)}, artista ${eur(v.artista)}`);
    l.push('');
  }
  if (r.eventos) {
    l.push(r.eventos.length ? '**Eventos borrados:**' : 'No había eventos de QA.');
    for (const e of r.eventos) l.push(`- ${e.eventoId} (${e.titulo}): ${JSON.stringify(e.borrados)}`);
    l.push('');
  }
  if (r.pasos?.length) { l.push('**Pasos:**'); r.pasos.forEach((p, i) => l.push(`${i + 1}. ${p}`)); l.push(''); }
  if (r.avisos?.length) { l.push('**Avisos:**'); r.avisos.forEach(a => l.push(`- ${a}`)); }
  return l.join('\n');
}

async function main() {
  const app = initializeApp({
    credential: cert(JSON.parse(fs.readFileSync(process.env.TARGET_CREDENTIALS, 'utf8'))),
    projectId: PROJECT,
  });
  const db = getFirestore(app);
  const escenario = require(path.join(dir, `${ESCENARIO}.cjs`));
  const resultado = await escenario.sembrar(db, { fecha: FECHA, proyecto: PROJECT });
  resultado.proyecto = PROJECT;
  resultado.fecha = FECHA;

  fs.writeFileSync('qa-resultado.json', JSON.stringify(resultado, null, 2));
  const md = aMarkdown(resultado);
  console.log(md);
  console.log('\n--- QA-RESULTADO-JSON ---\n' + JSON.stringify(resultado) + '\n--- FIN ---');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
