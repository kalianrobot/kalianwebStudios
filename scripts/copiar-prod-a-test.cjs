'use strict';
/**
 * Copia Firestore de PRODUCCIÓN al proyecto de TEST, anonimizando los datos personales.
 *
 * - Producción solo se LEE (get / listCollections). Nunca se escribe en ella.
 * - Test se VACÍA entero y se rellena con la copia.
 * - Catálogos (eventos, cursos, academias, profesores...) se copian tal cual, salvo
 *   emails, teléfonos, DNIs y cuentas bancarias, que se sustituyen en todas partes.
 * - Colecciones personales (socios, users, reservas, pagos...): además nombres,
 *   direcciones, fotos y textos libres.
 * - Los reemplazos son consistentes dentro de una ejecución: el mismo DNI real
 *   se convierte siempre en el mismo DNI falso (también dentro de IDs de documento
 *   y en arrays como `cursos.alumnos`), así que las relaciones se mantienen.
 * - Los valores falsos usan una semilla aleatoria por ejecución: no se pueden revertir.
 * - El log solo muestra recuentos, nunca valores.
 *
 * Variables de entorno:
 *   SOURCE_PROJECT, SOURCE_CREDENTIALS  proyecto y JSON de cuenta de servicio de producción
 *   TARGET_PROJECT, TARGET_CREDENTIALS  proyecto y JSON de cuenta de servicio de test
 *   SIMULAR=true                        solo lee y muestra el resumen, no escribe nada
 *   ADMINS=a@x.com,b@y.com              emails que pasan a role 'admin' en test
 *   CLAVE_PUERTA_TEST                   clave de puerta para test (por defecto 'test1234')
 *
 * Uso: lo lanza el workflow "Copiar datos de producción a test" (workflow_dispatch).
 */

const crypto = require('crypto');

// --- Reglas de anonimización -------------------------------------------------

const PERSONALES = new Set([
  'users', 'socios', 'reservas', 'solicitudes_cursos', 'newsletter_subscribers',
  'pagos_mensuales', 'pagos_inscripciones', 'asistencia_eventos', 'notificaciones',
  'finanzas',
]);
// Configuración de la propia asociación (IBAN de donaciones, email de contacto...).
const SIN_ANONIMIZAR = new Set(['config', 'configuracion']);

const EMAIL_PERMITIDO = (e) => /@kalian\.es$/i.test(e) || e.toLowerCase() === 'kalianrobot@gmail.com';
const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const K_DNI = /^(dni|nie|dni_?titular|documento)$/i;
const K_EMAIL = /(email|correo|^mail$)/i;
const K_NOMBRE = /^(nombre|nombre_?titular|nombre_?completo|display_?name|titular)$/i;
const K_APELLIDOS = /^apellidos?$/i;
const K_TEL = /(^tel$|tel[eé]fono|m[oó]vil|phone)/i;
const K_DIR = /^(direccion|dirección|domicilio|poblacion|población|localidad)$/i;
const K_CP = /^(cp|codigo_?postal)$/i;
const K_BANCO = /^(iban|cuenta_?bancaria|cuentabancaria)$/i;
const K_FOTO = /^(foto|foto_?url|photo_?url|avatar|imagen_?perfil)$/i;
const K_TEXTO = /^(notas|observaciones|mensaje|comentario|comentarios)$/i;

const NOMBRES = ['Ane', 'Mikel', 'Laura', 'Jon', 'Irati', 'Unai', 'Maite', 'Iker', 'Nerea', 'Asier',
  'Lucía', 'Pablo', 'Amaia', 'Gorka', 'Sara', 'David', 'Leire', 'Aitor', 'Elena', 'Xabier'];
const APELLIDOS = ['Prueba', 'Ejemplo', 'Test', 'Ficticio', 'Demo', 'Simulado', 'Modelo',
  'Ensayo', 'Muestra', 'Patrón'];
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

function esObjetoPlano(v) {
  return v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
}
function esReferencia(v) {
  return v !== null && typeof v === 'object' && typeof v.path === 'string'
    && v.constructor && v.constructor.name === 'DocumentReference';
}

class Anonimizador {
  constructor(refFactory = (p) => ({ __ref: p })) {
    this.refFactory = refFactory;
    this.dnis = new Map();     // real (MAYÚS) -> falso
    this.emails = new Map();   // real (minús) -> falso
    this.nombres = new Map();
    this.apellidos = new Map();
    this.usados = new Set();
    this.n = 0;
    this.stats = { dni: 0, email: 0, nombre: 0, tel: 0, dir: 0, banco: 0, foto: 0, texto: 0 };
  }

  rnd(max) { return crypto.randomInt(max); }

  dniFalso(real) {
    const k = String(real).trim().toUpperCase();
    if (!k) return real;
    if (!this.dnis.has(k)) {
      let f;
      do {
        const num = 10000000 + this.rnd(89999999);
        f = `${num}${LETRAS_DNI[num % 23]}`;
      } while (this.usados.has(f));
      this.usados.add(f);
      this.dnis.set(k, f);
    }
    return this.dnis.get(k);
  }

