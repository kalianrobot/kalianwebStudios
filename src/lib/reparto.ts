/**
 * Cálculo de precio y reparto Kalian/artista de una entrada de evento.
 * Módulo puro (sin Firebase): lo usan `finanzas.ts`, `puerta.ts` y los
 * scripts de QA (scripts/qa/). `finanzas.ts` lo re-exporta.
 */
import { APORTACION_KALIAN_DEFAULT, type VariantePrecio } from './constants';

export type MetodoPago = 'Efectivo' | 'Tarjeta' | 'Transferencia';

/** Segmento de `evento.aportacion_kalian_<segmento>` que corresponde a cada variante de precio. */
export const segmentoDeVariante = (variante: VariantePrecio): 'estandar' | 'descuento' | 'cupon' => {
  if (variante === 'descuento_socio' || variante === 'walkin_socio') return 'descuento';
  if (variante === 'cupon') return 'cupon';
  return 'estandar';
};

/** Aportación Kalian configurada en el evento para una variante, con fallback al default. */
export const resolverAportacionKalian = (variante: VariantePrecio, evento: any): number => {
  const campo = `aportacion_kalian_${segmentoDeVariante(variante)}`;
  const valor = evento?.[campo];
  return typeof valor === 'number' ? valor : APORTACION_KALIAN_DEFAULT;
};

/** Reparto de una entrada: kalian nunca supera el precio cobrado, artista nunca es negativo. */
export const calcularReparto = (precio: number, kalianConfigurada: number): { kalian: number; artista: number } => {
  const precioSeguro = Math.max(0, precio);
  const kalian = Math.min(Math.max(0, kalianConfigurada), precioSeguro);
  return { kalian, artista: precioSeguro - kalian };
};

/**
 * Determina la variante de precio de una entrada a partir del contexto de cobro.
 * `precio == 0` siempre es 'gratis', sea cual sea el origen.
 */
export const resolverVariantePrecio = (opts: {
  precio: number;
  origen: 'reserva' | 'walkin' | 'socio_carnet';
  esSocio: boolean;
  esCupon?: boolean;
}): VariantePrecio => {
  if (opts.precio <= 0) return 'gratis';
  if (opts.origen === 'walkin') return opts.esSocio ? 'walkin_socio' : 'walkin_estandar';
  if (opts.esSocio) return 'descuento_socio';
  if (opts.origen === 'reserva' && opts.esCupon) return 'cupon';
  return 'estandar';
};

/**
 * Precio que debe cobrarse en puerta por un slot de reserva.
 *
 * Las reservas creadas antes de corregir `ReservaForm` guardaban al titular con
 * el precio estándar aunque se le había aplicado el cupón (el `totalPagar` sí lo
 * reflejaba). Si el titular sigue pendiente, la reserva trae el cupón vigente del
 * evento y su precio es menor que el guardado, se cobra el precio del cupón.
 * En cualquier otro caso devuelve el precio guardado en el slot.
 */
export const precioSlotEnPuerta = (slot: any, reserva: any, evento: any): number => {
  const precioGuardado = Number(slot?.precio) || 0;
  if (slot?.tipo !== 'titular' || slot?.estado !== 'pendiente') return precioGuardado;
  const cuponReserva = String(reserva?.cuponUsado || '').trim().toUpperCase();
  const cuponEvento = String(evento?.cupon || '').trim().toUpperCase();
  if (!cuponReserva || cuponReserva !== cuponEvento) return precioGuardado;
  const precioCupon = Number(evento?.precioCupon);
  if (!Number.isFinite(precioCupon) || precioCupon < 0) return precioGuardado;
  return Math.min(precioCupon, precioGuardado);
};
