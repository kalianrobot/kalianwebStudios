import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, Timestamp, setDoc, doc } from 'firebase/firestore';
import { APORTACION_KALIAN_DEFAULT, VariantePrecio } from './constants';

export type CategoriaIngreso = 'Socio' | 'Curso' | 'Evento' | 'Aportación Socio Local' | 'Cierre Aportación Curso' | 'Pago Artista';
export type MetodoPago = 'Efectivo' | 'Tarjeta' | 'Transferencia';

export interface IngresoData {
  monto: number;
  concepto: string;
  categoria: CategoriaIngreso | 'cuota_socio';
  metodo: MetodoPago;
  socio_id?: string;
  local_id?: string;
  cursoId?: string;
  staff_id?: string;
  mes?: number;
  anio?: number;
  eventoId?: string;
  /** Solo para categoria == 'Evento': total cobrado en caja por esa entrada. */
  monto_bruto?: number;
  /** Solo para categoria == 'Evento': parte que corresponde al artista (monto_bruto - monto). */
  monto_artista?: number;
  /** Solo para categoria == 'Evento': variante de precio cobrada. */
  variante_precio?: VariantePrecio;
}

/** Segmento de `evento.aportacion_kalian_<segmento>` que corresponde a cada variante de precio. */
export const segmentoDeVariante = (variante: VariantePrecio): 'estandar' | 'descuento' | 'cupon' => {
  if (variante === 'descuento_socio' || variante === 'walkin_socio') return 'descuento';
  if (variante === 'cupon') return 'cupon';
  return 'estandar';
};

/** Aportación Kalian configurada en el evento para una variante, con fallback al default. */
export const resolverAportacionKalian = (variante: VariantePrecio, evento: any): number => {
  const campo = `aportacion_kalian_${segmentoDeVariante(variante)}`;
  const valor = evento?.[campo];
  return typeof valor === 'number' ? valor : APORTACION_KALIAN_DEFAULT;
};

/** Reparto de una entrada: kalian nunca supera el precio cobrado, artista nunca es negativo. */
export const calcularReparto = (precio: number, kalianConfigurada: number): { kalian: number; artista: number } => {
  const precioSeguro = Math.max(0, precio);
  const kalian = Math.min(Math.max(0, kalianConfigurada), precioSeguro);
  return { kalian, artista: precioSeguro - kalian };
};

/**
 * Determina la variante de precio de una entrada a partir del contexto de cobro.
 * `precio == 0` siempre es 'gratis', sea cual sea el origen.
 */
export const resolverVariantePrecio = (opts: {
  precio: number;
  origen: 'reserva' | 'walkin' | 'socio_carnet';
  esSocio: boolean;
  esCupon?: boolean;
}): VariantePrecio => {
  if (opts.precio <= 0) return 'gratis';
  if (opts.origen === 'walkin') return opts.esSocio ? 'walkin_socio' : 'walkin_estandar';
  if (opts.esSocio) return 'descuento_socio';
  if (opts.origen === 'reserva' && opts.esCupon) return 'cupon';
  return 'estandar';
};

export const registrarIngreso = async (data: IngresoData) => {
  try {
    const { categoria, socio_id, mes, anio } = data;
    
    // Si es una cuota de socio, usamos un ID determinista para evitar duplicados
    if ((categoria === 'Socio' || categoria === 'cuota_socio') && socio_id && mes && anio) {
      const docId = `CUOTA_${anio}_${mes}_${socio_id}`;
      await setDoc(doc(db, "finanzas", docId), {
        ...data,
        categoria: 'Socio', // Normalizamos a 'Socio'
        fecha: serverTimestamp(),
        deletedAt: null
      });
    } else {
      await addDoc(collection(db, "finanzas"), {
        ...data,
        fecha: serverTimestamp(),
        deletedAt: null
      });
    }
  } catch (error) {
    console.error("❌ Error al registrar ingreso en finanzas:", error);
    throw error;
  }
};
