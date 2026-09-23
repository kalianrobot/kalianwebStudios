import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CierreEvento } from './informeCierreEvento';
import { normalizeToSlug } from './slug';

const GOLD: [number, number, number] = [212, 175, 55];
const BLACK: [number, number, number] = [0, 0, 0];
const GRAY: [number, number, number] = [102, 102, 102];

const ETIQUETA_VARIANTE: Record<string, string> = {
  estandar: 'Estándar',
  descuento_socio: 'Soci@',
  cupon: 'Cupón',
  walkin_estandar: 'Walk-in',
  walkin_socio: 'Walk-in soci@',
  gratis: 'Gratis',
};

const formatoFecha = (d: Date | null) => (d ? d.toLocaleString('es-ES') : '—');

/**
 * PDF externo para el artista: solo el desglose de su parte, sin datos
 * personales de asistentes (a diferencia del PDF de cierre, que es interno).
 */
export function generarRecibiArtistaEventoPdf(cierre: CierreEvento): void {
  const { evento, ingresosFinanzas, totales } = cierre;
  const doc = new jsPDF();

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

  let y = 48;
  autoTable(doc, {
    startY: y,
    head: [['Fecha/hora', 'Variante', 'Bruto', 'Kalian', 'Artista']],
    body: ingresosFinanzas.length
      ? ingresosFinanzas.map(f => [
          formatoFecha(f.fecha),
          ETIQUETA_VARIANTE[f.variantePrecio] || f.variantePrecio,
          `${f.montoBruto.toFixed(2)}€`,
          `${f.monto.toFixed(2)}€`,
          `${f.montoArtista.toFixed(2)}€`,
        ])
      : [['—', '—', '—', '—', '—']],
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: GOLD },
    styles: { fontSize: 8 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  if (y > 240) { doc.addPage(); y = 20; }

  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text('Totales', 14, y);
  y += 8;
  doc.setFontSize(11);
  doc.text(`Bruto total: ${totales.totalBruto.toFixed(2)}€`, 14, y);
  y += 6;
  doc.text(`Kalian total: ${totales.totalKalian.toFixed(2)}€`, 14, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Artista total: ${totales.totalArtista.toFixed(2)}€`, 14, y);
  doc.setFont('helvetica', 'normal');
  y += 14;

  if (totales.hayHistoricoFallback) {
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    const aviso = doc.splitTextToSize(
      'Datos históricos: la comisión Kalian se aplicó al 100% del cobro.',
      doc.internal.pageSize.getWidth() - 28
    );
    doc.text(aviso, 14, y);
    y += aviso.length * 4 + 8;
  }

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  const recibi = doc.splitTextToSize(
    `Recibí de Kalian HKG la cantidad de ______ € en concepto de caché del evento "${evento.titulo || ''}".`,
    doc.internal.pageSize.getWidth() - 28
  );
  doc.text(recibi, 14, y);
  y += recibi.length * 6 + 20;

  doc.setDrawColor(...GRAY);
  doc.line(14, y, 90, y);
  doc.setFontSize(9);
  doc.text('Firma del artista', 14, y + 5);

  doc.line(110, y, 186, y);
  doc.text('DNI del artista', 110, y + 5);

  const fechaISO = evento.fecha ? new Date(evento.fecha) : new Date();
  const yyyymmdd = fechaISO.toISOString().slice(0, 10).replace(/-/g, '');
  const slug = normalizeToSlug(String(evento.titulo || 'evento'), { lowercase: true });
  doc.save(`recibi-${slug}-${yyyymmdd}.pdf`);
}
