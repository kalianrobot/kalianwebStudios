import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, Timestamp, setDoc, doc } from 'firebase/firestore';
import { VariantePrecio } from './constants';
import type { MetodoPago } from './reparto';

// Cálculo de precio y reparto: viven en ./reparto (módulo sin Firebase) y se
// re-exportan aquí para no cambiar los imports existentes.
export {
  segmentoDeVariante,
  resolverAportacionKalian,
  calcularReparto,
  resolverVariantePrecio,
  precioSlotEnPuerta,
} from './reparto';
export type { MetodoPago } from './reparto';

export type CategoriaIngreso = 'Socio' | 'Curso' | 'Evento' | 'Aportación Socio Local' | 'Cierre Aportación Curso' | 'Pago Artista';

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
