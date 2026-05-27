// Formato de fechas con soporte robusto para euskera.
// Intl.DateTimeFormat en muchos navegadores no soporta bien 'eu-ES' y cae a inglés.
// Aquí formateamos manualmente cuando el idioma es 'eu' usando nombres en euskera.

const MESES_EU_LONG = [
  'urtarrila', 'otsaila', 'martxoa', 'apirila', 'maiatza', 'ekaina',
  'uztaila', 'abuztua', 'iraila', 'urria', 'azaroa', 'abendua'
];

const MESES_EU_SHORT = [
  'urt', 'ots', 'mar', 'api', 'mai', 'eka',
  'uzt', 'abu', 'ira', 'urr', 'aza', 'abe'
];

type Lang = 'es' | 'eu';
type Opts = Intl.DateTimeFormatOptions;

const pad2 = (n: number) => n.toString().padStart(2, '0');

export function formatDate(
  date: Date | string | number | null | undefined,
  language: Lang,
  options: Opts = { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }
): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';

  if (language !== 'eu') {
    return d.toLocaleString('es-ES', options);
  }

  // Formato manual euskera
  const partes: string[] = [];
  const day = d.getDate();
  const monthIdx = d.getMonth();
  const year = d.getFullYear();

  // Fecha
  const fechaPartes: string[] = [];
  if (options.day) fechaPartes.push(String(day));
  if (options.month === 'long') fechaPartes.push(MESES_EU_LONG[monthIdx]);
  else if (options.month === 'short') fechaPartes.push(MESES_EU_SHORT[monthIdx]);
  else if (options.month === 'numeric' || options.month === '2-digit') {
    fechaPartes.push(options.month === '2-digit' ? pad2(monthIdx + 1) : String(monthIdx + 1));
  }
  if (options.year) fechaPartes.push(String(year));

  if (fechaPartes.length > 0) {
    partes.push(fechaPartes.join(' '));
  }

  // Hora (24h, sin AM/PM)
  if (options.hour) {
    const hh = options.hour === '2-digit' ? pad2(d.getHours()) : String(d.getHours());
    const mm = options.minute ? (options.minute === '2-digit' ? pad2(d.getMinutes()) : String(d.getMinutes())) : null;
    partes.push(mm !== null ? `${hh}:${mm}` : hh);
  }

  return partes.join(', ');
}

export function formatTime(date: Date | string | number, language: Lang): string {
  return formatDate(date, language, { hour: '2-digit', minute: '2-digit' });
}