  emailFalso(real) {
    const k = String(real).trim().toLowerCase();
    if (!k || EMAIL_PERMITIDO(k)) return real;
    if (!this.emails.has(k)) this.emails.set(k, `usuario${++this.n}.${this.rnd(1e6)}@example.com`);
    return this.emails.get(k);
  }

  nombreFalso(real) {
    if (!this.nombres.has(real)) {
      const compuesto = String(real).trim().includes(' ');
      const n = NOMBRES[this.rnd(NOMBRES.length)];
      this.nombres.set(real, compuesto ? `${n} ${APELLIDOS[this.rnd(APELLIDOS.length)]}` : n);
    }
    return this.nombres.get(real);
  }

  apellidosFalsos(real) {
    if (!this.apellidos.has(real)) {
      this.apellidos.set(real, `${APELLIDOS[this.rnd(APELLIDOS.length)]} ${APELLIDOS[this.rnd(APELLIDOS.length)]}`);
    }
    return this.apellidos.get(real);
  }

  // Pasada 1: registrar todos los DNIs y emails reales para poder sustituirlos en cualquier sitio.
  recolectar(top, valor, clave = '') {
    if (SIN_ANONIMIZAR.has(top)) return;
    if (typeof valor === 'string') {
      if (K_DNI.test(clave) && valor.trim()) this.dniFalso(valor);
      else if (K_EMAIL.test(clave) && valor.includes('@')) this.emailFalso(valor);
      else for (const m of valor.match(RE_EMAIL) || []) this.emailFalso(m);
    } else if (Array.isArray(valor)) {
      for (const v of valor) this.recolectar(top, v, clave);
    } else if (esObjetoPlano(valor)) {
      for (const [k, v] of Object.entries(valor)) this.recolectar(top, v, k);
    }
  }

  // Sustituye DNIs y emails reales conocidos dentro de cualquier texto (IDs incluidos).
  sustituirConocidos(s, personal) {
    let r = s;
    if (r.includes('@')) {
      for (const [real, falso] of this.emails) {
        if (r.toLowerCase().includes(real)) r = reemplazarSinMayus(r, real, falso);
      }
      if (personal) r = r.replace(RE_EMAIL, (m) => this.emailFalso(m));
    }
    for (const [real, falso] of this.dnis) {
      if (real.length >= 6 && r.toUpperCase().includes(real)) r = reemplazarSinMayus(r, real, falso);
    }
    return r;
  }

  idFalso(id) { return this.sustituirConocidos(id, false); }

  rutaFalsa(ruta) { return ruta.split('/').map((seg) => this.idFalso(seg)).join('/'); }

  // Pasada 2: transformar un valor.
  transformar(top, valor, clave = '', esPersona = false) {
    const personal = PERSONALES.has(top);
    if (valor === null || valor === undefined) return valor;
    if (esReferencia(valor)) return this.refFactory(this.rutaFalsa(valor.path));
    if (SIN_ANONIMIZAR.has(top)) {
      if (Array.isArray(valor)) return valor.map((v) => this.transformar(top, v, clave));
      if (esObjetoPlano(valor)) {
        const o = {};
        for (const [k, v] of Object.entries(valor)) o[k] = this.transformar(top, v, k);
        return o;
      }
      return valor;
    }
    if (typeof valor === 'string') {
      if (!valor.trim()) return valor;
      if (K_DNI.test(clave)) { this.stats.dni++; return this.dniFalso(valor); }
      if (K_EMAIL.test(clave) && valor.includes('@')) { this.stats.email++; return this.emailFalso(valor); }
      if (K_TEL.test(clave)) { this.stats.tel++; return `600${String(this.rnd(1e6)).padStart(6, '0')}`; }
      if (K_BANCO.test(clave)) { this.stats.banco++; return 'ES00 0000 0000 0000 0000 0000'; }
      if (personal || esPersona) {
        if (K_NOMBRE.test(clave)) { this.stats.nombre++; return this.nombreFalso(valor); }
        if (K_APELLIDOS.test(clave)) { this.stats.nombre++; return this.apellidosFalsos(valor); }
        if (K_DIR.test(clave)) { this.stats.dir++; return 'Calle de Prueba 1'; }
        if (K_CP.test(clave)) { this.stats.dir++; return '48000'; }
        if (K_TEXTO.test(clave)) { this.stats.texto++; return 'Texto de prueba'; }
      }
      return this.sustituirConocidos(valor, personal);
    }
    if (Array.isArray(valor)) return valor.map((v) => this.transformar(top, v, clave, esPersona));
    if (esObjetoPlano(valor)) {
      // Un objeto con DNI es una persona aunque esté dentro de un catálogo (p. ej. inquilinos de locales).
      const persona = esPersona || personal || Object.keys(valor).some((k) => K_DNI.test(k));
      const o = {};
      for (const [k, v] of Object.entries(valor)) {
        if ((persona) && K_FOTO.test(k)) { this.stats.foto++; continue; }
        o[k] = this.transformar(top, v, k, persona);
      }
      return o;
    }
    return valor; // Timestamp, GeoPoint, number, boolean, Bytes...
  }
}

