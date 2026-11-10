import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { VariantePrecio } from './constants';
import { MetodoPago } from './finanzas';

export interface EntradaQR {
  id: string;
  nombre: string;
  dni: string | null;
  tipo: 'reserva' | 'reserva_socio' | 'socio_carnet';
  precio: number;
  fecha: Date | null;
}

export interface EntradaWalkIn {
  id: string;
  nombre: string | null;
  socioId: string | null;
  precio: number;
  fecha: Date | null;
}

export interface ReservaNoShow {
  reservaId: string;
  slotIdx: number;
  nombre: string;
  dni: string | null;
  tipo: string;
  canal: 'socio' | 'invitado';
  precio: number;
  estimado: boolean;
}

export interface IngresoFinanzasEvento {
  id: string;
  monto: number;
  montoBruto: number;
  montoArtista: number;
  variantePrecio: VariantePrecio;
  metodo: MetodoPago;
  fecha: Date | null;
  /** true si el doc no llevaba monto_bruto/monto_artista/variante_precio (histórico previo al reparto). */
  esFallbackHistorico: boolean;
}

export interface PagoArtista {
  id: string;
  /** Importe entregado al artista, en positivo (en `finanzas` se guarda negativo). */
  importe: number;
  metodo: MetodoPago;
  fecha: Date | null;
}

/** Una entrada en el Recibí del artista: un cobro de `finanzas` o una entrada gratuita de asistencia. */
export interface EntradaRecibi {
  fecha: Date | null;
  variante: VariantePrecio;
  bruto: number;
  kalian: number;
  artista: number;
  esFallbackHistorico: boolean;
}

export interface FilaResumenVariante {
  variante: VariantePrecio;
  numEntradas: number;
  precioMin: number;
  precioMax: number;
  bruto: number;
  kalian: number;
  artista: number;
}

export interface RecibiArtista {
  entradas: EntradaRecibi[];
  resumen: FilaResumenVariante[];
  totales: { numEntradas: number; bruto: number; kalian: number; artista: number };
  liquidacion: { totalArtista: number; pagado: number; pendiente: number };
  avisos: string[];
}

export interface CierreEvento {
  evento: any;
  entradasQR: EntradaQR[];
  entradasWalkIn: EntradaWalkIn[];
  reservasNoShow: ReservaNoShow[];
  ingresosFinanzas: IngresoFinanzasEvento[];
  pagosArtista: PagoArtista[];
  recibi: RecibiArtista;
  totales: {
    porMetodo: Record<string, number>;
    totalCaja: number;
    totalAsistencia: number;
    descuadre: number;
    totalBruto: number;
    totalKalian: number;
    totalArtista: number;
    hayHistoricoFallback: boolean;
  };
}

const toDate = (v: any): Date | null => (v instanceof Timestamp ? v.toDate() : null);

const VARIANTES_VALIDAS: VariantePrecio[] = [
  'estandar', 'descuento_socio', 'cupon', 'walkin_estandar', 'walkin_socio', 'gratis',
];

export const ETIQUETA_VARIANTE: Record<VariantePrecio, string> = {
  estandar: 'Estándar',
  descuento_socio: 'Soci@',
  cupon: 'Cupón',
  walkin_estandar: 'Puerta',
  walkin_socio: 'Puerta soci@',
  gratis: 'Gratis',
};

/** Precio configurado en la ficha del evento para cada variante (null si no aplica). */
const precioConfigurado = (variante: VariantePrecio, evento: any): number | null => {
  const campo = variante === 'estandar' || variante === 'walkin_estandar' ? 'precio_estandar'
    : variante === 'descuento_socio' || variante === 'walkin_socio' ? 'precio_descuento'
    : variante === 'cupon' ? 'precioCupon'
    : null;
  if (!campo) return null;
  const valor = Number(evento?.[campo]);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
};

const centimos = (n: number) => Math.round(n * 100);
const euros = (n: number) => `${n.toFixed(2)}€`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Datos del Recibí del artista: todas las entradas del evento (cobradas y
 * gratuitas), resumen por variante de precio, liquidación frente a los pagos
 * ya entregados y avisos de control. No contiene datos personales.
 */
