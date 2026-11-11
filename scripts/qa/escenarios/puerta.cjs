/**
 * Escenario "puerta": evento del día indicado con precio normal, descuento de
 * socio y cupón, y reservas SIN validar para probar el Control de Acceso.
 * Después sirve para revisar caja, PDF de cierre y Recibí del artista.
 *
 * Reproduce lo que escribe ReservaForm (reservas con slots, ingresado=false).
 */
const { PREFIJO, sufijo, ticketUnico, manageToken, qrUrl, sociosConDescuento, reparto } = require('../comun.cjs');

const PRECIOS = { estandar: 15, descuento: 10, cupon: 8 };
const APORTACION = { estandar: 5, descuento: 4, cupon: 3 };
const CUPON = 'QAPUERTA';
const ACADEMIAS = ['Music is Cool', 'local'];

module.exports = {
  id: 'puerta',
  PRECIOS,
  APORTACION,
  descripcion: 'Evento de hoy con reservas sin validar para probar la entrada en puerta y la caja',

  async sembrar(db, { fecha }) {
    const eventoId = `${PREFIJO}puerta-${fecha}-${sufijo().toLowerCase()}`;
    const evento = {
      titulo: `QA Puerta ${fecha} (${eventoId.slice(-4).toUpperCase()})`,
      descripcion: 'Evento de prueba creado por el QA. No es real.',
      fecha: `${fecha}T19:00`,
      fecha_fin: `${fecha}T23:59`,
      hora_fin: '23:59',
      categoria: 'musica',
      academias_descuento: ACADEMIAS,
      sala: 'Kalian Hub',
      artista: 'Banda QA',
      aforo_maximo: 40,
      aforo_actual: 0,
      max_acompanantes: 3,
      precio_estandar: PRECIOS.estandar,
      tiene_descuento: true,
      precio_descuento: PRECIOS.descuento,
      cupon: CUPON,
      precioCupon: PRECIOS.cupon,
      fechaCupon: `${fecha}T00:00`,
      apertura_socios: `${fecha}T00:00`,
      apertura_general: `${fecha}T00:00`,
      aportacion_kalian_estandar: APORTACION.estandar,
      aportacion_kalian_descuento: APORTACION.descuento,
      aportacion_kalian_cupon: APORTACION.cupon,
      imagenUrl: '',
      qa: true,
    };

    const socios = await sociosConDescuento(db, ACADEMIAS, fecha, 2);
    const usados = new Set();

    // tipo: 'normal' | 'cupon' | 'socio'
    const defs = [
      { tipo: 'normal', nombre: 'Ane QA', dni: 'QA000001', email: 'ane.qa@example.com', acomp: 2, nota: '' },
      { tipo: 'cupon', nombre: 'Mikel QA', dni: 'QA000002', email: 'mikel.qa@example.com', acomp: 1, nota: '' },
      { tipo: 'normal', nombre: 'Jon QA', dni: 'QA000003', email: 'jon.qa@example.com', acomp: 0, nota: 'déjalo sin entrar para ver un "no presentado"' },
    ];
    if (socios[0]) {
      defs.push({ tipo: 'socio', socio: socios[0], nombre: socios[0].nombre || 'Socio QA', dni: String(socios[0].dni).toUpperCase(), email: socios[0].email || 'socio.qa@example.com', acomp: 1, nota: '' });
    }

    const batch = db.batch();
    const reservas = [];
    let plazas = 0;
    for (const [i, d] of defs.entries()) {
      const ticket = await ticketUnico(db, usados);
      const precioTitular = d.tipo === 'socio' ? PRECIOS.descuento : d.tipo === 'cupon' ? PRECIOS.cupon : PRECIOS.estandar;
      const segmentoTitular = d.tipo === 'socio' ? 'descuento' : d.tipo === 'cupon' ? 'cupon' : 'estandar';
      const slots = [{
        dni: d.dni, nombre: d.nombre, email: d.email, tipo: 'titular',
        estado: d.tipo === 'socio' ? 'validado_socio' : 'pendiente',
        precio: precioTitular, ingresado: false,
        ...(d.tipo === 'socio' ? { socio_id: d.socio.id, socio_nombre: d.nombre } : {}),
      }];
      const entradas = [{ quien: 'titular', ...reparto(precioTitular, APORTACION[segmentoTitular]) }];
      for (let k = 0; k < d.acomp; k++) {
        slots.push({ tipo: 'acompañante', estado: 'pendiente', precio: PRECIOS.estandar, ingresado: false });
        entradas.push({ quien: `acompañante ${k + 1}`, ...reparto(PRECIOS.estandar, APORTACION.estandar) });
      }
      plazas += slots.length;
      batch.set(db.collection('reservas').doc(`${eventoId}-r${i + 1}`), {
        eventoId, eventoTitulo: evento.titulo, categoria: 'musica',
        uidTitular: 'invitado', dniTitular: d.dni, nombreTitular: d.nombre, emailTitular: d.email,
        ticketID: ticket, manageToken: manageToken(), qrUrl: qrUrl(ticket),
        numPersonas: slots.length,
        totalPagar: slots.reduce((a, s) => a + s.precio, 0),
        fechaReserva: new Date().toISOString(), fechaActividad: evento.fecha,
        slots,
        totalPendiente: slots.reduce((a, s) => a + (s.estado === 'pendiente' ? s.precio : 0), 0),
        esCurso: false, acompañantes: d.acomp, asistentes_ingresados: 0,
        cuponUsado: d.tipo === 'cupon' ? CUPON : null,
        esSocio: d.tipo === 'socio', precioVerificado: true,
        qa: true,
      });
      reservas.push({ id: `${eventoId}-r${i + 1}`, ticket, qr: qrUrl(ticket), titular: d.nombre, tipo: d.tipo, personas: slots.length, entradas, nota: d.nota });
    }
    batch.set(db.collection('eventos').doc(eventoId), { ...evento, aforo_reservado: plazas });
    await batch.commit();

    const suma = (arr, k) => arr.reduce((a, e) => a + e[k], 0);
    const todas = reservas.flatMap(r => r.entradas);
    const sinNoShow = reservas.filter(r => !r.nota).flatMap(r => r.entradas);
    const total = (arr) => ({ bruto: suma(arr, 'bruto'), kalian: suma(arr, 'kalian'), artista: suma(arr, 'artista') });

    const puertaSinReserva = [
      { caso: 'Entrada en puerta normal', ...reparto(PRECIOS.estandar, APORTACION.estandar) },
      ...(socios[1] ? [{ caso: `Socio con carnet sin reserva: ${socios[1].nombre || ''} (DNI ${String(socios[1].dni).toUpperCase()})`, ...reparto(PRECIOS.descuento, APORTACION.descuento) }] : []),
      { caso: 'Invitación gratis en puerta', ...reparto(0, 0) },
    ];

    return {
      escenario: 'puerta',
      eventoId,
      evento: { titulo: evento.titulo, fecha: evento.fecha, fecha_fin: evento.fecha_fin, aforo_maximo: evento.aforo_maximo, aforo_reservado: plazas, precios: PRECIOS, aportacion_kalian: APORTACION, cupon: CUPON },
      reservas,
      puertaSinReserva,
      esperado: {
        si_entran_todas_las_reservas: total(todas),
        si_entran_todas_menos_el_no_presentado: total(sinNoShow),
      },
      socioCarnet: socios[1] ? { id: socios[1].id, nombre: socios[1].nombre || '', dni: String(socios[1].dni).toUpperCase() } : null,
      avisos: socios[0] ? [] : ['No hay socios activos con descuento en test: no se ha creado la reserva de socio.'],
      pasos: [
        `Control de Acceso: elige "${evento.titulo}" y valida los tickets (escribe el código o escanea su QR).`,
        'Prueba también las entradas en puerta sin reserva de la lista.',
        'Comprueba que la caja del evento suma lo esperado.',
        'Al día siguiente: descarga el PDF de cierre y el Recibí del artista en Staff > Eventos y compáralos con lo esperado.',
      ],
    };
  },
};
