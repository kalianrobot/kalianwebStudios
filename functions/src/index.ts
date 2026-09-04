import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { timingSafeEqual } from 'crypto';
import { safeJson, escapeHtml, maskEmail, withRetry, formatFechaLarga } from './helpers';

admin.initializeApp();

const EU_REGION = 'europe-west1';

const BREVO_API_KEY = defineSecret('BREVO_API_KEY');
const BREVO_WEBHOOK_SECRET = defineSecret('BREVO_WEBHOOK_SECRET');
const BREVO_NEWSLETTER_LIST_ID = defineSecret('BREVO_NEWSLETTER_LIST_ID');
// ID de la plantilla transaccional de Brevo con el botón "Double opt-in link"
// (Templates > Email > "Plantilla Confirmar subscripcion a Newletter").
const BREVO_NEWSLETTER_DOI_TEMPLATE_ID = defineSecret('BREVO_NEWSLETTER_DOI_TEMPLATE_ID');
// Tras confirmar el DOI, Brevo redirige aquí (landing polivalente, ver NewsletterEstadoPage).
const NEWSLETTER_DOI_REDIRECT_URL = 'https://kalian.es/newsletter/estado?accion=confirmado';
const SENDER = { name: 'Kalian Hiri Kultur Gunea', email: 'info@kalian.es' };

// Timeout por defecto para llamadas a Brevo.
const BREVO_TIMEOUT_MS = 15_000;

