import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Sincroniza el estado de un socio basado en sus actividades vigentes.
 * Un socio es INACTIVO si:
 * 1. No tiene cursos cuya fecha_fin >= hoy.
 * 2. No pertenece a un local con pago activo en el mes actual.
 */
export const syncSocioStatus = async (socioId: string) => {
  try {
    const socioRef = doc(db, "socios", socioId);
    const socioSnap = await getDoc(socioRef);
    
    if (!socioSnap.exists()) return;
    const socio = socioSnap.data();
    
    const hoy = new Date().toISOString().split('T')[0];
    const mesActual = new Date().getMonth() + 1;
    const anioActual = new Date().getFullYear();
    const mesAnioKey = `${anioActual}_${mesActual}`;
    const mesAnterior = mesActual === 1 ? 12 : mesActual - 1;
    const anioMesAnterior = mesActual === 1 ? anioActual - 1 : anioActual;
    const mesAnioKeyAnterior = `${anioMesAnterior}_${mesAnterior}`;

    // 1. Comprobar cursos activos
    let hasActiveCourse = false;
    if (socio.cursos && socio.cursos.length > 0) {
      // Fetch only the courses the socio is enrolled in
      const cursosPromises = socio.cursos.map((cId: string) => getDoc(doc(db, "cursos", cId)));
      const cursosSnaps = await Promise.all(cursosPromises);
      
      hasActiveCourse = cursosSnaps.some(snap => {
        if (!snap.exists()) return false;
        const data = snap.data();
        return !data.deletedAt && data.fechaFin >= hoy;
      });
    }

    // 2. Comprobar local activo
    let hasActiveLocal = false;
    if (socio.localId) {
      const localSnap = await getDoc(doc(db, "locales", socio.localId));
      if (localSnap.exists()) {
        const ultimoPago = localSnap.data().ultimoPagoMesAnio;
        hasActiveLocal = ultimoPago === mesAnioKey || ultimoPago === mesAnioKeyAnterior;
      }
    }

    const shouldBeActive = hasActiveCourse || hasActiveLocal;
    
    if (!shouldBeActive && socio.estado !== 'inactivo') {
      await updateDoc(socioRef, {
        estado: 'inactivo',
        membresias: {} // Limpiamos categorías para que no salgan en el carnet
      });
      return 'inactivo';
    } else if (shouldBeActive && socio.estado !== 'activo') {
      await updateDoc(socioRef, {
        estado: 'activo'
      });
      return 'activo';
    }
    
    return socio.estado;
  } catch (error) {
    console.error("Error sincronizando estado del socio:", error);
    return null;
  }
};

/**
 * Sincroniza el estado de múltiples socios (ej. al borrar un curso o pagar un local)
 */
export const syncMultipleSocios = async (socioIds: string[]) => {
  const uniqueIds = Array.from(new Set(socioIds));
  const promises = uniqueIds.map(id => syncSocioStatus(id));
  await Promise.all(promises);
};
