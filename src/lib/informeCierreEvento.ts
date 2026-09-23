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

export interface CierreEvento {
  evento: any;
  entradasQR: EntradaQR[];
  entradasWalkIn: EntradaWalkIn[];
  reservasNoShow: ReservaNoShow[];
  ingresosFinanzas: IngresoFinanzasEvento[];
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