async function callBrevo(apiKey: string, payload: object) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err.message || `Brevo error ${res.status}`);
    }
    return safeJson(res);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Email del administrador maestro (mismo valor que en firestore.rules y
// src/lib/constants.ts). Se compara siempre en minúsculas.
const MASTER_EMAIL = 'kalianrobot@gmail.com';

// Comprueba server-side que el llamante es staff (master admin, admin o profesor),
// replicando isAdmin()/isTeacher() de firestore.rules. Las callables corren con
// Admin SDK y bypassan las reglas, así que el rol hay que verificarlo aquí.
async function assertStaff(auth: { uid: string; token?: Record<string, unknown> }) {
  const email = String(auth.token?.email || '').toLowerCase();
  if (email === MASTER_EMAIL) return;

  const userSnap = await admin.firestore().collection('users').doc(auth.uid).get();
  const role = userSnap.exists ? String(userSnap.data()?.role || '') : '';
  if (!['admin', 'teacher', 'profesor', 'teacher_admin'].includes(role)) {
    throw new HttpsError('permission-denied', 'Solo staff puede realizar esta acción.');
  }
}

// Rate limiting en memoria por instancia para validatePuertaAccess.
// No persiste entre instancias, pero protege contra fuerza bruta en instancia caliente.
const _puertaAttempts = new Map<string, number[]>();

// ─── validatePuertaAccess ────────────────────────────────────────────────────
// Sin auth: la tablet de puerta no tiene usuario Firebase. Valida la contraseña
// compartida server-side y devuelve un Custom Token para operar como "portero".
const PUERTA_UID = 'puerta-service';

export const validatePuertaAccess = onCall(
  { region: EU_REGION },
  async (request) => {
    const { password } = request.data as { password?: string };

    if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
      throw new HttpsError('invalid-argument', 'Contraseña no válida.');
    }

    // Rate limit: máx 5 intentos fallidos por IP en 60 s (A3)
    const ip = (request.rawRequest as any)?.ip || 'unknown';
    const ahora = Date.now();
    const ventanaMs = 60_000;
    const maxIntentos = 5;
    const intentosPrevios = (_puertaAttempts.get(ip) || []).filter(t => ahora - t < ventanaMs);
    if (intentosPrevios.length >= maxIntentos) {
      throw new HttpsError('resource-exhausted', 'Demasiados intentos. Espera un momento.');
    }

    const db = admin.firestore();
    const configSnap = await db.doc('configuracion/seguridad').get();
    if (!configSnap.exists) {
      throw new HttpsError('internal', 'Clave de puerta no configurada.');
    }

    const { clave_puerta } = configSnap.data() as { clave_puerta?: string };
    if (!clave_puerta) throw new HttpsError('internal', 'Clave de puerta no configurada.');

    // Comparación en tiempo constante para mitigar timing attack (A3)
    const inputBuf = Buffer.from(password);
    const expectedBuf = Buffer.from(clave_puerta);
    const coincide = inputBuf.byteLength === expectedBuf.byteLength && timingSafeEqual(inputBuf, expectedBuf);
    if (!coincide) {
      intentosPrevios.push(ahora);
      _puertaAttempts.set(ip, intentosPrevios);
      throw new HttpsError('permission-denied', 'Contraseña incorrecta.');
    }
    _puertaAttempts.delete(ip);

    // Ensure the puerta service user doc exists so isPortero() rules pass
    const userRef = db.doc(`users/${PUERTA_UID}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      await userRef.set({ uid: PUERTA_UID, role: 'portero', nombre: 'Puerta Service' });
    }

    const customToken = await admin.auth().createCustomToken(PUERTA_UID, { role: 'portero' });
    return { token: customToken };
  }
);

// ─── requestPasswordReset ────────────────────────────────────────────────────
// Sin auth: quien la llama por definición no tiene sesión (o, en el caso de
// createSocioAuth, opera contra una sesión secundaria). Genera el link con
// el Admin SDK y lo envía por Brevo desde info@kalian.es en vez del email por
// defecto de Firebase Auth (dominio firebaseapp.com, mala reputación/entrega).
const _resetAttempts = new Map<string, number[]>();

export const requestPasswordReset = onCall(
  { secrets: [BREVO_API_KEY], region: EU_REGION },
  async (request) => {
    const { email } = request.data as { email?: string };

    if (typeof email !== 'string' || email.length < 3 || email.length > 254 || !email.includes('@')) {
      throw new HttpsError('invalid-argument', 'Email no válido.');
    }

    // Rate limit: máx 5 intentos por IP en 60 s (mismo criterio que validatePuertaAccess)
    const ip = (request.rawRequest as any)?.ip || 'unknown';
    const ahora = Date.now();
    const ventanaMs = 60_000;
    const maxIntentos = 5;
    const intentosPrevios = (_resetAttempts.get(ip) || []).filter(t => ahora - t < ventanaMs);
    if (intentosPrevios.length >= maxIntentos) {
      throw new HttpsError('resource-exhausted', 'Demasiados intentos. Espera un momento.');
    }
    intentosPrevios.push(ahora);
    _resetAttempts.set(ip, intentosPrevios);

    let link: string;
    try {
      link = await admin.auth().generatePasswordResetLink(email);
    } catch (err: any) {
      // No revelar si el email existe o no (anti-enumeración, igual que la
      // invariante de newsletter): responder éxito igualmente sin enviar nada.
      logger.info('requestPasswordReset: sin envío', { email: maskEmail(email), code: err?.code });
      return { ok: true };
    }

    const linkSafe = escapeHtml(link);

    await callBrevo(BREVO_API_KEY.value(), {
      sender: SENDER,
      to: [{ email }],
      subject: 'Restablece tu contraseña de Kalian',
      htmlContent: `<!DOCTYPE html><html><head>
        <style>
          body{margin:0;padding:0;background:#0A0A0A;font-family:Inter,sans-serif;color:#F5F5F0}
          .c{max-width:600px;margin:0 auto;background:#0A0A0A;border:1px solid #D4AF3733}
          .h{padding:60px 40px;text-align:center;border-bottom:1px solid #D4AF3733}
          .b{padding:40px;text-align:center}
          .f{padding:30px;text-align:center;background:#000;border-top:1px solid #D4AF3733;font-size:10px;color:#666}
          h1{color:#D4AF37;font-size:40px;font-weight:900;text-transform:uppercase;letter-spacing:-2px;margin:0;line-height:.9;font-style:italic}
          p{font-size:16px;line-height:1.6;color:#F5F5F0CC;margin-bottom:25px}
          .btn{display:inline-block;background:#D4AF37;color:#000;padding:20px 40px;text-decoration:none;font-weight:900;text-transform:uppercase;letter-spacing:2px;font-size:14px}
          .div{height:2px;width:40px;background:#D4AF37;margin:30px auto}
        </style></head><body>
        <div class="c">
          <div class="h"><h1>RESTABLECER</h1><h1>CONTRASEÑA</h1></div>
          <div class="b">
            <p>Has solicitado restablecer tu contraseña de Kalian.</p>
            <div class="div"></div>
            <div style="margin:40px 0"><a href="${linkSafe}" class="btn">RESTABLECER CONTRASEÑA</a></div>
            <p style="font-size:12px;color:#666">Si no has sido tú, ignora este email: tu contraseña no cambiará.</p>
          </div>
          <div class="f"><p>KALIAN HIRI KULTUR GUNEA</p><p>Responsable: Kalian. Finalidad: Gestión de soci@s. Derechos: Acceso y supresión.</p></div>
        </div></body></html>`,
    });

    return { ok: true };
  }
);

// ─── sendWelcomeEmail ────────────────────────────────────────────────────────
export const sendWelcomeEmail = onCall(
  { secrets: [BREVO_API_KEY], region: EU_REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required');

    const { email, nombre, activationLink } = request.data as {
      email: string; nombre: string; activationLink: string;
    };

    const nombreSafe = escapeHtml(nombre);
    const linkSafe = escapeHtml(activationLink);

    return callBrevo(BREVO_API_KEY.value(), {
      sender: SENDER,
      to: [{ email, name: nombre }],
      subject: '¡Bienvenido/a a Kalian! Activa tu cuenta',
      htmlContent: `<!DOCTYPE html><html><head>
        <style>
          body{margin:0;padding:0;background:#0A0A0A;font-family:Inter,sans-serif;color:#F5F5F0}
          .c{max-width:600px;margin:0 auto;background:#0A0A0A;border:1px solid #D4AF3733}
          .h{padding:60px 40px;text-align:center;border-bottom:1px solid #D4AF3733}
          .b{padding:40px;text-align:center}
          .f{padding:30px;text-align:center;background:#000;border-top:1px solid #D4AF3733;font-size:10px;color:#666}
          h1{color:#D4AF37;font-size:48px;font-weight:900;text-transform:uppercase;letter-spacing:-2px;margin:0;line-height:.9;font-style:italic}
          p{font-size:16px;line-height:1.6;color:#F5F5F0CC;margin-bottom:25px}
          .btn{display:inline-block;background:#D4AF37;color:#000;padding:20px 40px;text-decoration:none;font-weight:900;text-transform:uppercase;letter-spacing:2px;font-size:14px}
          .acc{color:#D4AF37;font-weight:700}
          .div{height:2px;width:40px;background:#D4AF37;margin:30px auto}
        </style></head><body>
        <div class="c">
          <div class="h"><h1>BIENVENIDO</h1><h1>A KALIAN</h1></div>
          <div class="b">
            <p>Hola <span class="acc">${nombreSafe}</span>,</p>
            <p>Estamos encantados de tenerte como nuevo soci@s de nuestra comunidad cultural.</p>
            <div class="div"></div>
            <p>Para acceder a todas las ventajas, activa tu cuenta y define tu contraseña.</p>
            <div style="margin:40px 0"><a href="${linkSafe}" class="btn">ACTIVAR MI CUENTA</a></div>
            <p style="font-size:12px;color:#666">Recibirás un segundo email de seguridad para completar el proceso.</p>
          </div>
          <div class="f"><p>KALIAN HIRI KULTUR GUNEA</p><p>Responsable: Kalian. Finalidad: Gestión de soci@s. Derechos: Acceso y supresión.</p></div>
        </div></body></html>`,
    });
  }
);

export const sendMembershipUpdateEmail = onCall(
  { secrets: [BREVO_API_KEY], region: EU_REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required');

    const { email, nombre, uid, membresias } = request.data as {
      email: string; nombre: string; uid: string; membresias: Record<string, string>;
    };

    const hoy = new Date().toISOString().split('T')[0];
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${uid}`;

    const membresiasHtml = Object.entries(membresias)
      .filter(([, fecha]) => fecha >= hoy)
      .map(([cat, fecha]) => {
        const cat_nombre = cat === 'musica' ? 'Music Is Cool' : cat === 'danza' ? 'Club de Baile' : cat === 'local' ? 'Locales' : cat;
        return `<div style="background:#1A1A1A;border:1px solid #D4AF3733;padding:15px;margin-bottom:10px;border-radius:12px;text-align:left">
          <p style="margin:0;color:#D4AF37;font-weight:900;text-transform:uppercase;font-size:12px">${escapeHtml(cat_nombre)}</p>
          <p style="margin:5px 0 0;font-size:10px;color:#F5F5F066;font-weight:700">VÁLIDO HASTA: ${escapeHtml(fecha)}</p>
        </div>`;
      }).join('') || '<p style="color:#666;font-size:12px;font-style:italic">No tienes membresías activas.</p>';

    const nombreSafe = escapeHtml(nombre);
    const uidSafe = escapeHtml(uid);
    const qrUrlSafe = escapeHtml(qrUrl);

    return callBrevo(BREVO_API_KEY.value(), {
      sender: SENDER,
      to: [{ email, name: nombre }],
      subject: 'Tu Carnet Digital Kalian ha sido actualizado',
      htmlContent: `<!DOCTYPE html><html><head>
        <style>
          body{margin:0;padding:0;background:#0A0A0A;font-family:Inter,sans-serif;color:#F5F5F0}
          .c{max-width:600px;margin:0 auto;background:#0A0A0A;border:1px solid #D4AF3733}
          .h{padding:40px;text-align:center;border-bottom:1px solid #D4AF3733}
          .b{padding:40px;text-align:center}
          .f{padding:30px;text-align:center;background:#000;border-top:1px solid #D4AF3733;font-size:10px;color:#666}
          h1{color:#D4AF37;font-size:32px;font-weight:900;text-transform:uppercase;margin:0;font-style:italic}
          .qr{background:#FFF;padding:20px;display:inline-block;border-radius:24px;margin:30px 0}
          .acc{color:#D4AF37;font-weight:700}
        </style></head><body>
        <div class="c">
          <div class="h"><h1>CARNET DIGITAL</h1></div>
          <div class="b">
            <p>Hola <span class="acc">${nombreSafe}</span>,</p>
            <p>Tu membresía en Kalian ha sido actualizada. Presenta este QR en el centro:</p>
            <div class="qr"><img src="${qrUrlSafe}" width="200" height="200" style="display:block"></div>
            <p style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:2px;margin-bottom:40px">UID: ${uidSafe}</p>
            <div style="max-width:400px;margin:0 auto;padding-top:20px">
              <p style="font-size:12px;font-weight:900;text-transform:uppercase;color:#D4AF37;margin-bottom:15px;text-align:left">Tus Membresías Activas:</p>
              ${membresiasHtml}
            </div>
          </div>
          <div class="f"><p>KALIAN HIRI KULTUR GUNEA</p><p>Este carnet es personal e intransferible.</p></div>
        </div></body></html>`,
    });
  }
);

// ─── sendCourseApprovalEmail ────────────────────────────────────────────────
// Email de "solicitud de inscripción aceptada". A diferencia de sendWelcomeEmail /
// sendMembershipUpdateEmail, aquí el cliente solo pasa el `solicitudId`: el
// destinatario y todo el contenido se leen del doc autoritativo en
// `solicitudes_cursos` (mismo criterio que sendReservationConfirmation), y el rol
// del llamante se comprueba server-side. Solo se envía si la solicitud ya está
// en estado 'aprobado', lo que ata la function al flujo legítimo de AdminSolicitudes.
export const sendCourseApprovalEmail = onCall(
  { secrets: [BREVO_API_KEY], region: EU_REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required');
    await assertStaff(request.auth);

    const { solicitudId } = request.data as { solicitudId?: string };
    if (typeof solicitudId !== 'string' || solicitudId.length === 0 || solicitudId.length > 128) {
      throw new HttpsError('invalid-argument', 'Solicitud no válida.');
    }

    const db = admin.firestore();
    const solSnap = await db.collection('solicitudes_cursos').doc(solicitudId).get();
    if (!solSnap.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');

    const sol = solSnap.data() as any;
    if (sol.estado !== 'aprobado') {
      throw new HttpsError('failed-precondition', 'La solicitud no está aprobada.');
    }

    const email = String(sol.email || '').toLowerCase().trim();
    const nombre = String(sol.nombre || '');
    const cursoTitulo = String(sol.cursoTitulo || '');
    if (!email) throw new HttpsError('failed-precondition', 'La solicitud no tiene email.');

    // Datos del curso: también del doc autoritativo, no del request.
    let horario = '';
    let fechaInicio = '';
    let profesorNombre = '';
    let sala = '';
    if (sol.cursoId) {
      const cursoSnap = await db.collection('cursos').doc(String(sol.cursoId)).get();
      if (cursoSnap.exists) {
        const curso = cursoSnap.data() as any;
        horario = String(curso.horario || '');
        fechaInicio = formatFechaLarga(curso.fechaInicio);
        profesorNombre = String(curso.profesorNombre || curso.profesor || '');
        sala = String(curso.sala || '');
      }
    }

    const precio = Number(sol.modalidad?.precio) || 0;
    const modalidad = String(sol.modalidad?.tipo || '');

    const fila = (etiqueta: string, valor: string) => valor
      ? `<tr>
          <td style="padding:8px 0;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#D4AF37;white-space:nowrap">${escapeHtml(etiqueta)}</td>
          <td style="padding:8px 0 8px 20px;font-size:14px;color:#F5F5F0CC">${escapeHtml(valor)}</td>
        </tr>`
      : '';

    const detalles = [
      fila('Curso', cursoTitulo),
      fila('Modalidad', modalidad),
      fila('Inicio', fechaInicio),
      fila('Horario', horario),
      fila('Profesor/a', profesorNombre),
      fila('Sala', sala),
      fila('Importe', precio > 0 ? `${precio} €` : ''),
    ].join('');

    const nombreSafe = escapeHtml(nombre);
    const tituloSafe = escapeHtml(cursoTitulo);

    logger.info('sendCourseApprovalEmail: enviando', { solicitudId, email: maskEmail(email) });

    return callBrevo(BREVO_API_KEY.value(), {
      sender: SENDER,
      to: [{ email, name: nombre }],
      subject: `Inscripción aceptada: ${cursoTitulo}`,
      htmlContent: `<!DOCTYPE html><html><head>
        <style>
          body{margin:0;padding:0;background:#0A0A0A;font-family:Inter,sans-serif;color:#F5F5F0}
          .c{max-width:600px;margin:0 auto;background:#0A0A0A;border:1px solid #D4AF3733}
          .h{padding:50px 40px;text-align:center;border-bottom:1px solid #D4AF3733}
          .b{padding:40px;text-align:center}
          .f{padding:30px;text-align:center;background:#000;border-top:1px solid #D4AF3733;font-size:10px;color:#666}
          h1{color:#D4AF37;font-size:40px;font-weight:900;text-transform:uppercase;letter-spacing:-2px;margin:0;line-height:.9;font-style:italic}
          p{font-size:16px;line-height:1.6;color:#F5F5F0CC;margin-bottom:20px}
          .acc{color:#D4AF37;font-weight:700}
          .div{height:2px;width:40px;background:#D4AF37;margin:30px auto}
          .btn{display:inline-block;background:#D4AF37;color:#000;padding:18px 36px;text-decoration:none;font-weight:900;text-transform:uppercase;letter-spacing:2px;font-size:13px;border-radius:8px}
          .box{background:#1A1A1A;border:1px solid #D4AF3733;border-radius:16px;padding:24px;margin:30px 0;text-align:left}
        </style></head><body>
        <div class="c">
          <div class="h"><h1>INSCRIPCIÓN</h1><h1>ACEPTADA</h1></div>
          <div class="b">
            <p>Hola <span class="acc">${nombreSafe}</span>,</p>
            <p>Tu solicitud de inscripción en <span class="acc">${tituloSafe}</span> ha sido aceptada. Ya tienes plaza reservada.</p>
            <div class="box"><table style="width:100%;border-collapse:collapse">${detalles}</table></div>
            ${precio > 0
              ? '<p style="font-size:13px;color:#F5F5F099">El pago de la inscripción queda pendiente de confirmar en el centro. Te indicaremos la forma de pago acordada.</p>'
              : ''}
            <div class="div"></div>
            <p>Consulta tu carnet digital y tus cursos desde tu área de soci@:</p>
            <div style="margin:30px 0"><a href="https://kalian.es/login" class="btn">ENTRAR EN MI ÁREA</a></div>
            <p style="font-size:12px;color:#666">Si es tu primer curso con nosotros, recibirás también un email para activar tu cuenta y definir tu contraseña.</p>
          </div>
          <div class="f"><p>KALIAN HIRI KULTUR GUNEA</p><p>Responsable: Kalian. Finalidad: Gestión de soci@s y cursos. Derechos: Acceso y supresión.</p></div>
        </div></body></html>`,
    });
  }
);

// ─── sendReservationConfirmation ────────────────────────────────────────────
// Callable SIN auth (el invitado acaba de reservar y no tiene cuenta Firebase).
// Validación de origen: el `manageToken` debe existir en `reservas`. Todos los
// datos del email se leen del doc autoritativo en Firestore — el cliente solo
// pasa el token, lo demás se ignora. Esto cierra el vector de spam/phishing
// que tenía esta function al aceptar `email`/`nombre`/`eventoTitulo` arbitrarios.
export const sendReservationConfirmation = onCall(
  { secrets: [BREVO_API_KEY], region: EU_REGION },
  async (request) => {
    const { manageToken } = request.data as { manageToken?: string };

    if (typeof manageToken !== 'string' || manageToken.length < 16 || manageToken.length > 64) {
      throw new HttpsError('invalid-argument', 'Token no válido.');
    }

    const db = admin.firestore();
    const snap = await db.collection('reservas')
      .where('manageToken', '==', manageToken)
      .limit(1)
      .get();

    if (snap.empty) {
      // Error genérico: no revelamos si el token existe o no.
      throw new HttpsError('not-found', 'Reserva no encontrada.');
    }

    const reserva = snap.docs[0].data() as any;
    const email = String(reserva.emailTitular || '').toLowerCase().trim();
    const nombre = String(reserva.nombreTitular || '');
    const eventoTitulo = String(reserva.eventoTitulo || '');
    const ticketID = String(reserva.ticketID || '');
    const fechaActividad = String(reserva.fechaActividad || '');

    if (!email || !ticketID) {
      throw new HttpsError('failed-precondition', 'Reserva incompleta.');
    }

    // QR generado server-side a partir del ticketID validado, no del request.
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticketID)}`;

    // Formatear fecha y hora del evento (formato datetime-local: "2026-06-04T22:00")
    let fechaFormateada = '';
    if (fechaActividad) {
      const [dia, hora] = fechaActividad.split('T');
      if (dia) {
        const [y, m, d] = dia.split('-');
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                       'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const mesNombre = meses[Number(m) - 1] || m;
        fechaFormateada = `${Number(d)} de ${mesNombre} de ${y}` + (hora ? ` · ${hora.substring(0, 5)}h` : '');
      }
    }

    const nombreSafe = escapeHtml(nombre);
    const tituloSafe = escapeHtml(eventoTitulo);
    const ticketSafe = escapeHtml(ticketID);
    const fechaSafe = escapeHtml(fechaFormateada);
    const qrUrlSafe = escapeHtml(qrUrl);
    const tokenSafe = escapeHtml(manageToken);

    return callBrevo(BREVO_API_KEY.value(), {
      sender: SENDER,
      to: [{ email, name: nombre }],
      subject: `Confirmación Kalian: ${eventoTitulo}`,
      htmlContent: `<!DOCTYPE html><html><head>
        <style>
          body{margin:0;padding:0;background:#0A0A0A;font-family:Inter,sans-serif;color:#F5F5F0}
          .c{max-width:600px;margin:0 auto;background:#0A0A0A;border:1px solid #D4AF3733}
          .h{padding:40px;text-align:center;border-bottom:1px solid #D4AF3733}
          .b{padding:40px;text-align:center}
          .f{padding:30px;text-align:center;background:#000;border-top:1px solid #D4AF3733;font-size:10px;color:#666}
          h1{color:#D4AF37;font-size:32px;font-weight:900;text-transform:uppercase;margin:0;font-style:italic}
          p{font-size:16px;line-height:1.6;color:#F5F5F0CC;margin-bottom:20px}
          .acc{color:#D4AF37;font-weight:700}
          .tid{font-size:32px;font-weight:900;letter-spacing:5px;color:#F5F5F0;margin:0}
          .qr{background:#FFF;padding:16px;display:inline-block;border-radius:16px;margin:20px 0}
          .btn{display:inline-block;background:#D4AF37;color:#000;padding:16px 32px;text-decoration:none;font-weight:900;text-transform:uppercase;letter-spacing:2px;font-size:13px;border-radius:8px}
          .note{font-size:11px;color:#666;margin-top:10px}
        </style></head><body>
        <div class="c">
          <div class="h"><h1>RESERVA CONFIRMADA</h1></div>
          <div class="b">
            <p>Hola <span class="acc">${nombreSafe}</span>,</p>
            <p>Tu entrada para <span class="acc">${tituloSafe}</span> está confirmada.</p>
            ${fechaSafe ? `<p style="font-size:14px;color:#D4AF37;text-transform:uppercase;letter-spacing:3px;font-weight:700;margin-top:-10px">${fechaSafe}</p>` : ''}
            <p class="tid">${ticketSafe}</p>
            <div class="qr"><img src="${qrUrlSafe}" width="200" height="200" style="display:block"></div>
            <p style="font-size:12px;color:#666">Presenta este código en la entrada. El pago de acompañantes (si los hay) se realiza en efectivo.</p>
            <div style="margin-top:24px;padding-top:20px;border-top:1px solid #D4AF3733">
              <a href="https://kalian.es/mi-reserva?token=${tokenSafe}" class="btn">Gestionar mi reserva</a>
              <p class="note">Desde ahí puedes cambiar el número de acompañantes o cancelar.</p>
            </div>
          </div>
          <div class="f"><p>KALIAN HIRI KULTUR GUNEA</p></div>
        </div></body></html>`,
    });
  }
);

// ─── gestionarReservaInvitado ────────────────────────────────────────────────
// Callable SIN auth: un invitado (sin cuenta) gestiona su propia reserva mediante
// un manageToken largo y aleatorio (capability token) que recibió al reservar.
// Opera con Admin SDK, por lo que bypassa las reglas Firestore. Recalcula aforo.
type AccionReserva = 'consultar' | 'cancelar' | 'editar';

export const gestionarReservaInvitado = onCall(
  { region: EU_REGION },
  async (request) => {
    const { manageToken, accion, nuevoAcompanantes } = request.data as {
      manageToken?: string;
      accion?: AccionReserva;
      nuevoAcompanantes?: number;
    };

    if (typeof manageToken !== 'string' || manageToken.length < 16 || manageToken.length > 64) {
      throw new HttpsError('invalid-argument', 'Token no válido.');
    }
    if (accion !== 'consultar' && accion !== 'cancelar' && accion !== 'editar') {
      throw new HttpsError('invalid-argument', 'Acción no válida.');
    }

    const db = admin.firestore();

    // Localizar la reserva por su manageToken. Error genérico si no existe
    // (no revelamos si el token es real o no).
    const snap = await db.collection('reservas')
      .where('manageToken', '==', manageToken)
      .limit(1)
      .get();

    if (snap.empty) {
      throw new HttpsError('not-found', 'No hemos encontrado esa reserva.');
    }

    const reservaRef = snap.docs[0].ref;
    const reserva = snap.docs[0].data();
    const esCurso = !!reserva.esCurso;
    const coleccionActividad = esCurso ? 'cursos' : 'eventos';
    const eventoId: string | undefined = reserva.eventoId;

    const resumenActividad = async () => {
      let maxAcomp = 4;
      let aforoMax = 0;
      let aforoRes = 0;
      if (eventoId) {
        const actSnap = await db.collection(coleccionActividad).doc(eventoId).get();
        if (actSnap.exists) {
          const a = actSnap.data() as any;
          maxAcomp = Number(a.max_acompanantes || 4);
          aforoMax = Number(a.aforo_maximo || a.aforo_max || a.aforo_total || 0);
          aforoRes = Number(a.aforo_reservado || 0);
        }
      }
      // Releer la reserva para reflejar cambios recientes (p.ej. tras editar).
      const rSnap = await reservaRef.get();
      const r = (rSnap.exists ? rSnap.data() : reserva) as any;
      return {
        eventoTitulo: r.eventoTitulo || '',
        fechaActividad: r.fechaActividad || '',
        acompanantes: Number(r.acompañantes || 0),
        numPersonas: Number(r.numPersonas || 1),
        asistentesIngresados: Number(r.asistentes_ingresados || 0),
        esCurso,
        maxAcompanantes: maxAcomp,
        plazasLibres: Math.max(0, aforoMax - aforoRes),
      };
    };

    if (accion === 'consultar') {
      return { ok: true, reserva: await resumenActividad() };
    }

    if (accion === 'cancelar') {
      await db.runTransaction(async (tx) => {
        const rDoc = await tx.get(reservaRef);
        if (!rDoc.exists) return; // ya borrada
        const r = rDoc.data() as any;
        const totalReserva = 1 + Number(r.acompañantes || 0);
        const yaIngresados = Number(r.asistentes_ingresados || 0);
        const pendientes = Math.max(0, totalReserva - yaIngresados);

        if (pendientes > 0 && eventoId) {
          const actRef = db.collection(coleccionActividad).doc(eventoId);
          const actDoc = await tx.get(actRef);
          if (actDoc.exists) {
            tx.update(actRef, {
              aforo_reservado: admin.firestore.FieldValue.increment(-pendientes),
            });
          }
        }
        tx.delete(reservaRef);
      });
      return { ok: true, cancelada: true };
    }

    // accion === 'editar'
    const nuevo = Number(nuevoAcompanantes);
    if (!Number.isInteger(nuevo) || nuevo < 0 || nuevo > 19) {
      throw new HttpsError('invalid-argument', 'Número de acompañantes no válido.');
    }

    await db.runTransaction(async (tx) => {
      const rDoc = await tx.get(reservaRef);
      if (!rDoc.exists) throw new HttpsError('not-found', 'La reserva ya no existe.');
      const r = rDoc.data() as any;

      const actuales = Number(r.acompañantes || 0);
      const diferencia = nuevo - actuales;
      if (diferencia === 0) return;

      const yaIngresados = Number(r.asistentes_ingresados || 0);
      if (1 + nuevo < yaIngresados) {
        throw new HttpsError('failed-precondition',
          `No puedes bajar de ${yaIngresados}: ya hay esos asistentes registrados.`);
      }

      if (!eventoId) throw new HttpsError('failed-precondition', 'Reserva sin actividad asociada.');
      const actRef = db.collection(coleccionActividad).doc(eventoId);
      const actDoc = await tx.get(actRef);
      if (!actDoc.exists) throw new HttpsError('not-found', 'La actividad ya no existe.');
      const a = actDoc.data() as any;

      const maxAcomp = Number(a.max_acompanantes || 4);
      if (nuevo > maxAcomp) {
        throw new HttpsError('failed-precondition',
          `El máximo de acompañantes para esta actividad es ${maxAcomp}.`);
      }

      const update: Record<string, any> = {
        acompañantes: nuevo,
        numPersonas: 1 + nuevo,
      };

      if (!esCurso) {
        const aforoMax = Number(a.aforo_maximo || a.aforo_max || a.aforo_total || 0);
        const aforoRes = Number(a.aforo_reservado || 0);
        if (aforoRes + diferencia > aforoMax) {
          throw new HttpsError('failed-precondition',
            `Sin aforo suficiente. Plazas libres: ${Math.max(0, aforoMax - aforoRes)}.`);
        }
        tx.update(actRef, {
          aforo_reservado: admin.firestore.FieldValue.increment(diferencia),
        });

        // Recalcular totalPagar: el componente del titular ya tiene cualquier
        // descuento (socio/cupón) aplicado en la reserva original; los acompañantes
        // pagan precioBase. Despejamos precioTitular y reaplicamos con `nuevo`.
        const precioBase = Number(a.precio_estandar || a.precio || 0);
        const totalActual = Number(r.totalPagar || 0);
        const precioTitular = Math.max(0, totalActual - (actuales * precioBase));
        update.totalPagar = precioTitular + (nuevo * precioBase);
      }

      tx.update(reservaRef, update);
    });

    return { ok: true, reserva: await resumenActividad() };
  }
);

// ─── calcularPrecioReserva ───────────────────────────────────────────────────
// Callable SIN auth: calcula el precio autoritativo de una reserva server-side
// para que el cliente no pueda manipular `totalPagar` antes de guardar (A4).
// El cliente puede seguir haciendo el cálculo local para display en tiempo real;
// al enviar el formulario usa este valor para el campo `totalPagar` en Firestore.

// Lógica compartida con `gestionarReservaInvitado` para recalcular `totalPagar`
// cuando cambian los acompañantes. Devuelve el total y qué descuento se aplicó.
async function calcularPrecioInterno(params: {
  eventoId: string;
  esCurso: boolean;
  nAcomp: number;
  dniTitular?: string;
  cupon?: string;
}): Promise<{ total: number; esSocio: boolean; esClave: boolean; socioVigente: boolean }> {
  const { eventoId, esCurso, nAcomp, dniTitular, cupon } = params;
  const db = admin.firestore();
  const coleccion = esCurso ? 'cursos' : 'eventos';

  const eventoSnap = await db.doc(`${coleccion}/${eventoId}`).get();
  if (!eventoSnap.exists) throw new HttpsError('not-found', 'Actividad no encontrada.');

  const evento = eventoSnap.data() as any;
  const precioBase = Number(evento.precio_estandar || evento.precio || 0);
  const categoria = String(evento.categoria || 'musica');

  let esSocio = false;
  if (dniTitular) {
    const dniUpper = String(dniTitular).trim().toUpperCase();
    const socioSnap = await db.doc(`socios/${dniUpper}`).get();
    if (socioSnap.exists) {
      const hoy = new Date().toISOString().split('T')[0];
      const membresias = (socioSnap.data()?.membresias || {}) as Record<string, string>;
      if (categoria === 'musica') {
        esSocio = (membresias['musica'] || '') >= hoy || (membresias['local'] || '') >= hoy;
      } else {
        esSocio = (membresias[categoria] || '') >= hoy;
      }
    }
  }

  const cuponEvento = String(evento.cupon || '').toUpperCase();
  const cuponInput = String(cupon || '').trim().toUpperCase();
  const esClaveValida = cuponEvento.length > 0 && cuponInput === cuponEvento;

  let precioTitular = precioBase;
  let aplicadoSocio = false;
  let aplicadoClave = false;

  const pSocio = evento.tiene_descuento ? Number(evento.precio_descuento || 0) : precioBase;
  const pClave = (esClaveValida && evento.precioCupon) ? Number(evento.precioCupon) : precioBase;

  if (esSocio && pSocio < precioTitular) { precioTitular = pSocio; aplicadoSocio = true; }
  if (esClaveValida && pClave < precioTitular) { precioTitular = pClave; aplicadoClave = true; aplicadoSocio = false; }

  const total = esCurso ? precioTitular : precioTitular + (nAcomp * precioBase);
  // `esSocio` indica si el descuento de socio llegó a aplicarse; `socioVigente`
  // indica sólo que la membresía está en vigor (el cliente lo necesita para la
  // apertura anticipada de socios en eventos sin precio de socio).
  return { total, esSocio: aplicadoSocio, esClave: aplicadoClave, socioVigente: esSocio };
}

export const calcularPrecioReserva = onCall(
  { region: EU_REGION },
  async (request) => {
    const { eventoId, esCurso, numAcompañantes, dniTitular, cupon } = request.data as {
      eventoId?: string;
      esCurso?: boolean;
      numAcompañantes?: number;
      dniTitular?: string;
      cupon?: string;
    };

    if (typeof eventoId !== 'string' || eventoId.length === 0 || eventoId.length > 128) {
      throw new HttpsError('invalid-argument', 'eventoId no válido.');
    }

    const nAcomp = Math.max(0, Math.min(19, Number(numAcompañantes) || 0));
    return calcularPrecioInterno({
      eventoId,
      esCurso: !!esCurso,
      nAcomp,
      dniTitular,
      cupon,
    });
  }
);

// ─── comprobarReservaDuplicada ───────────────────────────────────────────────
// Callable SIN auth: comprueba si ya existe una reserva del mismo titular para
// el evento antes de guardarla. El cliente anónimo no puede hacer esta consulta
// directamente (firestore.rules sólo permite `list` de `reservas` a admin/portero
// o al propio titular autenticado) — de ahí que esto viva server-side con Admin
// SDK. Precedencia idéntica a la que usaba el cliente: uid > DNI > email.
// Devuelve sólo un booleano, nunca datos de la reserva ajena (evita enumeración).
export const comprobarReservaDuplicada = onCall(
  { region: EU_REGION },
  async (request) => {
    const { eventoId, dni, email } = request.data as {
      eventoId?: string;
      dni?: string;
      email?: string;
    };

    if (typeof eventoId !== 'string' || eventoId.length === 0 || eventoId.length > 128) {
      throw new HttpsError('invalid-argument', 'eventoId no válido.');
    }

    const db = admin.firestore();
    let q = db.collection('reservas').where('eventoId', '==', eventoId);

    const uid = request.auth?.uid;
    const dniNorm = typeof dni === 'string' ? dni.trim().toUpperCase() : '';
    // `emailTitular` se guarda tal cual lo escribe el usuario (sin lowercase,
    // ver ReservaForm.tsx), así que sólo recortamos espacios para no romper
    // la comparación exacta que ya hacía el cliente.
    const emailNorm = typeof email === 'string' ? email.trim() : '';

    if (uid) {
      q = q.where('uidTitular', '==', uid);
    } else if (dniNorm) {
      q = q.where('dniTitular', '==', dniNorm);
    } else if (emailNorm) {
      q = q.where('emailTitular', '==', emailNorm);
    } else {
      // Sin uid, DNI ni email no hay nada que comprobar.
      return { duplicada: false };
    }

    const snap = await q.limit(1).get();
    return { duplicada: !snap.empty };
  }
);

// ─── subscribeNewsletter ────────────────────────────────────────────────────
// Callable SIN auth (alta pública). Validación de origen: el doc en
// `newsletter_subscribers` con este email y `estado: 'pendiente_confirmacion'`
// debe haberse creado en los últimos 5 minutos (lo escribe el cliente justo
// antes via reglas validadas). Esto ata la function al flow legítimo y cierra
// el vector de envío arbitrario a Brevo desde un endpoint público.
export const subscribeNewsletter = onCall(
  { secrets: [BREVO_API_KEY, BREVO_NEWSLETTER_LIST_ID, BREVO_NEWSLETTER_DOI_TEMPLATE_ID], region: EU_REGION },
  async (request) => {
    const { nombre, email } = request.data as { nombre?: string; email?: string };

    if (typeof nombre !== 'string' || nombre.trim().length === 0 || nombre.length > 100) {
      throw new HttpsError('invalid-argument', 'Nombre no válido.');
    }
    if (typeof email !== 'string' || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'Email no válido.');
    }

    const emailNorm = email.toLowerCase().trim();
    const nombreNorm = nombre.trim();

    // Verificación de origen: alta reciente pendiente en Firestore
    const db = admin.firestore();
    const snap = await db.collection('newsletter_subscribers')
      .where('email', '==', emailNorm)
      .limit(5)
      .get();

    if (snap.empty) {
      throw new HttpsError('failed-precondition', 'Alta no encontrada.');
    }

    const cutoffMs = Date.now() - 5 * 60 * 1000;
    const valido = snap.docs.some(doc => {
      const d = doc.data() as any;
      return d.estado === 'pendiente_confirmacion' && (d.fecha?.toMillis?.() ?? 0) >= cutoffMs;
    });

    if (!valido) {
      throw new HttpsError('failed-precondition', 'Alta no encontrada o expirada.');
    }

    // Sin fallback a una lista concreta: con el modelo de dos listas
    // (ver SPEC.md §3), caer a un ID por defecto significaría dar de alta en la
    // lista heredada de MailPoet, que es justamente la que no tiene
    // consentimiento acreditado. Ante un secreto mal configurado es preferible
    // fallar el alta que escribir en la lista equivocada.
    const listId = Number(BREVO_NEWSLETTER_LIST_ID.value().trim());
    if (!Number.isInteger(listId) || listId <= 0) {
      logger.error('subscribeNewsletter: BREVO_NEWSLETTER_LIST_ID no es un ID de lista válido');
      throw new HttpsError('internal', 'No se pudo dar de alta en el servicio de email.');
    }
    const templateId = Number(BREVO_NEWSLETTER_DOI_TEMPLATE_ID.value());
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);
    let res;
    try {
      // doubleOptinConfirmation (no /contacts): envía el email DOI vía la plantilla
      // indicada y solo añade el contacto a `includeListIds` cuando confirma el link.
      // Con POST /contacts (endpoint anterior) el contacto entraba directo a la lista
      // sin pasar por ninguna confirmación, así que nunca se disparaba ningún email.
      res = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': BREVO_API_KEY.value(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: emailNorm,
          // FIRSTNAME (no NOMBRE): es el atributo estándar que existe en la
          // cuenta de Brevo (Contacts > Settings > Contact attributes).
          // NOMBRE nunca se creó, así que Brevo lo descartaba en silencio
          // y {{ contact.NOMBRE }} en la plantilla DOI se quedaba vacío.
          attributes: { FIRSTNAME: nombreNorm },
          includeListIds: [listId],
          templateId,
          redirectionUrl: NEWSLETTER_DOI_REDIRECT_URL,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const err = await safeJson(res);
      if (res.status === 400 && err.code === 'duplicate_parameter') {
        return { ok: true, duplicate: true };
      }
      // `message` es clave reservada del logger estructurado de Firebase Functions
      // (la pisa con su propio stack trace), así que el texto de Brevo va aparte.
      logger.error('subscribeNewsletter: Brevo error', { status: res.status, code: err.code, brevoMessage: err.message });
      throw new HttpsError('internal', 'No se pudo dar de alta en el servicio de email.');
    }

    return { ok: true };
  }
);

// ─── brevoWebhook ───────────────────────────────────────────────────────────
// Recibe eventos de Brevo (unsubscribed, hardBounce, spam) y actualiza
// el doc correspondiente en `newsletter_subscribers` marcándolo como baja.
// Validación: la URL debe llevar ?secret=<BREVO_WEBHOOK_SECRET> para evitar
// llamadas falsas (Brevo no firma HMAC, así que usamos query secret).
export const brevoWebhook = onRequest(
  { region: EU_REGION, secrets: [BREVO_WEBHOOK_SECRET] },
  async (req, res) => {
    const secretProvided = (req.query.secret || req.headers['x-brevo-secret']) as string | undefined;
    if (!secretProvided || secretProvided !== BREVO_WEBHOOK_SECRET.value()) {
      logger.warn('brevoWebhook: secret inválido', { ip: req.ip });
      res.status(401).send('unauthorized');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('method not allowed');
      return;
    }

    const body = req.body as { event?: string; email?: string; date?: string };

    // Validar antigüedad del payload para protección contra replay (A1).
    // Brevo incluye campo `date` en formato "YYYY-MM-DD HH:MM:SS" UTC.
    // Si el evento tiene más de 5 min, lo descartamos silenciosamente.
    const payloadDate = body?.date;
    if (payloadDate) {
      const ts = Date.parse(payloadDate.includes('T') ? payloadDate : payloadDate.replace(' ', 'T') + 'Z');
      if (!isNaN(ts) && Date.now() - ts > 5 * 60_000) {
        logger.warn('brevoWebhook: payload demasiado antiguo, posible replay', { ip: req.ip });
        res.status(200).send('ok');
        return;
      }
    }
    const event = (body?.event || '').toLowerCase();
    const email = (body?.email || '').toLowerCase().trim();

    if (!email) {
      res.status(200).send('ok'); // ignoramos eventos sin email sin protestar
      return;
    }

    const eventosBaja = ['unsubscribed', 'spam', 'hardbounce', 'hard_bounce', 'blocked'];
    if (!eventosBaja.includes(event)) {
      res.status(200).send('ok');
      return;
    }

    try {
      const db = admin.firestore();
      const snap = await db.collection('newsletter_subscribers')
        .where('email', '==', email)
        .limit(1)
        .get();

      if (snap.empty) {
        logger.info('brevoWebhook: email no encontrado en Firestore', { email: maskEmail(email), event });
        res.status(200).send('ok');
        return;
      }

      await snap.docs[0].ref.update({
        estado: 'baja',
        motivo: event,
        fecha_baja: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info('brevoWebhook: suscriptor marcado como baja', { email: maskEmail(email), event });
    } catch (err: any) {
      logger.error('brevoWebhook: error actualizando Firestore', { error: err.message, email: maskEmail(email), event });
    }
    res.status(200).send('ok');
  }
);

// ─── onNewsletterSubscriberDeleted ──────────────────────────────────────────
// Cuando un admin borra a un suscriptor desde Firestore, también lo borramos
// del contacto en Brevo para que no siga recibiendo emails. Si Brevo
// responde 404 (contacto inexistente), lo ignoramos silenciosamente.
export const onNewsletterSubscriberDeleted = onDocumentDeleted(
  {
    document: 'newsletter_subscribers/{id}',
    region: EU_REGION,
    secrets: [BREVO_API_KEY],
  },
  async (event) => {
    const data = event.data?.data();
    const email = (data?.email || '').toLowerCase().trim();
    if (!email) return;

    // Reintentar hasta 3 veces con backoff exponencial ante errores 5xx / red (A2).
    try {
      await withRetry(async () => {
        const url = `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`;
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);
        let r;
        try {
          r = await fetch(url, {
            method: 'DELETE',
            headers: { 'api-key': BREVO_API_KEY.value(), accept: 'application/json' },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(tid);
        }
        if (r.status === 404) return; // Ya no existía en Brevo, OK
        if (r.status === 429 || r.status >= 500) {
          throw new Error(`Brevo DELETE status ${r.status}`);
        }
        if (!r.ok) {
          const errBody = await r.text();
          logger.error('onNewsletterSubscriberDeleted: Brevo DELETE falló (no reintentable)', {
            email: maskEmail(email), status: r.status, body: errBody,
          });
        }
      });
    } catch (err: any) {
      logger.error('onNewsletterSubscriberDeleted: excepción tras reintentos', { error: err.message, email: maskEmail(email) });
    }
  }
);

// ─── reconciliarNewsletterBrevo ─────────────────────────────────────────────
// Cada lunes a las 04:00 UTC reconcilia ambas direcciones:
// - Contactos en Brevo no presentes en Firestore → se importan
// - Contactos blacklisted en Brevo pero activos en Firestore → se marcan baja
// - Docs en 'pendiente_confirmacion' presentes en Brevo (DOI completado) → se promueven a 'activo'
// - Docs en 'pendiente_confirmacion' con más de DIAS_MAX_PENDIENTE días → se marcan baja
// - Docs activos en Firestore ausentes de Brevo → se marcan baja (campaña de reconfirmación o limpieza Brevo)
const DIAS_MAX_PENDIENTE = 14;

export const reconciliarNewsletterBrevo = onSchedule(
  {
    schedule: 'every monday 04:00',
    region: EU_REGION,
    secrets: [BREVO_API_KEY, BREVO_NEWSLETTER_LIST_ID],
    timeoutSeconds: 540,
  },
  async () => {
    const db = admin.firestore();
    // .trim(): el valor se interpola crudo en la URL de listado de contactos.
    const listId = BREVO_NEWSLETTER_LIST_ID.value().trim();
    const apiKey = BREVO_API_KEY.value();

    let offset = 0;
    const limit = 500;

    // email → { nombre, blacklisted }
    const contactosBrevo = new Map<string, { nombre: string; blacklisted: boolean }>();

    while (true) {
      const url = `https://api.brevo.com/v3/contacts/lists/${listId}/contacts?limit=${limit}&offset=${offset}`;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);
      let r;
      try {
        r = await fetch(url, {
          headers: { 'api-key': apiKey, accept: 'application/json' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(tid);
      }
      if (!r.ok) {
        logger.error('reconciliarNewsletterBrevo: fallo listando contactos', { status: r.status });
        return;
      }
      const data = await safeJson(r) as {
        contacts?: Array<{ email: string; emailBlacklisted?: boolean; attributes?: { FIRSTNAME?: string } }>
      };
      const contacts = data.contacts || [];
      if (contacts.length === 0) break;
      for (const c of contacts) {
        const e = (c.email || '').toLowerCase().trim();
        if (!e) continue;
        const nombre = c.attributes?.FIRSTNAME || '';
        contactosBrevo.set(e, { nombre, blacklisted: !!c.emailBlacklisted });
      }
      if (contacts.length < limit) break;
      offset += limit;
    }

    // Construir índice de emails ya en Firestore (con ref + datos cacheados)
    const snap = await db.collection('newsletter_subscribers').get();
    const docsFirestore = new Map<string, { ref: admin.firestore.DocumentReference; data: any }>();
    for (const docu of snap.docs) {
      const d = docu.data() as any;
      const e = (d.email || '').toLowerCase().trim();
      if (e) docsFirestore.set(e, { ref: docu.ref, data: d });
    }

    let marcadosBaja = 0;
    let promovidosActivo = 0;
    let importados = 0;

    for (const [email, { nombre, blacklisted }] of contactosBrevo) {
      const existente = docsFirestore.get(email);
      if (existente) {
        const estadoActual = existente.data?.estado || 'activo';
        if (blacklisted && estadoActual === 'activo') {
          await existente.ref.update({
            estado: 'baja',
            motivo: 'reconciliacion',
            fecha_baja: admin.firestore.FieldValue.serverTimestamp(),
          });
          marcadosBaja++;
        } else if (!blacklisted && estadoActual === 'pendiente_confirmacion') {
          await existente.ref.update({
            estado: 'activo',
            fecha_confirmacion: admin.firestore.FieldValue.serverTimestamp(),
          });
          promovidosActivo++;
        } else if (!blacklisted && estadoActual === 'baja') {
          // Posible re-alta: solo reactivamos si hay una alta más reciente que la baja.
          const fechaAlta = existente.data?.fecha?.toMillis?.() ?? 0;
          const fechaBaja = existente.data?.fecha_baja?.toMillis?.() ?? 0;
          if (fechaAlta > fechaBaja) {
            await existente.ref.update({
              estado: 'activo',
              fecha_confirmacion: admin.firestore.FieldValue.serverTimestamp(),
              motivo: admin.firestore.FieldValue.delete(),
            });
            promovidosActivo++;
          }
        }
      } else {
        // No existe en Firestore → importar
        await db.collection('newsletter_subscribers').add({
          email,
          nombre: nombre || email.split('@')[0],
          estado: blacklisted ? 'baja' : 'activo',
          ...(blacklisted ? { motivo: 'bounce_o_baja', fecha_baja: admin.firestore.FieldValue.serverTimestamp() } : {}),
          fecha: admin.firestore.FieldValue.serverTimestamp(),
          origen: 'brevo_import',
          acepto_terminos: true,
        });
        importados++;
      }
    }

    // Limpieza de pendientes caducados y bajas por ausencia en Brevo
    const ahora = Date.now();
    const cortePendiente = ahora - DIAS_MAX_PENDIENTE * 24 * 60 * 60 * 1000;
    let pendientesCaducados = 0;
    let bajasPorAusencia = 0;
    let bajasSinConsentimiento = 0;

    for (const [email, { ref, data }] of docsFirestore) {
      const estadoActual = data?.estado || 'activo';
      const enBrevo = contactosBrevo.has(email);

      if (estadoActual === 'pendiente_confirmacion' && !enBrevo) {
        const fechaMs = data?.fecha?.toMillis?.() ?? 0;
        if (fechaMs > 0 && fechaMs < cortePendiente) {
          await ref.update({
            estado: 'baja',
            motivo: 'no_confirmado',
            fecha_baja: admin.firestore.FieldValue.serverTimestamp(),
          });
          pendientesCaducados++;
        }
      } else if (estadoActual === 'activo' && !enBrevo) {
        // Dos causas muy distintas caen aquí, y conviene no confundirlas:
        //
        // a) El contacto pasó por nuestro doble opt-in (tiene `fecha_confirmacion`)
        //    y luego desapareció de la lista de Brevo → baja normal por ausencia.
        // b) El contacto nunca confirmó nada con nosotros: es un heredado de la
        //    importación MailPoet → Brevo, del que no conservamos prueba de
        //    consentimiento. Al apuntar BREVO_NEWSLETTER_LIST_ID a la lista nueva
        //    (la que alimenta el formulario con DOI) todos estos desaparecen en
        //    bloque en la primera reconciliación. Marcarlos como 'reconciliacion'
        //    los mezclaría con las bajas ordinarias y borraría el rastro de por
        //    qué se dieron de baja, que es justamente lo que hay que poder
        //    acreditar ante la autoridad de control.
        //
        // `fecha_confirmacion` solo la escriben la promoción DOI de esta misma
        // función y el panel admin, así que es la señal fiable de "hubo opt-in".
        const sinPruebaConsentimiento = !data?.fecha_confirmacion;
        await ref.update({
          estado: 'baja',
          motivo: sinPruebaConsentimiento ? 'migracion_sin_consentimiento' : 'reconciliacion',
          fecha_baja: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (sinPruebaConsentimiento) bajasSinConsentimiento++;
        else bajasPorAusencia++;
      }
    }

    logger.info('reconciliarNewsletterBrevo: completado', {
      brevoContactos: contactosBrevo.size,
      firestoreAntes: snap.size,
      importados,
      marcadosBaja,
      promovidosActivo,
      pendientesCaducados,
      bajasPorAusencia,
      bajasSinConsentimiento,
    });
  }
);
