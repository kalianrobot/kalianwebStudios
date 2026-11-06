import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CierreEvento, ETIQUETA_VARIANTE, FilaResumenVariante } from './informeCierreEvento';
import { normalizeToSlug } from './slug';

const GOLD: [number, number, number] = [212, 175, 55];
const BLACK: [number, number, number] = [0, 0, 0];
const GRAY: [number, number, number] = [102, 102, 102];
const RED: [number, number, number] = [200, 30, 30];

const euros = (n: number) => `${n.toFixed(2)}€`;
const formatoFecha = (d: Date | null) => (d ? d.toLocaleString('es-ES') : '—');
const precioUnitario = (f: FilaResumenVariante) =>
  f.precioMin === f.precioMax ? euros(f.precioMin) : `${euros(f.precioMin)} – ${euros(f.precioMax)}`;

/**
 * PDF externo para el artista: resumen por variante de precio, liquidación,
 * avisos de control y anexo entrada a entrada. Sin datos personales de
 * asistentes (a diferencia del PDF de cierre, que es interno).
 */
export function generarRecibiArtistaEventoPdf(cierre: CierreEvento): void {
  const { evento, recibi, totales: totalesCierre } = cierre;
  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth() - 28;
  const tablaY = () => (doc as any).lastAutoTable.finalY as number;
  const asegurarEspacio = (y: number, necesario: number) => {
    if (y + necesario > 280) { doc.addPage(); return 20; }
    return y;
  };

  doc.setFontSize(20);
  doc.setTextColor(...GOLD);
  doc.text('RECIBÍ DEL ARTISTA - KALIAN', 14, 18);

  doc.setFontSize(15);
  doc.setTextColor(...BLACK);
  doc.text(String(evento.titulo || '').toUpperCase(), 14, 27);

  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.text(`Fecha: ${evento.fecha ? new Date(evento.fecha).toLocaleString('es-ES') : '—'}`, 14, 34);
  doc.text(`Artista: ${evento.artista || '______________________'}`, 14, 39);

  // 1. Resumen por tipo de entrada
  let y = 49;
  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text('Resumen por tipo de entrada', 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [['Tipo', 'Entradas', 'Precio', 'Bruto', 'Kalian', 'Artista']],
    body: recibi.resumen.length
      ? recibi.resumen.map(f => [
          ETIQUETA_VARIANTE[f.variante],
          String(f.numEntradas),
          precioUnitario(f),
          euros(f.bruto),
          euros(f.kalian),
          euros(f.artista),
        ])
      : [['—', '0', '—', euros(0), euros(0), euros(0)]],
    foot: [[
      'Total',
      String(recibi.totales.numEntradas),
      '',
      euros(recibi.totales.bruto),
      euros(recibi.totales.kalian),
      euros(recibi.totales.artista),
    ]],
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: GOLD },
    footStyles: { fillColor: [235, 235, 235], textColor: BLACK, fontStyle: 'bold' },
    styles: { fontSize: 9 },
  });
  y = tablaY() + 10;

  // 2. Liquidación
  y = asegurarEspacio(y, 30);
  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text('Liquidación', 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.text(`Total que corresponde al artista: ${euros(recibi.liquidacion.totalArtista)}`, 14, y);
  y += 6;
  doc.text(`Pagos ya entregados: ${euros(recibi.liquidacion.pagado)}`, 14, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Pendiente de pago: ${euros(recibi.liquidacion.pendiente)}`, 14, y);
  doc.setFont('helvetica', 'normal');
  y += 10;

  // 3. Avisos de control
  if (recibi.avisos.length > 0) {
    y = asegurarEspacio(y, 10 + recibi.avisos.length * 10);
    doc.setFontSize(11);
    doc.setTextColor(...RED);
    doc.text('Avisos de control', 14, y);
    y += 6;
    doc.setFontSize(9);
    for (const aviso of recibi.avisos) {
      const lineas = doc.splitTextToSize(`- ${aviso}`, ancho);
      doc.text(lineas, 14, y);
      y += lineas.length * 5;
    }
    doc.setTextColor(...BLACK);
    y += 6;
  }

  if (totalesCierre.hayHistoricoFallback) {
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    const aviso = doc.splitTextToSize('Datos históricos: la comisión Kalian se aplicó al 100% del cobro.', ancho);
    doc.text(aviso, 14, y);
    y += aviso.length * 4 + 6;
  }

  // 4. Recibí firmable
  y = asegurarEspacio(y, 40);
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  const recibiTexto = doc.splitTextToSize(
    `Recibí de Kalian HKG la cantidad de ${euros(recibi.liquidacion.pendiente)} en concepto de caché del evento "${evento.titulo || ''}".`,
    ancho
  );
  doc.text(recibiTexto, 14, y);
  y += recibiTexto.length * 6 + 20;

  doc.setDrawColor(...GRAY);
  doc.line(14, y, 90, y);
  doc.setFontSize(9);
  doc.text('Firma del artista', 14, y + 5);
  doc.line(110, y, 186, y);
  doc.text('DNI del artista', 110, y + 5);

  // 5. Anexo: detalle entrada a entrada
  doc.addPage();
  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text('Anexo: detalle de entradas', 14, 20);
  autoTable(doc, {
    startY: 24,
    head: [['Fecha/hora', 'Tipo', 'Bruto', 'Kalian', 'Artista']],
    body: recibi.entradas.length
      ? recibi.entradas.map(e => [
          formatoFecha(e.fecha),
          ETIQUETA_VARIANTE[e.variante],
          euros(e.bruto),
          euros(e.kalian),
          euros(e.artista),
        ])
      : [['—', '—', '—', '—', '—']],
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: GOLD },
    styles: { fontSize: 8 },
  });

  const fechaISO = evento.fecha ? new Date(evento.fecha) : new Date();
  const yyyymmdd = fechaISO.toISOString().slice(0, 10).replace(/-/g, '');
  const slug = normalizeToSlug(String(evento.titulo || 'evento'), { lowercase: true });
  doc.save(`recibi-${slug}-${yyyymmdd}.pdf`);
}
