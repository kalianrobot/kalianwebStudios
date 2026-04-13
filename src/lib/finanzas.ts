import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

export type CategoriaIngreso = 'Socio' | 'Curso' | 'Evento';
export type MetodoPago = 'Efectivo' | 'Tarjeta' | 'Transferencia';

export interface IngresoData {
  monto: number;
  concepto: string;
  categoria: CategoriaIngreso;
  metodo: MetodoPago;
  socio_id?: string;
  local_id?: string;
  staff_id?: string;
}

export const registrarIngreso = async (data: IngresoData) => {
  try {
    await addDoc(collection(db, "finanzas"), {
      ...data,
      fecha: serverTimestamp()
    });
    console.log("✅ Ingreso registrado en finanzas:", data.concepto);
  } catch (error) {
    console.error("❌ Error al registrar ingreso en finanzas:", error);
    throw error;
  }
};
