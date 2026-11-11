/**
 * Lógica de entrada en puerta (Control de Acceso), separada de la pantalla.
 * Módulo puro (sin Firebase): decide precio, variante, reparto y qué se
 * escribe en `asistencia_eventos`, `finanzas` y en las plazas de la reserva.
 * `ControlAcceso.tsx` hace las lecturas/escrituras con estos resultados; los
 * scripts de QA (scripts/qa/) usan lo mismo para simular la puerta en test.
 *
 * Lo que aquí se devuelve NO lleva `fecha`: la pone quien escribe
 * (`serverTimestamp()` en la web, `Timestamp.now()` en los scripts).
 */
import type { VariantePrecio } from './constants';
import { tieneDescuentoSocio } from './descuentoSocio';
import { type MetodoPago, calcularReparto, precioSlotEnPuerta, resolverAportacionKalian, resolverVariantePrecio } from './reparto';
import { ajustarSlotsAcompanantes } from './slots';

/** Movimiento de `finanzas` de una entrada (mismos campos que `IngresoData` de finanzas.ts). */
export interface IngresoEntrada {
  monto: number;
  monto_bruto: number;
  monto_artista: number;
  variante_precio: VariantePrecio;
  concepto: string;
  categoria: 'Evento';
  metodo: MetodoPago;
  socio_id: string;
  staff_id: string | undefined;
  eventoId: string;
}

/** Resultado de una entrada: qué apuntar en asistencia, en finanzas (si se cobra) y en caja. */
export interface EntradaPuerta {
  precio: number;
  asistencia: Record<string, any>;
  /** null si la entrada es gratis (no genera movimiento en finanzas). */
  ingreso: IngresoEntrada | null;
}

/** Fecha 'YYYY-MM-DD' que usa la puerta para comprobar membresías en vigor. */
export const hoyPuerta = (ahora: Date = new Date()) => ahora.toISOString().split('T')[0];

/** Nº de acompañantes de una reserva, con fallback para reservas antiguas. */
export const plazasAcompanantes = (r: any): number => {
  if (typeof r.acompañantes === 'number') return r.acompañantes;
  if (typeof r.numPersonas === 'number') return Math.max(0, r.numPersonas - 1);
  return Math.max(0, (Array.isArray(r.slots) ? r.slots.length : 1) - 1);
};

/**
 * Plazas que muestra la puerta para una reserva. Construye slots virtuales para
 * reservas legacy sin el campo `slots`, ajusta las plazas a los acompañantes y
 * corrige el precio del titular con cupón (ver `precioSlotEnPuerta`).
 */
export const slotsDesdeReserva = (r: any, evento: any): any[] => {
  if (Array.isArray(r.slots) && r.slots.length > 0) {
    const plazas = ajustarSlotsAcompanantes(r.slots, plazasAcompanantes(r), Number(evento?.precio_estandar) || 0);
    return plazas.map((s: any) => ({ ...s, precio: precioSlotEnPuerta(s, r, evento) }));
  }
  const total = 1 + (r.acompañantes || 0);
  const precioBase = r.precioPorPersona || r.totalPagado / Math.max(1, total) || 0;
  const titular = {
    tipo: 'titular',
    nombre: r.nombreTitular,
    dni: r.dniTitular,
    email: r.emailTitular,
    estado: r.esSocio ? 'validado_socio' : 'pendiente',
    precio: precioBase,
    ingresado: false
  };
  const acomps = Array.from({ length: total - 1 }, () => ({
    tipo: 'acompañante', estado: 'pendiente', precio: precioBase, ingresado: false
  }));
  return [titular, ...acomps];
};

/** Precio de socio del evento (si tiene descuento) o el estándar. */
export const precioSocioEnEvento = (evento: any, tieneDescuento: boolean): number =>
  tieneDescuento ? (evento.precio_descuento || 0) : (evento.precio_estandar || 0);

/** Movimiento de finanzas de una entrada cobrada; null si es gratis. */
export function ingresoEntrada(p: {
  evento: any;
  precio: number;
  origen: 'reserva' | 'walkin' | 'socio_carnet';
  esSocio: boolean;
  esCupon?: boolean;
  concepto: string;
  metodo: MetodoPago;
  socioId: string;
  staffId: string | undefined;
}): IngresoEntrada | null {
  if (!(p.precio > 0)) return null;
  const variante = resolverVariantePrecio({ precio: p.precio, origen: p.origen, esSocio: p.esSocio, esCupon: p.esCupon });
  const { kalian, artista } = calcularReparto(p.precio, resolverAportacionKalian(variante, p.evento));
  return {
    monto: kalian,
    monto_bruto: p.precio,
    monto_artista: artista,
    variante_precio: variante,
    concepto: p.concepto,
    categoria: 'Evento',
    metodo: p.metodo,
    socio_id: p.socioId,
    staff_id: p.staffId,
    eventoId: p.evento.id,
  };
}

/** ID fijo de la asistencia de un socio con carnet: un carnet entra una vez por evento. */
export const idAsistenciaCarnet = (eventoId: string, socioId: string) => `${eventoId}_${socioId}`;

