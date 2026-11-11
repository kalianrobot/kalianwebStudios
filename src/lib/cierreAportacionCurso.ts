// Cierre mensual de aportación de curso (update-cierre-aportacion-curso).
// Lógica pura, sin Firebase, para poder testearla.

export type TipoAportacion = 'fija' | 'variable';
export type OrigenImporte = 'fijo' | 'pagos_profesor' | 'manual';

export interface CursoAportacion {
  tipoAportacion?: unknown;
  aportacionFijaMensual?: unknown;
}

/** Cursos sin tipo (históricos) se tratan como variables. */
export const tipoAportacionCurso = (curso: CursoAportacion): TipoAportacion =>
  curso.tipoAportacion === 'fija' ? 'fija' : 'variable';

const numeroValido = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/**
 * Importe que se propone al admin al cerrar el mes.
 * - fija: aportacionFijaMensual (null si no está configurado o es <= 0).
 * - variable: suma de lo marcado por el profesor (null si no hay nada).
 */
export const importePropuesto = (
  curso: CursoAportacion,
  totalPagosProfesor: number
): { importe: number | null; origen: OrigenImporte } => {
  if (tipoAportacionCurso(curso) === 'fija') {
    const fijo = numeroValido(curso.aportacionFijaMensual);
    return fijo !== null && fijo > 0
      ? { importe: fijo, origen: 'fijo' }
      : { importe: null, origen: 'manual' };
  }
  return totalPagosProfesor > 0
    ? { importe: totalPagosProfesor, origen: 'pagos_profesor' }
    : { importe: null, origen: 'manual' };
};

/**
 * Valida lo que el admin confirma. Devuelve el importe y su origen, o null
 * si el importe no es válido (vacío, no numérico, 0 o negativo).
 * Si coincide con el propuesto se conserva el origen; si no, es manual.
 */
export const confirmarImporte = (
  entrada: string | null,
  propuesto: { importe: number | null; origen: OrigenImporte }
): { importe: number; origen: OrigenImporte } | null => {
  if (entrada === null) return null;
  const limpio = entrada.trim();
  if (!limpio) return null;
  const n = numeroValido(limpio);
  if (n === null || n <= 0) return null;
  const importe = Math.round(n * 100) / 100;
  const origen = propuesto.importe !== null && importe === propuesto.importe ? propuesto.origen : 'manual';
  return { importe, origen };
};

export const etiquetaOrigen = (origen: OrigenImporte): string =>
  origen === 'fijo' ? 'importe fijo' : origen === 'pagos_profesor' ? 'pagos del profesor' : 'importe manual';
