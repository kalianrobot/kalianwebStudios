// DNI/NIE español: 8 dígitos + letra, o letra inicial X/Y/Z + 7 dígitos + letra.
export const DNI_NIE_REGEX = /^[0-9XYZ][0-9]{7}[A-Z]$/;

// Tabla del algoritmo oficial: la letra es el resto de dividir el número
// entre 23, indexado en esta cadena de 23 posiciones.
const LETRAS_CONTROL = 'TRWAGMYFPDXBNJZSQVHLCKE';

// X/Y/Z inicial de un NIE se sustituye por su valor numérico antes de calcular
// el resto (X=0, Y=1, Z=2), igual que exige el algoritmo oficial.
const NIE_PREFIJOS: Record<string, string> = { X: '0', Y: '1', Z: '2' };

export const normalizeDni = (raw: string): string => raw.trim().toUpperCase();

// Calcula la letra de control esperada para un DNI/NIE con formato válido.
// Devuelve null si `dni` no tiene el formato correcto (no intenta adivinar).
export const calcularLetraDni = (dni: string): string | null => {
  if (!DNI_NIE_REGEX.test(dni)) return null;
  const numeroStr = NIE_PREFIJOS[dni[0]] !== undefined
    ? NIE_PREFIJOS[dni[0]] + dni.slice(1, 8)
    : dni.slice(0, 8);
  return LETRAS_CONTROL[Number(numeroStr) % 23];
};

// Formato + letra de control real (algoritmo oficial del DNI/NIE español):
// la letra se calcula a partir de los dígitos, no es libre. Un DNI con
// formato correcto pero letra incorrecta (ej. típo al teclear) se rechaza.
export const isValidDni = (dni: string): boolean => {
  const letraEsperada = calcularLetraDni(dni);
  return letraEsperada !== null && dni[8] === letraEsperada;
};
