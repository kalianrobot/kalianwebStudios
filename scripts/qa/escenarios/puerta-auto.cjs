/**
 * Escenario "puerta-auto": prepara el evento del escenario "puerta", simula
 * la noche entera en la puerta con la MISMA lógica que la web
 * (src/lib/puerta.ts) y comprueba con el cálculo del cierre
 * (src/lib/cierreEvento.ts) que caja, reparto, no presentados y aforo cuadran.
 *
 * Escribe en test exactamente lo que escribiría Control de Acceso, salvo el
 * agregado mensual `caja_eventos`, que se omite para no ensuciar la vista
 * rápida de puerta. Usa el Admin SDK: no prueba firestore.rules ni la pantalla.
 *
 * Requiere tsx (node --import tsx) para cargar los módulos TypeScript de src/lib.
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const puerta = require('./puerta.cjs');
const { borrarEvento } = require('../comun.cjs');

const SRC = path.join(__dirname, '..', '..', '..', 'src', 'lib');
const cargar = (m) => import(pathToFileURL(path.join(SRC, `${m}.ts`)).href);

const STAFF = 'qa-script';

module.exports = {
  id: 'puerta-auto',
  descripcion: 'Prueba automática de la puerta: simula las entradas y comprueba caja, cierre y Recibí',

  async sembrar(db, opts) {
    const lib = await cargar('puerta');
    const { calcularCierreEvento } = await cargar('cierreEvento');
    const { PRECIOS: P, APORTACION: A } = puerta;

    const base = await puerta.sembrar(db, opts);
    const { eventoId } = base;
    const eventoRef = db.collection('eventos').doc(eventoId);
    const leerEvento = async () => ({ id: eventoId, ...(await eventoRef.get()).data() });

    // Guion de la noche: qué reservas entran, con qué método, y qué entra sin reserva.
    // [reserva por tipo, plazas que entran (índices), método]
    const porTipo = (tipo, n = 0) => base.reservas.filter(r => r.tipo === tipo)[n];
    const guion = [
      [porTipo('normal', 0), [0, 1, 2], 'Efectivo'],
      [porTipo('cupon'), [0, 1], 'Tarjeta'],
      // porTipo('normal', 1) es el "no presentado": no entra nadie.
      ...(porTipo('socio') ? [[porTipo('socio'), [0, 1], 'Efectivo']] : []),
    ];

    const log = [];
    const esperado = { bruto: 0, kalian: 0, artista: 0, entradasQR: 0, walkIn: 0, aforoActual: 0 };
    const sumar = (bruto, kalian) => {
      esperado.bruto += bruto; esperado.kalian += kalian; esperado.artista += bruto - kalian;
    };

    const apuntar = async (entrada, asistenciaRef) => {
      const ref = asistenciaRef || db.collection('asistencia_eventos').doc();
      await ref.set({ ...entrada.asistencia, fecha: Timestamp.now(), qa: true });
      if (entrada.ingreso) {
        await db.collection('finanzas').add({ ...entrada.ingreso, fecha: Timestamp.now(), deletedAt: null, qa: true });
      }
    };

    // 1. Reservas: misma transacción que entrarSlot de ControlAcceso.
    for (const [resumen, plazas, metodo] of guion) {
      for (const idx of plazas) {
        const evento = await leerEvento();
        const rRef = db.collection('reservas').doc(resumen.id);
        const reserva = { id: resumen.id, ...(await rRef.get()).data() };
        const slot = lib.slotsDesdeReserva(reserva, evento)[idx];
        const marcado = await db.runTransaction(async (tx) => {
          const snap = await tx.get(rRef);
          const m = lib.marcarSlotIngresado({ reservaServidor: snap.data(), evento, slotIdx: idx, slotLocal: slot });
          if (!m) return null;
          tx.update(rRef, { slots: m.slots, asistentes_ingresados: m.ingresados, estado: m.estado, ultimaEntrada: Timestamp.now() });
          tx.update(eventoRef, { aforo_reservado: FieldValue.increment(-1), aforo_actual: FieldValue.increment(1) });
          return m;
        });
        if (!marcado) throw new Error(`La plaza ${idx} de ${resumen.ticket} ya estaba ingresada`);
        await apuntar(lib.entradaSlotReserva({ evento, reserva, slot, metodo, staffId: STAFF }));
        const e = resumen.entradas[idx];
        sumar(e.bruto, e.kalian);
        esperado.entradasQR++; esperado.aforoActual++;
        log.push(`Entra ${resumen.ticket} plaza ${idx + 1} (${e.quien}): ${e.bruto} € ${metodo}`);
      }
    }

    // 2. Socio con carnet, sin reserva.
    if (base.socioCarnet) {
      const evento = await leerEvento();
      const socio = { id: base.socioCarnet.id, ...(await db.collection('socios').doc(base.socioCarnet.id).get()).data() };
      const entrada = lib.entradaSocioCarnet({ evento, socio, hoy: lib.hoyPuerta(), metodo: 'Tarjeta', staffId: STAFF });
      await apuntar(entrada, db.collection('asistencia_eventos').doc(entrada.asistenciaId));
      await eventoRef.update({ aforo_actual: FieldValue.increment(1) });
      sumar(P.descuento, Math.min(A.descuento, P.descuento));
      esperado.entradasQR++; esperado.aforoActual++;
      log.push(`Entra socio con carnet ${socio.nombre || socio.id}: ${entrada.precio} € Tarjeta`);
    }

    // 3. Puerta sin reserva: una normal y una invitación gratis.
    for (const [precio, metodo, que] of [[lib.precioWalkIn(await leerEvento(), false), 'Efectivo', 'puerta normal'], [0, 'Efectivo', 'invitación']]) {
      const evento = await leerEvento();
      await eventoRef.update({ aforo_actual: FieldValue.increment(1) });
      await apuntar(lib.entradaWalkIn({ evento, precio, socio: null, staff: 'portero', metodo, staffId: STAFF }));
      sumar(precio, Math.min(A.estandar, precio));
      esperado.walkIn++; esperado.aforoActual++;
      log.push(`Entra sin reserva (${que}): ${precio} €`);
    }

    // 4. Cierre leído de la base de datos, igual que el PDF.
    const leer = async (col) => (await db.collection(col).where('eventoId', '==', eventoId).get()).docs.map(d => ({ id: d.id, ...d.data() }));
    const evento = await leerEvento();
    const cierre = calcularCierreEvento({
      evento, asistencias: await leer('asistencia_eventos'), reservas: await leer('reservas'), finanzas: await leer('finanzas'),
    });

    const noShow = porTipo('normal', 1);
    const plazasNoShow = noShow ? noShow.personas : 0;
    const reservasLeidas = Object.fromEntries((await leer('reservas')).map(r => [r.id, r]));

    const comprobaciones = [
      ['Caja del evento (bruto)', esperado.bruto, cierre.totales.totalCaja],
      ['Parte de Kalian', esperado.kalian, cierre.totales.totalKalian],
      ['Parte del artista', esperado.artista, cierre.totales.totalArtista],
      ['Descuadre caja − asistencia', 0, cierre.totales.descuadre],
      ['Recibí: total artista', esperado.artista, cierre.recibi.totales.artista],
      ['Recibí: avisos', 0, cierre.recibi.avisos.length],
      ['Entradas con QR/carnet', esperado.entradasQR, cierre.entradasQR.length],
      ['Entradas en puerta sin reserva', esperado.walkIn, cierre.entradasWalkIn.length],
      ['Plazas no presentadas', plazasNoShow, cierre.reservasNoShow.length],
      ['Aforo: han entrado', esperado.aforoActual, evento.aforo_actual],
      ['Aforo: reservado pendiente', plazasNoShow, evento.aforo_reservado],
      ...guion.map(([r]) => [`Reserva ${r.ticket} validada`, 'validado', reservasLeidas[r.id]?.estado]),
      ...(noShow ? [[`Reserva ${noShow.ticket} sin validar`, 'pendiente', reservasLeidas[noShow.id]?.estado || 'pendiente']] : []),
    ].map(([que, esp, obt]) => ({ que, esperado: esp, obtenido: obt, ok: esp === obt }));

    const ok = comprobaciones.every(c => c.ok);

    // Ejecución automática (push a test): si todo cuadra, no dejamos el evento.
    const borrado = ok && process.env.QA_BORRAR_SI_OK === '1';
    if (borrado) await borrarEvento(db, eventoId);
    return {
      ...base,
      // En modo automático no hay nada que hacer a mano: fuera las instrucciones manuales.
      reservas: base.reservas.map(r => ({ ...r, nota: r.id === noShow?.id ? 'no se presenta (simulado)' : '' })),
      puertaSinReserva: undefined,
      esperado: undefined,
      escenario: 'puerta-auto',
      ok,
      comprobaciones,
      registro: log,
      cierre: { porMetodo: cierre.totales.porMetodo, avisosRecibi: cierre.recibi.avisos },
      pasos: [
        ok ? 'Todo cuadra: no hay que hacer nada.' : 'Algo no cuadra: revisa las comprobaciones en FALLO.',
        borrado
          ? 'El evento de prueba se ha borrado al terminar (ejecución automática).'
          : `Si quieres verlo con tus ojos: en Staff > Eventos, "${base.evento.titulo}" (mañana ya podrás descargar el PDF de cierre y el Recibí).`,
      ],
      avisos: [...(base.avisos || []), 'No se ha tocado caja_eventos (vista rápida mensual de puerta).'],
    };
  },
};