export function construirRecibiArtista(params: {
  evento: any;
  ingresosFinanzas: IngresoFinanzasEvento[];
  /** Entradas registradas en puerta (QR + walk-in), solo se usan precio y fecha. */
  asistencias: { precio: number; fecha: Date | null }[];
  pagosArtista: PagoArtista[];
}): RecibiArtista {
  const { evento, ingresosFinanzas, asistencias, pagosArtista } = params;

  const entradas: EntradaRecibi[] = [
    ...ingresosFinanzas.map(f => ({
      fecha: f.fecha,
      variante: f.variantePrecio,
      bruto: f.montoBruto,
      kalian: f.monto,
      artista: f.montoArtista,
      esFallbackHistorico: f.esFallbackHistorico,
    })),
    // Las entradas a 0 € no generan movimiento en `finanzas`: se cuentan desde asistencia.
    ...asistencias
      .filter(a => a.precio <= 0)
      .map(a => ({ fecha: a.fecha, variante: 'gratis' as VariantePrecio, bruto: 0, kalian: 0, artista: 0, esFallbackHistorico: false })),
  ].sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0));

  const resumen: FilaResumenVariante[] = VARIANTES_VALIDAS
    .map(variante => {
      const deVariante = entradas.filter(e => e.variante === variante);
      if (deVariante.length === 0) return null;
      const precios = deVariante.map(e => e.bruto);
      return {
        variante,
        numEntradas: deVariante.length,
        precioMin: Math.min(...precios),
        precioMax: Math.max(...precios),
        bruto: deVariante.reduce((acc, e) => acc + e.bruto, 0),
        kalian: deVariante.reduce((acc, e) => acc + e.kalian, 0),
        artista: deVariante.reduce((acc, e) => acc + e.artista, 0),
      };
    })
    .filter((f): f is FilaResumenVariante => f !== null);

  const totales = {
    numEntradas: entradas.length,
    bruto: resumen.reduce((acc, f) => acc + f.bruto, 0),
    kalian: resumen.reduce((acc, f) => acc + f.kalian, 0),
    artista: resumen.reduce((acc, f) => acc + f.artista, 0),
  };

  const pagado = pagosArtista.reduce((acc, p) => acc + p.importe, 0);
  const liquidacion = {
    totalArtista: totales.artista,
    pagado,
    pendiente: Math.max(0, totales.artista - pagado),
  };

  const avisos: string[] = [];

  for (const variante of VARIANTES_VALIDAS) {
    const configurado = precioConfigurado(variante, evento);
    if (configurado === null) continue;
    const distintas = entradas.filter(e =>
      e.variante === variante && !e.esFallbackHistorico && centimos(e.bruto) !== centimos(configurado)
    );
    if (distintas.length > 0) {
      avisos.push(
        `${ETIQUETA_VARIANTE[variante]}: ${plural(distintas.length, 'entrada cobrada', 'entradas cobradas')} a un precio distinto del configurado en el evento (${euros(configurado)}).`
      );
    }
  }

  const entradasPagoPuerta = asistencias.filter(a => a.precio > 0).length;
  if (entradasPagoPuerta !== ingresosFinanzas.length) {
    const diferencia = Math.abs(entradasPagoPuerta - ingresosFinanzas.length);
    avisos.push(
      `En puerta constan ${plural(entradasPagoPuerta, 'entrada de pago', 'entradas de pago')} y en contabilidad ${plural(ingresosFinanzas.length, 'cobro', 'cobros')} (diferencia de ${diferencia}). Revisar antes de firmar.`
    );
  }

  if (centimos(pagado) > centimos(totales.artista)) {
    avisos.push(`Los pagos registrados al artista (${euros(pagado)}) superan lo que le corresponde (${euros(totales.artista)}).`);
  }

  return { entradas, resumen, totales, liquidacion, avisos };
}

/**
 * Reúne toda la información de un evento pasado necesaria para reconciliar
 * asistencia y caja, y para desglosar el reparto Kalian/artista por entrada.
 * Todo se lee client-side (admin ya puede leer las 4 colecciones).
 */
