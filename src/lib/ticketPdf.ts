import { jsPDF } from 'jspdf';
import { formatDate } from '../i18n/dateFormat';

const isDev = import.meta.env.DEV;

const GOLD: [number, number, number] = [212, 175, 55];
const BLACK: [number, number, number] = [0, 0, 0];
const GRAY: [number, number, number] = [102, 102, 102];

const PAGE_W = 148; // A5 portrait, mm
const CENTER_X = PAGE_W / 2;
const MARGIN_X = 18;

async function cargarImagenDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    // Un 200 no basta: un rewrite SPA (o un portal cautivo) puede devolver
    // HTML con status 200 para una ruta que no existe. Sin este chequeo,
    // jsPDF.addImage revienta al intentar decodificar HTML como PNG.
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return null;
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
  } catch (e) {
    if (isDev) console.error('[ticketPdf] no se pudo cargar imagen', url, e);
    return null;
  }
}

// Defensa en profundidad: incluso con el chequeo de content-type, unos bytes
// truncados o un PNG corrupto pueden hacer que `addImage` lance. Nunca debe
// tirar todo el ticket por una imagen: si falla, se omite esa imagen.
function intentarAddImage(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number): boolean {
  try {
    doc.addImage(dataUrl, 'PNG', x, y, w, h);
    return true;
  } catch (e) {
    if (isDev) console.error('[ticketPdf] addImage falló', e);
    return false;
  }
}

export async function generarTicketPDF(params: {
  ticketID: string;
  qrUrl: string;
  nombreTitular: string;
  eventoTitulo: string;
  fechaActividad?: string;
  acompanantes: number;
  language: 'es' | 'eu';
}): Promise<void> {
  const { ticketID, qrUrl, nombreTitular, eventoTitulo, fechaActividad, acompanantes, language } = params;

  const [logoDataUrl, qrDataUrl] = await Promise.all([
    cargarImagenDataUrl('/logo.png'),
    cargarImagenDataUrl(qrUrl),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  let y = 16;

  if (logoDataUrl) {
    const logoW = 46;
    const logoH = logoW * (192 / 429);
    if (intentarAddImage(doc, logoDataUrl, CENTER_X - logoW / 2, y, logoW, logoH)) {
      y += logoH + 8;
    }
  }

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...GOLD);
  const tituloLineas = doc.splitTextToSize(eventoTitulo.toUpperCase(), PAGE_W - MARGIN_X * 2);
  doc.text(tituloLineas, CENTER_X, y, { align: 'center' });
  y += tituloLineas.length * 7 + 4;

  if (fechaActividad) {
    const fechaTexto = formatDate(fechaActividad, language, {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...BLACK);
    doc.text(fechaTexto, CENTER_X, y, { align: 'center' });
    y += 10;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  doc.text(`Reservado por: ${nombreTitular}`, CENTER_X, y, { align: 'center' });
  y += 7;

  if (acompanantes > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`+ ${acompanantes} acompañante${acompanantes === 1 ? '' : 's'}`, CENTER_X, y, { align: 'center' });
    y += 8;
  } else {
    y += 4;
  }

  const qrBox = 66;
  const qrBoxX = CENTER_X - qrBox / 2;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.roundedRect(qrBoxX, y, qrBox, qrBox, 4, 4, 'FD');
  const qrInset = 6;
  const qrDibujado = qrDataUrl
    ? intentarAddImage(doc, qrDataUrl, qrBoxX + qrInset, y + qrInset, qrBox - qrInset * 2, qrBox - qrInset * 2)
    : false;
  if (!qrDibujado) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text('QR no disponible,', CENTER_X, y + qrBox / 2 - 3, { align: 'center' });
    doc.text('usa el código de abajo', CENTER_X, y + qrBox / 2 + 3, { align: 'center' });
  }
  y += qrBox + 10;

  doc.setFont('courier', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...BLACK);
  doc.text(ticketID.split('').join(' '), CENTER_X, y, { align: 'center' });
  y += 12;

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  const nota = doc.splitTextToSize(
    'Presenta este código en la entrada. El pago de acompañantes (si los hay) se realiza en efectivo.',
    PAGE_W - MARGIN_X * 2
  );
  doc.text(nota, CENTER_X, y, { align: 'center' });
  y += nota.length * 4 + 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('K A L I A N   H I R I   K U L T U R   G U N E A', CENTER_X, y, { align: 'center' });

  doc.save(`Ticket-Kalian-${ticketID}.pdf`);
}
