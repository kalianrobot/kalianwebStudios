/**
 * Normaliza un texto a slug para usar como ID de documento.
 * Quita acentos, colapsa lo no alfanumérico en guiones y recorta guiones sobrantes.
 * Por defecto MAYÚSCULAS; usa { lowercase: true } para minúsculas.
 */
export const normalizeToSlug = (str: string, opts: { lowercase?: boolean } = {}): string => {
  const stripped = (str || '').normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cased = opts.lowercase ? stripped.toLowerCase() : stripped.toUpperCase();
  const pattern = opts.lowercase ? /[^a-z0-9]/g : /[^A-Z0-9]/g;
  return cased.replace(pattern, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
};