/** Entrada de un socio con su carnet, sin reserva. */
export function entradaSocioCarnet(p: {
  evento: any;
  socio: { id: string; nombre?: string; membresias?: any };
  hoy: string;
  metodo: MetodoPago;
  staffId: string | undefined;
}): EntradaPuerta & { asistenciaId: string; tieneDescuento: boolean } {
  const tieneDescuento = tieneDescuentoSocio(p.socio.membresias, p.evento, p.hoy);
  const precio = precioSocioEnEvento(p.evento, tieneDescuento);
  return {
    precio,
    tieneDescuento,
    asistenciaId: idAsistenciaCarnet(p.evento.id, p.socio.id),
    asistencia: {
      eventoId: p.evento.id,
      socioId: p.socio.id,
      nombre: p.socio.nombre,
      precio,
      tipo: 'socio_carnet',
    },
    ingreso: ingresoEntrada({
      evento: p.evento, precio, origen: 'socio_carnet', esSocio: tieneDescuento,
      concepto: `Entrada Evento: ${p.evento.titulo} (Soci@)`,
      metodo: p.metodo, socioId: p.socio.id, staffId: p.staffId,
    }),
  };
}

/** Plaza de reserva verificada como socio en puerta: pasa a precio de socio. */
export const slotComoSocio = (slot: any, evento: any, socio: { id: string; nombre?: string }) => ({
  ...slot,
  estado: 'validado_socio',
  precio: evento.precio_descuento || 0,
  socio_id: socio.id,
  socio_nombre: socio.nombre,
});

/**
 * Marca como ingresada la plaza `slotIdx` sobre las plazas leídas del servidor.
 * `slotLocal` es la plaza tal como la ve la puerta (precio corregido por cupón,
 * verificación de socio). Devuelve null si esa plaza ya había entrado.
 */
export function marcarSlotIngresado(p: {
  reservaServidor: any;
  evento: any;
  slotIdx: number;
  slotLocal: any;
}): { slots: any[]; ingresados: number; total: number; estado: 'validado' | 'pendiente' } | null {
  const slots = ajustarSlotsAcompanantes(
    [...(p.reservaServidor.slots || [])], plazasAcompanantes(p.reservaServidor), Number(p.evento.precio_estandar) || 0
  );
  if (!slots[p.slotIdx] || slots[p.slotIdx].ingresado) return null;

  // Persistimos el precio cobrado (puede venir corregido por cupón) para
  // que la reserva cuadre con lo registrado en asistencia y finanzas.
  slots[p.slotIdx] = {
    ...slots[p.slotIdx],
    ingresado: true,
    precio: p.slotLocal.precio || 0,
    // Si se verificó como socio en puerta, la reserva lo guarda también.
    ...(p.slotLocal.estado === 'validado_socio'
      ? { estado: 'validado_socio', socio_id: p.slotLocal.socio_id || null, socio_nombre: p.slotLocal.socio_nombre || null }
      : {}),
  };
  const ingresados = slots.filter((s: any) => s.ingresado).length;
  const total = slots.length;
  return { slots, ingresados, total, estado: ingresados >= total ? 'validado' : 'pendiente' };
}

/** Entrada de una plaza de reserva: asistencia y finanzas. */
export function entradaSlotReserva(p: {
  evento: any;
  reserva: any;
  slot: any;
  metodo: MetodoPago;
  staffId: string | undefined;
}): EntradaPuerta {
  const { evento, reserva, slot } = p;
  const precio = slot.precio || 0;
  const esSocio = slot.estado === 'validado_socio';
  const esCupon = slot.tipo === 'titular' && !!reserva.cuponUsado;
  return {
    precio,
    asistencia: {
      eventoId: evento.id,
      reservaId: reserva.id,
      ticketID: reserva.ticketID,
      slotTipo: slot.tipo,
      slotNombre: slot.nombre || null,
      slotDni: slot.dni || null,
      socioId: slot.socio_id || null,
      precio,
      tipo: esSocio ? 'reserva_socio' : 'reserva',
    },
    ingreso: ingresoEntrada({
      evento, precio, origen: 'reserva', esSocio, esCupon,
      concepto: `Entrada Evento: ${evento.titulo} (${slot.tipo}${esSocio ? ' Soci@' : ''})`,
      metodo: p.metodo, socioId: slot.socio_id || 'anonimo', staffId: p.staffId,
    }),
  };
}

/** Precio de una entrada en puerta sin reserva: estándar, o de socio si se verificó. */
export const precioWalkIn = (evento: any, socioVerificado: boolean): number =>
  socioVerificado ? (evento.precio_descuento || 0) : (evento.precio_estandar || 0);

/** Entrada en puerta sin reserva (walk-in), normal o de socio verificado. */
export function entradaWalkIn(p: {
  evento: any;
  precio: number;
  socio: { id: string; nombre?: string } | null;
  staff: 'admin' | 'portero';
  metodo: MetodoPago;
  staffId: string | undefined;
}): EntradaPuerta {
  const { evento, precio, socio } = p;
  const esSocio = !!socio;
  return {
    precio,
    asistencia: {
      eventoId: evento.id,
      tipo: 'walk-in',
      staff: p.staff,
      precio,
      ...(esSocio ? { socioId: socio!.id, nombre: socio!.nombre } : {}),
    },
    ingreso: ingresoEntrada({
      evento, precio, origen: 'walkin', esSocio,
      concepto: `Entrada Puerta: ${evento.titulo} (Walk-in${esSocio ? ' Soci@' : ''})`,
      metodo: p.metodo, socioId: esSocio ? socio!.id : 'anonimo', staffId: p.staffId,
    }),
  };
}

/** Plazas libres reales: aforo máximo menos los que han entrado y las reservas pendientes. */
export const plazasLibres = (evento: any): number => {
  if (!evento) return 0;
  const totalOcupado = (evento.aforo_actual || 0) + (evento.aforo_reservado || 0);
  return Math.max(0, (evento.aforo_maximo || 0) - totalOcupado);
};
