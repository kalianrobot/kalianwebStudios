// DNI/NIE español: 8 dígitos + letra, o letra inicial X/Y/Z + 7 dígitos + letra.
export const DNI_NIE_REGEX = /^[0-9XYZ][0-9]{7}[A-Z]$/;

export const normalizeDni = (raw: string): string => raw.trim().toUpperCase();

export const isValidDni = (dni: string): boolean => DNI_NIE_REGEX.test(dni);
