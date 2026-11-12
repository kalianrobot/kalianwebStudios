import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { calcularCierreEvento, CierreEvento } from './cierreEvento';

// Tipos y cálculo del cierre: viven en ./cierreEvento (módulo sin Firebase) y se
// re-exportan aquí para no cambiar los imports existentes.
export {
  ETIQUETA_VARIANTE,
  construirRecibiArtista,
  calcularCierreEvento,
} from './cierreEvento';
export type {
  EntradaQR,
  EntradaWalkIn,
  ReservaNoShow,
  IngresoFinanzasEvento,
  PagoArtista,
  EntradaRecibi,
  FilaResumenVariante,
  RecibiArtista,
  CierreEvento,
  DocLeido,
} from './cierreEvento';

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

  const leer = (snap: { docs: { id: string; data: () => any }[] }) =>
    snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  return calcularCierreEvento({
    evento,
    asistencias: leer(asistenciaSnap),
    reservas: leer(reservasSnap),
    finanzas: leer(finanzasSnap),
  });
}
