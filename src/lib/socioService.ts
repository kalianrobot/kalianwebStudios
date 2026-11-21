import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

/**
 * Criterio ÚNICO de socio activo / inactivo (DOCUMENTATION.md §2.2).
 *
 * Un socio es ACTIVO si cumple al menos una:
 * 1. Tiene un curso inscrito con `fechaFin >= hoy` y sin `deletedAt`.
 * 2. Pertenece a un local cuyo `ultimoPagoMesAnio` es el mes actual o el
 *    anterior (1 mes de gracia).
 *
 * Las fechas de `membresias` NO cuentan: son la vigencia que se muestra en el
 * carnet, no la actividad real. Esta función es pura para que la usen igual
 * `syncSocioStatus` (que escribe `estado`) y el panel de Socios (pestañas,
 * badges, bloqueo de 4 meses y botón Eliminar).
 */

export type EstadoSocio = 'activo' | 'inactivo';

export interface CursoParaEstado {
  fechaFin?: string;
  deletedAt?: unknown;
}

export interface LocalParaEstado {
  ultimoPagoMesAnio?: string;
}

export interface SocioParaEstado {
  cursos?: string[];
  localId?: string;
  fechaAlta?: string;
}

const isoDia = (d: Date) => d.toISOString().split('T')[0];

const claveMes = (anio: number, mes: number) => `${anio}_${mes}`;

/** Claves `AAAA_M` del mes actual y del anterior (mes de gracia). */
export const clavesMesVigente = (ahora: Date = new Date()): [string, string] => {
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anioAnt = mes === 1 ? anio - 1 : anio;
  return [claveMes(anio, mes), claveMes(anioAnt, mesAnt)];
};

export const calcularEstadoSocio = (
  socio: SocioParaEstado,
  cursos: Record<string, CursoParaEstado | undefined>,
  locales: Record<string, LocalParaEstado | undefined>,
  ahora: Date = new Date()
): EstadoSocio => {
  const hoy = isoDia(ahora);

  const tieneCurso = (socio.cursos || []).some(cId => {
    const c = cursos[cId];
    return !!c && !c.deletedAt && !!c.fechaFin && c.fechaFin >= hoy;
  });
  if (tieneCurso) return 'activo';

  if (socio.localId) {
    const ultimoPago = locales[socio.localId]?.ultimoPagoMesAnio;
    const [actual, anterior] = clavesMesVigente(ahora);
    if (ultimoPago === actual || ultimoPago === anterior) return 'activo';
  }

  return 'inactivo';
};

/**
 * Último día en que el socio estuvo (o estará) activo según el mismo criterio:
 * el `fechaFin` más tardío de sus cursos no borrados, o el último día del mes
 * de gracia de su local. Si no hay ninguno, su `fechaAlta`. Sirve para contar
 * cuánto tiempo lleva inactivo (bloqueo de 4 meses y botón Eliminar a 120 días).
 */
export const ultimaFechaActividad = (
  socio: SocioParaEstado,
  cursos: Record<string, CursoParaEstado | undefined>,
  locales: Record<string, LocalParaEstado | undefined>
): string => {
  const fechas: string[] = [];

  for (const cId of socio.cursos || []) {
    const c = cursos[cId];
    if (c && !c.deletedAt && c.fechaFin) fechas.push(c.fechaFin);
  }

  if (socio.localId) {
    const pago = locales[socio.localId]?.ultimoPagoMesAnio;
    const m = /^(\d{4})_(\d{1,2})$/.exec(pago || '');
    if (m) {
      // Último día del mes siguiente al pago (fin del mes de gracia), en UTC.
      const fin = new Date(Date.UTC(Number(m[1]), Number(m[2]) + 1, 0));
      fechas.push(isoDia(fin));
    }
  }

  if (fechas.length > 0) return fechas.sort().reverse()[0];
  return socio.fechaAlta?.split('T')[0] || '1900-01-01';
};

/** Días transcurridos desde la última actividad (negativo si sigue activo en el futuro). */
export const diasSinActividad = (ultimaActividad: string, ahora: Date = new Date()): number =>
  (ahora.getTime() - new Date(ultimaActividad).getTime()) / (1000 * 60 * 60 * 24);

/**
 * Recalcula y guarda `socios/{id}.estado` con el criterio único.
 * Solo escribe si el estado cambia.
 */
export const syncSocioStatus = async (socioId: string) => {
  try {
    const socioRef = doc(db, "socios", socioId);
    const socioSnap = await getDoc(socioRef);

    if (!socioSnap.exists()) return;
    const socio = socioSnap.data();

    const cursos: Record<string, CursoParaEstado | undefined> = {};
    if (socio.cursos && socio.cursos.length > 0) {
      const snaps = await Promise.all(
        socio.cursos.map((cId: string) => getDoc(doc(db, "cursos", cId)))
      );
      snaps.forEach((snap, i) => {
        if (snap.exists()) cursos[socio.cursos[i]] = snap.data() as CursoParaEstado;
      });
    }

    const locales: Record<string, LocalParaEstado | undefined> = {};
    if (socio.localId) {
      const localSnap = await getDoc(doc(db, "locales", socio.localId));
      if (localSnap.exists()) locales[socio.localId] = localSnap.data() as LocalParaEstado;
    }

    const nuevoEstado = calcularEstadoSocio(socio, cursos, locales);

    if (socio.estado !== nuevoEstado) {
      // Solo cambiamos el estado: las membresias contienen la vigencia firmada
      // (ej: membresias.local = '2099-12-31') y no deben borrarse porque el
      // socio no pague un mes — eso lo gestiona pagos_mensuales por separado.
      await updateDoc(socioRef, { estado: nuevoEstado });
      return nuevoEstado;
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