function reemplazarSinMayus(texto, buscado, nuevo) {
  const bajo = texto.toLowerCase();
  const b = buscado.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const j = bajo.indexOf(b, i);
    if (j === -1) return out + texto.slice(i);
    out += texto.slice(i, j) + nuevo;
    i = j + b.length;
  }
}

// --- Ejecución contra Firestore ---------------------------------------------

async function leerColeccion(colRef, top, docs) {
  const snap = await colRef.get();
  for (const d of snap.docs) {
    docs.push({ path: d.ref.path, top, data: d.data() });
    for (const sub of await d.ref.listCollections()) await leerColeccion(sub, top, docs);
  }
}

async function main() {
  const fs = require('fs');
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');

  const SRC = process.env.SOURCE_PROJECT;
  const DST = process.env.TARGET_PROJECT;
  const simular = String(process.env.SIMULAR).toLowerCase() === 'true';

  if (!SRC || !DST) throw new Error('Faltan SOURCE_PROJECT o TARGET_PROJECT.');
  if (SRC === DST) throw new Error('Origen y destino son el mismo proyecto. Abortado.');
  if (!/test/i.test(DST)) throw new Error(`El destino "${DST}" no parece un proyecto de test. Abortado.`);
  if (/test/i.test(SRC)) throw new Error(`El origen "${SRC}" parece de test. Abortado.`);

  const cred = (f) => cert(JSON.parse(fs.readFileSync(f, 'utf8')));
  const srcApp = initializeApp({ credential: cred(process.env.SOURCE_CREDENTIALS), projectId: SRC }, 'origen');
  const dstApp = initializeApp({ credential: cred(process.env.TARGET_CREDENTIALS), projectId: DST }, 'destino');
  const origen = getFirestore(srcApp);   // SOLO lectura
  const destino = getFirestore(dstApp);

  console.log(`Origen: ${SRC} (solo lectura)  →  Destino: ${DST}${simular ? '  [SIMULACIÓN]' : ''}`);

  // 1. Leer producción
  const docs = [];
  for (const col of await origen.listCollections()) await leerColeccion(col, col.id, docs);
  const porColeccion = {};
  for (const d of docs) porColeccion[d.top] = (porColeccion[d.top] || 0) + 1;
  console.log(`Leídos ${docs.length} documentos:`);
  for (const [c, n] of Object.entries(porColeccion).sort()) {
    const modo = SIN_ANONIMIZAR.has(c) ? 'tal cual' : PERSONALES.has(c) ? 'anonimizado (personal)' : 'catálogo (contactos anonimizados)';
    console.log(`  ${c.padEnd(26)} ${String(n).padStart(6)}  ${modo}`);
  }

  // 2. Anonimizar
  const anon = new Anonimizador((p) => destino.doc(p));
  for (const d of docs) anon.recolectar(d.top, d.data);
  const salida = docs.map((d) => ({ path: anon.rutaFalsa(d.path), data: anon.transformar(d.top, d.data) }));
  console.log(`DNIs distintos sustituidos: ${anon.dnis.size}. Emails distintos sustituidos: ${anon.emails.size}.`);
  console.log('Campos sustituidos:', JSON.stringify(anon.stats));

  if (simular) {
    console.log('Simulación: no se ha escrito nada. Vuelve a lanzarlo con "simular" desmarcado.');
    return;
  }

  // 3. Vaciar test
  for (const col of await destino.listCollections()) await destino.recursiveDelete(col);
  console.log('Test vaciado.');

  // 4. Escribir
  const w = destino.bulkWriter();
  for (const d of salida) w.set(destino.doc(d.path), d.data);
  await w.close();
  console.log(`Escritos ${salida.length} documentos en ${DST}.`);

  // 5. Clave de puerta propia de test
  const seg = destino.doc('configuracion/seguridad');
  if ((await seg.get()).exists) {
    await seg.set({ clave_puerta: process.env.CLAVE_PUERTA_TEST || 'test1234' }, { merge: true });
    console.log('Clave de puerta de test establecida.');
  }

  // 6. Admins de test
  const admins = String(process.env.ADMINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const email of admins) {
    try {
      const u = await getAuth(dstApp).getUserByEmail(email);
      await destino.doc(`users/${u.uid}`).set({ role: 'admin', email }, { merge: true });
      console.log(`Admin en test: ${email}`);
    } catch {
      console.log(`::warning::${email} no ha entrado nunca en la web de test. Que entre una vez con Google y vuelve a lanzar el workflow.`);
    }
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
}

module.exports = { Anonimizador, reemplazarSinMayus };
