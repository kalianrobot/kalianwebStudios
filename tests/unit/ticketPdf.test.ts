import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDoc = vi.hoisted(() => ({
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  line: vi.fn(),
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  splitTextToSize: vi.fn((text: string) => [text]),
  text: vi.fn(),
  setFillColor: vi.fn(),
  roundedRect: vi.fn(),
  addImage: vi.fn(),
  save: vi.fn(),
}));

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function () {
    return mockDoc;
  }),
}));

import { generarTicketPDF } from '../../src/lib/ticketPdf';

function respuestaImagen(): Response {
  return {
    ok: true,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/png' : null) },
    blob: async () => new Blob(['fake-png-bytes'], { type: 'image/png' }),
  } as unknown as Response;
}

function respuestaHtmlFallbackSpa(): Response {
  // Un rewrite SPA puede devolver 200 + HTML para una ruta que no existe.
  return {
    ok: true,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html' : null) },
    blob: async () => new Blob(['<html></html>'], { type: 'text/html' }),
  } as unknown as Response;
}

function respuesta404(): Response {
  return { ok: false, headers: { get: () => null } } as unknown as Response;
}

const paramsBase = {
  ticketID: 'AB12CD',
  qrUrl: 'https://api.qrserver.com/qr.png',
  nombreTitular: 'Ana García',
  eventoTitulo: 'Concierto de Prueba',
  fechaActividad: '2026-10-15T21:30',
  acompanantes: 2,
  language: 'es' as const,
  notaPago: 'Presenta este código en la entrada. El pago se realiza en efectivo en la entrada. Si algún acompañante es socio, debe presentar también su carnet de socio (QR) para aplicar el descuento.',
};

describe('generarTicketPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dibuja logo y QR cuando ambas imágenes cargan correctamente', async () => {
    global.fetch = vi.fn(async () => respuestaImagen());

    await generarTicketPDF(paramsBase);

    expect(mockDoc.addImage).toHaveBeenCalledTimes(2);
    expect(mockDoc.save).toHaveBeenCalledWith('Ticket-Kalian-AB12CD.pdf');
    // ticketID con espaciado entre caracteres
    expect(mockDoc.text).toHaveBeenCalledWith('A B 1 2 C D', 74, expect.any(Number), { align: 'center' });
    // no debe mostrarse el texto de respaldo del QR
    expect(mockDoc.text).not.toHaveBeenCalledWith('QR no disponible,', expect.anything(), expect.anything(), expect.anything());
  });

  it('usa texto de respaldo si el QR responde 200 con contenido que no es imagen (rewrite SPA)', async () => {
    global.fetch = vi.fn(async (url: string) =>
      url.includes('logo.png') ? respuestaImagen() : respuestaHtmlFallbackSpa()
    );

    await generarTicketPDF({ ...paramsBase, qrUrl: '/no-existe-esta-imagen.png' });

    expect(mockDoc.addImage).toHaveBeenCalledTimes(1); // solo el logo
    expect(mockDoc.text).toHaveBeenCalledWith('QR no disponible,', 74, expect.any(Number), { align: 'center' });
    expect(mockDoc.save).toHaveBeenCalledWith('Ticket-Kalian-AB12CD.pdf');
  });

  it('usa texto de respaldo si el QR devuelve 404', async () => {
    global.fetch = vi.fn(async (url: string) => (url.includes('logo.png') ? respuestaImagen() : respuesta404()));

    await generarTicketPDF(paramsBase);

    expect(mockDoc.addImage).toHaveBeenCalledTimes(1);
    expect(mockDoc.text).toHaveBeenCalledWith('QR no disponible,', 74, expect.any(Number), { align: 'center' });
  });

  it('sigue generando el PDF si addImage lanza (PNG corrupto)', async () => {
    global.fetch = vi.fn(async () => respuestaImagen());
    mockDoc.addImage.mockImplementation(() => {
      throw new Error('wrong PNG signature');
    });

    await generarTicketPDF(paramsBase);

    expect(mockDoc.text).toHaveBeenCalledWith('QR no disponible,', 74, expect.any(Number), { align: 'center' });
    expect(mockDoc.save).toHaveBeenCalledWith('Ticket-Kalian-AB12CD.pdf');
  });

  it('sigue generando el PDF si fetch lanza (red caída)', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    });

    await generarTicketPDF(paramsBase);

    expect(mockDoc.addImage).not.toHaveBeenCalled();
    expect(mockDoc.save).toHaveBeenCalledWith('Ticket-Kalian-AB12CD.pdf');
  });

  it('omite la línea de acompañantes cuando no hay ninguno', async () => {
    global.fetch = vi.fn(async () => respuestaImagen());

    await generarTicketPDF({ ...paramsBase, acompanantes: 0 });

    const llamadasAcompanante = mockDoc.text.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('acompañante')
    );
    expect(llamadasAcompanante).toHaveLength(0);
  });

  it('usa singular para un solo acompañante', async () => {
    global.fetch = vi.fn(async () => respuestaImagen());

    await generarTicketPDF({ ...paramsBase, acompanantes: 1 });

    expect(mockDoc.text).toHaveBeenCalledWith('+ 1 acompañante', 74, expect.any(Number), { align: 'center' });
  });

  it('formatea la fecha en euskera cuando language es eu', async () => {
    global.fetch = vi.fn(async () => respuestaImagen());

    await generarTicketPDF({ ...paramsBase, language: 'eu' });

    expect(mockDoc.text).toHaveBeenCalledWith('15 urria 2026, 21:30', 74, expect.any(Number), { align: 'center' });
  });

  it('usa el texto de notaPago recibido por parámetro (no un texto hardcodeado)', async () => {
    global.fetch = vi.fn(async () => respuestaImagen());
    const notaPersonalizada = 'Nota de prueba en euskera para el pie del ticket.';

    await generarTicketPDF({ ...paramsBase, notaPago: notaPersonalizada });

    expect(mockDoc.splitTextToSize).toHaveBeenCalledWith(notaPersonalizada, expect.any(Number));
    expect(mockDoc.text).toHaveBeenCalledWith([notaPersonalizada], 74, expect.any(Number), { align: 'center' });
  });

  it('no dibuja línea de fecha si no hay fechaActividad', async () => {
    global.fetch = vi.fn(async () => respuestaImagen());

    await generarTicketPDF({ ...paramsBase, fechaActividad: undefined });

    const llamadasFecha = mockDoc.text.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('2026')
    );
    expect(llamadasFecha).toHaveLength(0);
  });
});
