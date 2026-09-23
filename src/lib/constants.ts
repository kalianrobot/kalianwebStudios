/** Email de la cuenta maestra con acceso admin garantizado. */
export const MASTER_EMAIL = "kalianrobot@gmail.com";

/** Aportación Kalian por defecto (€) cuando el evento no fija una propia. */
export const APORTACION_KALIAN_DEFAULT = 5;

/** Variante de precio de una entrada de evento, para el reparto Kalian/artista. */
export type VariantePrecio =
  | 'estandar'
  | 'descuento_socio'
  | 'cupon'
  | 'walkin_estandar'
  | 'walkin_socio'
  | 'gratis';
