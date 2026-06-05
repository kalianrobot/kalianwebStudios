import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, Timestamp, setDoc, doc } from 'firebase/firestore';

export type CategoriaIngreso = 'Socio' | 'Curso' | 'Evento' | 'Aportación Socio Local';
export type MetodoPago = 'Efectivo' | 'Tarjeta' | 'Transferencia';

export interface IngresoData {
  monto: number;
  concepto: string;
  categoria: CategoriaIngreso | 'cuota_socio';
  metodo: MetodoPago;
  socio_id?: string;
  local_id?: string;
  staff_id?: string;
  mes?: number;
  anio?: number;
  eventoId?: string;
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
