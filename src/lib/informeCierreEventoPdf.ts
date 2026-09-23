import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CierreEvento } from './informeCierreEvento';
import { normalizeToSlug } from './slug';

const GOLD: [number, number, number] = [212, 175, 55];
const BLACK: [number, number, number] = [0, 0, 0];
const RED: [number, number, number] = [200, 30, 30];
const GRAY: [number, number, number] = [102, 102, 102];

const formatoFecha = (d: Date | null) => (d ? d.toLocaleString('es-ES') : '—');

/**
 * PDF interno de cierre: reconcilia asistencia y caja de un evento pasado.
 * Contiene datos personales (DNI de no-shows) — solo para uso del staff.
 */
export function generarInformeCierreEventoPdf(cierre: CierreEvento, generadoPorUid: string): void {
  const { evento, entradasQR, entradasWalkIn, reservasNoShow, totales } = cierre;
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.setTextColor(...GOLD);
  doc.text('INFORME DE CIERRE - KALIAN', 14, 18);

  doc.setFontSize(15);
  doc.setTextColor(...BLACK);
  doc.text(String(evento.titulo || '').toUpperCase(), 14, 27);

  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.text(`Fecha: ${evento.fecha ? new Date(evento.fecha).toLocaleString('es-ES') : '—'}`, 14, 34);
  doc.text(`Aforo máximo: ${evento.aforo_maximo ?? '—'}  ·  Aforo final: ${evento.aforo_actual ?? 0}`, 14, 39);

  let y = 48;

  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text('Entradas por QR', 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Nombre / DNI', 'Tipo', 'Precio', 'Hora']],
    body: entradasQR.length
      ? entradasQR.map(e => [`${e.nombre}${e.dni ? ` (${e.dni})` : ''}`, e.tipo, `${e.precio}€`, formatoFecha(e.fecha)])
      : [['—', '—', '—', '—']],
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: GOLD },
    styles: { fontSize: 8 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(12);
  doc.text('Reservas no presentadas', 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Nombre / DNI', 'Tipo', 'Canal', 'Precio reservado']],
    body: reservasNoShow.length
      ? reservasNoShow.map(r => [
          `${r.nombre}${r.dni ? ` (${r.dni})` : ''}`,
          r.tipo,
          r.canal,
          `${r.precio}€${r.estimado ? ' (estimado)' : ''}`,
        ])
      : [['—', '—', '—', '—']],
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: GOLD },
    styles: { fontSize: 8 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(12);
  doc.text('Entradas puerta sin reserva (walk-in)', 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Hora', 'Precio', 'Soci@']],
    body: entradasWalkIn.length
      ? entradasWalkIn.map(w => [formatoFecha(w.fecha), `${w.precio}€`, w.nombre || (w.socioId ? w.socioId : '—')])
      : [['—', '—', '—']],
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: GOLD },
    styles: { fontSize: 8 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (y > 240) { doc.addPage(); y = 20; }
  doc.setFontSize(12);
  doc.text('Caja del evento', 14, y);
  const metodos = Object.entries(totales.porMetodo);
  autoTable(doc, {
    startY: y + 4,
    head: [['Método', 'Total']],
    body: metodos.length ? metodos.map(([m, total]) => [m, `${total.toFixed(2)}€`]) : [['—', '—']],
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: GOLD },
    styles: { fontSize: 9 },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  if (y > 230) { doc.addPage(); y = 20; }
  doc.setFontSize(13);
  doc.setTextColor(...BLACK);
  doc.text('Reconciliación', 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(`Total caja: ${totales.totalCaja.toFixed(2)}€`, 14, y);
  y += 6;
  doc.text(`Suma precios asistencia: ${totales.totalAsistencia.toFixed(2)}€`, 14, y);
  y += 8;

  const descuadreOk = totales.descuadre === 0;
  doc.setFontSize(12);
  doc.setTextColor(...(descuadreOk ? [0, 130, 60] as [number, number, number] : RED));
  doc.text(
    `Descuadre: ${totales.descuadre >= 0 ? '+' : ''}${totales.descuadre.toFixed(2)}€${descuadreOk ? ' (OK)' : ' ⚠ REVISAR'}`,
    14, y
  );
  y += 12;

  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  const pie = `Generado el ${new Date().toLocaleString('es-ES')} por ${generadoPorUid}`;
  doc.text(pie, 14, Math.min(y, 285));

  const fechaISO = evento.fecha ? new Date(evento.fecha) : new Date();
  const yyyymmdd = fechaISO.toISOString().slice(0, 10).replace(/-/g, '');
  const slug = normalizeToSlug(String(evento.titulo || 'evento'), { lowercase: true });
  doc.save(`cierre-${slug}-${yyyymmdd}.pdf`);
}
