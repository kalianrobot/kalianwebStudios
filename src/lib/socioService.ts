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

    // 1. Comprobar cursos activos
    let hasActiveCourse = false;
    if (socio.cursos && socio.cursos.length > 0) {
      // Firestore 'in' query limit is 10/30 depending on version, but usually socios don't have many courses
      // We'll fetch them and filter
      const cursosSnap = await getDocs(query(collection(db, "cursos"), where("deletedAt", "==", null)));
      const cursosActivosIds = cursosSnap.docs
        .filter(d => d.data().fechaFin >= hoy)
        .map(d => d.id);
      
      hasActiveCourse = socio.cursos.some((cId: string) => cursosActivosIds.includes(cId));
    }

    // 2. Comprobar local activo
    let hasActiveLocal = false;
    if (socio.localId) {
      const localSnap = await getDoc(doc(db, "locales", socio.localId));
      if (localSnap.exists()) {
        hasActiveLocal = localSnap.data().ultimoPagoMesAnio === mesAnioKey;
      }
    }

    const shouldBeActive = hasActiveCourse || hasActiveLocal;
    
    if (!shouldBeActive && socio.estado !== 'inactivo') {
      await updateDoc(socioRef, {
        estado: 'inactivo',
        membresias: {} // Limpiamos categorías para que no salgan en el carnet
      });
      console.log(`Socio ${socioId} marcado como INACTIVO`);
      return 'inactivo';
    } else if (shouldBeActive && socio.estado !== 'activo') {
      await updateDoc(socioRef, {
        estado: 'activo'
      });
      console.log(`Socio ${socioId} marcado como ACTIVO`);
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