export async function construirCierreEvento(eventoId: string): Promise<CierreEvento> {
  const eventoSnap = await getDoc(doc(db, 'eventos', eventoId));
  if (!eventoSnap.exists()) throw new Error('Evento no encontrado');
  const evento = { id: eventoSnap.id, ...eventoSnap.data() };

  const [asistenciaSnap, reservasSnap, finanzasSnap] = await Promise.all([
    getDocs(query(collection(db, 'asistencia_eventos'), where('eventoId', '==', eventoId))),
    getDocs(query(collection(db, 'reservas'), where('eventoId', '==', eventoId))),
    // Un único `where` para no requerir índice compuesto (ver design.md D2/A3
    // de add-informe-cierre-evento): filtramos categoria == 'Evento' en cliente.
    getDocs(query(collection(db, 'finanzas'), where('eventoId', '==', eventoId))),
  ]);

  const asistencias = asistenciaSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const entradasQR: EntradaQR[] = asistencias
    .filter(a => a.tipo === 'reserva' || a.tipo === 'reserva_socio' || a.tipo === 'socio_carnet')
    .map(a => ({
      id: a.id,
      nombre: a.slotNombre || a.nombre || 'N/A',
      dni: a.slotDni || a.socioId || null,
      tipo: a.tipo,
      precio: Number(a.precio) || 0,
      fecha: toDate(a.fecha),
    }));

  const entradasWalkIn: EntradaWalkIn[] = asistencias
    .filter(a => a.tipo === 'walk-in')
    .map(a => ({
      id: a.id,
      nombre: a.nombre || null,
      socioId: a.socioId || null,
      precio: Number(a.precio) || 0,
      fecha: toDate(a.fecha),
    }));

  const precioEstandar = Number((evento as any).precio_estandar) || 0;
  const reservasNoShow: ReservaNoShow[] = [];
  reservasSnap.docs.forEach(d => {
    const r = d.data() as any;
    if (r.estado === 'cancelada' || r.estado === 'anulada') return;
    const slots = Array.isArray(r.slots) ? r.slots : [];
    slots.forEach((slot: any, idx: number) => {
      if (slot.ingresado) return;
      const esTitular = idx === 0;
      const estimado = slot.precio === undefined || slot.precio === null;
      reservasNoShow.push({
        reservaId: d.id,
        slotIdx: idx,
        nombre: esTitular ? (r.nombreTitular || 'N/A') : (slot.nombre || slot.socio_nombre || `Acompañante ${idx}`),
        dni: esTitular ? (r.dniTitular || null) : (slot.dni || slot.socio_id || null),
        tipo: slot.tipo || (esTitular ? 'titular' : 'acompañante'),
        canal: slot.estado === 'validado_socio' ? 'socio' : 'invitado',
        precio: estimado ? precioEstandar : Number(slot.precio) || 0,
        estimado,
      });
    });
  });

  const ingresosFinanzas: IngresoFinanzasEvento[] = finanzasSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter(f => f.categoria === 'Evento' && !f.deletedAt)
    .map(f => {
      const esFallbackHistorico = f.monto_bruto === undefined;
      const montoBruto = typeof f.monto_bruto === 'number' ? f.monto_bruto : Number(f.monto) || 0;
      const montoArtista = typeof f.monto_artista === 'number' ? f.monto_artista : 0;
      const variantePrecio: VariantePrecio = VARIANTES_VALIDAS.includes(f.variante_precio)
        ? f.variante_precio
        : 'estandar';
      return {
        id: f.id,
        monto: Number(f.monto) || 0,
        montoBruto,
        montoArtista,
        variantePrecio,
        metodo: f.metodo,
        fecha: toDate(f.fecha),
        esFallbackHistorico,
      };
    });

  const pagosArtista: PagoArtista[] = finanzasSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter(f => f.categoria === 'Pago Artista' && !f.deletedAt)
    .map(f => ({
      id: f.id,
      importe: Math.abs(Number(f.monto) || 0),
      metodo: f.metodo,
      fecha: toDate(f.fecha),
    }));

  const recibi = construirRecibiArtista({
    evento,
    ingresosFinanzas,
    asistencias: [...entradasQR, ...entradasWalkIn],
    pagosArtista,
  });

  const porMetodo: Record<string, number> = {};
  for (const f of ingresosFinanzas) {
    porMetodo[f.metodo] = (porMetodo[f.metodo] || 0) + f.montoBruto;
  }
  const totalCaja = ingresosFinanzas.reduce((acc, f) => acc + f.montoBruto, 0);
  const totalAsistencia = [...entradasQR, ...entradasWalkIn].reduce((acc, e) => acc + e.precio, 0);
  const totalBruto = totalCaja;
  const totalKalian = ingresosFinanzas.reduce((acc, f) => acc + f.monto, 0);
  const totalArtista = ingresosFinanzas.reduce((acc, f) => acc + f.montoArtista, 0);

  return {
    evento,
    entradasQR,
    entradasWalkIn,
    reservasNoShow,
    ingresosFinanzas,
    pagosArtista,
    recibi,
    totales: {
      porMetodo,
      totalCaja,
      totalAsistencia,
      descuadre: totalCaja - totalAsistencia,
      totalBruto,
      totalKalian,
      totalArtista,
      hayHistoricoFallback: ingresosFinanzas.some(f => f.esFallbackHistorico),
    },
  };
}
