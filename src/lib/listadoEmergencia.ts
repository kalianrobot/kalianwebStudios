/**
 * Filas del Listado de Emergencia (PDF de la puerta, ControlAcceso.tsx).
 *
 * Antes el PDF solo miraba `reserva.esSocio`, que significa "se aplicó precio
 * de socio al reservar", no "es socio". Por eso salían como NO SOCIO:
 * - socios cuya academia no tenía descuento en el evento,
 * - plazas verificadas como socio en la puerta (`slot.estado = 'validado_socio'`),
 * - todos los acompañantes (iban fijos a 'NO SOCIO'),
 * y nunca se marcaba a los profesores. Además, quien entraba con carnet o en
 * taquilla sin reserva no aparecía en el listado.
 *
 * Aquí se cruza cada persona con `socios` (doc ID = DNI) y `profesores`
 * (por email) para dar su categoría real. Módulo sin Firebase: lo usan la web
 * y los tests de tests/unit/listadoEmergencia.test.ts.
 */

export type CategoriaAsistente = 'PROFESOR/A' | 'SOCIO/A' | 'NO SOCIO';

export interface IndicePersonas {
  sociosPorDni: Map<string, any>;
  sociosPorEmail: Map<string, any>;
  profesoresEmails: Set<string>;
}

const norm = (s: unknown) => String(s ?? '').trim().toUpperCase();
const normEmail = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Prepara las búsquedas a partir de los docs de `socios` y `profesores` (con su `id`). */
export function indexarPersonas(socios: any[], profesores: any[]): IndicePersonas {
  const sociosPorDni = new Map<string, any>();
  const sociosPorEmail = new Map<string, any>();
  for (const s of socios) {
    const dni = norm(s.dni || s.id);
    if (dni) sociosPorDni.set(dni, s);
    const email = normEmail(s.email);
    if (email) sociosPorEmail.set(email, s);
  }
  const profesoresEmails = new Set<string>();
  for (const p of profesores) {
    const email = normEmail(p.email);
    if (email && p.activo !== false) profesoresEmails.add(email);
  }
  return { sociosPorDni, sociosPorEmail, profesoresEmails };
}

/**
 * Categoría de una persona. `validadoSocio` cubre la plaza verificada en
 * puerta con carnet, aunque el socio no esté en el índice.
 */
export function categoriaPersona(
  p: { dni?: string | null; email?: string | null; validadoSocio?: boolean },
  idx: IndicePersonas
): CategoriaAsistente {
  const dni = norm(p.dni);
  const email = normEmail(p.email);
  const socio = (dni && idx.sociosPorDni.get(dni)) || (email && idx.sociosPorEmail.get(email)) || null;

  const emailProfe = email || normEmail(socio?.email);
  if ((emailProfe && idx.profesoresEmails.has(emailProfe)) || socio?.rol === 'profesor') return 'PROFESOR/A';

  if (p.validadoSocio) return 'SOCIO/A';
  if (socio && socio.estado !== 'inactivo') return 'SOCIO/A';
  return 'NO SOCIO';
}

/** Columnas: Nombre, DNI, Categoría, Acomp., Total Pax, Importe, Ticket ID, Check Manual. */
export type FilaEmergencia = [string, string, CategoriaAsistente, string, string, string, string, string];

export interface ResumenEmergencia {
  filas: FilaEmergencia[];
  reservas: number;
  acompanantes: number;
  sinReserva: number;
  totalPersonas: number;
  porCategoria: Record<CategoriaAsistente, number>;
}

/**
 * Filas del listado: cada reserva (titular + acompañantes) y, después, las
 * entradas en puerta sin reserva (carnet de socio o taquilla) de `asistencias`.
 * `precioSlot` devuelve lo que se cobra en puerta por la plaza (lo pone la web,
 * que ya tiene esa regla en reparto.ts).
 */
export function filasListadoEmergencia(p: {
  reservas: any[];
  asistencias: any[];
  evento: any;
  indice: IndicePersonas;
  precioSlot?: (slot: any, reserva: any, evento: any) => number;
}): ResumenEmergencia {
  const { evento, indice } = p;
  const precioBase = Number(evento?.precio_estandar) || 0;
  const filas: FilaEmergencia[] = [];
  const porCategoria: Record<CategoriaAsistente, number> = { 'PROFESOR/A': 0, 'SOCIO/A': 0, 'NO SOCIO': 0 };
  const contar = (c: CategoriaAsistente) => { porCategoria[c]++; return c; };

  const reservas = p.reservas.filter(r => r.estado !== 'cancelada' && r.estado !== 'anulada');
  let acompanantes = 0;

  for (const r of reservas) {
    const numAcomp = Number(r.acompañantes ?? Math.max(0, Number(r.numPersonas || 1) - 1));
    const totalPax = Number(r.numPersonas ?? (1 + numAcomp));
    const slots = Array.isArray(r.slots) ? r.slots : [];
    acompanantes += numAcomp;

    const t = slots[0];
    const precioTitular = t && p.precioSlot ? p.precioSlot(t, r, evento) : Number(t?.precio ?? precioBase);
    filas.push([
      r.nombreTitular || 'N/A',
      r.dniTitular || 'N/A',
      contar(categoriaPersona({
        dni: r.dniTitular,
        email: r.emailTitular,
        validadoSocio: !!r.esSocio || t?.estado === 'validado_socio',
      }, indice)),
      String(numAcomp),
      String(totalPax),
      `${precioTitular}€`,
      r.ticketID || '',
      t?.ingresado ? 'DENTRO' : '',
    ]);

    for (let i = 0; i < numAcomp; i++) {
      const s = slots[i + 1];
      const dni = s?.dni || s?.socio_id || '';
      const nombre = s?.nombre || s?.socio_nombre;
      filas.push([
        nombre ? `  ↳ ${nombre}` : `  ↳ Acompañante ${i + 1}`,
        dni,
        contar(categoriaPersona({ dni, validadoSocio: s?.estado === 'validado_socio' }, indice)),
        '',
        '',
        `${Number(s?.precio ?? precioBase)}€`,
        r.ticketID || '',
        s?.ingresado ? 'DENTRO' : '',
      ]);
    }
  }

  // Entradas sin reserva: las de reserva ya están arriba (llevan reservaId).
  const sinReserva = p.asistencias.filter(a => !a.reservaId && (a.tipo === 'socio_carnet' || a.tipo === 'walk-in'));
  for (const a of sinReserva) {
    const esCarnet = a.tipo === 'socio_carnet';
    filas.push([
      a.nombre || (esCarnet ? 'Soci@ (carnet)' : 'Entrada en puerta'),
      a.socioId || '',
      contar(categoriaPersona({ dni: a.socioId, validadoSocio: !!a.socioId }, indice)),
      '',
      '1',
      `${Number(a.precio) || 0}€`,
      esCarnet ? 'CARNET' : 'TAQUILLA',
      'DENTRO',
    ]);
  }

  const totalPersonas = reservas.reduce((s, r) => s + Number(r.numPersonas ?? (1 + Number(r.acompañantes || 0))), 0) + sinReserva.length;
  return { filas, reservas: reservas.length, acompanantes, sinReserva: sinReserva.length, totalPersonas, porCategoria };
}
