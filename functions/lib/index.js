"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gestionarReservaInvitado = exports.sendReservationConfirmation = exports.sendMembershipUpdateEmail = exports.sendWelcomeEmail = exports.validatePuertaAccess = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = require("firebase-admin");
const node_fetch_1 = require("node-fetch");
admin.initializeApp();
const EU_REGION = 'europe-west1';
const BREVO_API_KEY = (0, params_1.defineSecret)('BREVO_API_KEY');
const SENDER = { name: 'Centro Cultural Kalian', email: 'info@kalian.es' };
async function callBrevo(apiKey, payload) {
    const res = await (0, node_fetch_1.default)('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Brevo error');
    }
    return res.json();
}
// ─── validatePuertaAccess ────────────────────────────────────────────────────
// Sin auth: la tablet de puerta no tiene usuario Firebase. Valida la contraseña
// compartida server-side y devuelve un Custom Token para operar como "portero".
const PUERTA_UID = 'puerta-service';
exports.validatePuertaAccess = (0, https_1.onCall)({ region: EU_REGION }, async (request) => {
    const { password } = request.data;
    if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
        throw new https_1.HttpsError('invalid-argument', 'Contraseña no válida.');
    }
    const db = admin.firestore();
    const configSnap = await db.doc('configuracion/seguridad').get();
    if (!configSnap.exists) {
        throw new https_1.HttpsError('internal', 'Clave de puerta no configurada.');
    }
    const { clave_puerta } = configSnap.data();
    if (!clave_puerta || password !== clave_puerta) {
        throw new https_1.HttpsError('permission-denied', 'Contraseña incorrecta.');
    }
    // Ensure the puerta service user doc exists so isPortero() rules pass
    const userRef = db.doc(`users/${PUERTA_UID}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        await userRef.set({ uid: PUERTA_UID, role: 'portero', nombre: 'Puerta Service' });
    }
    const customToken = await admin.auth().createCustomToken(PUERTA_UID, { role: 'portero' });
    return { token: customToken };
});
// ─── sendWelcomeEmail ────────────────────────────────────────────────────────
exports.sendWelcomeEmail = (0, https_1.onCall)({ secrets: [BREVO_API_KEY], region: EU_REGION }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Auth required');
    const { email, nombre, activationLink } = request.data;
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
            <p>Hola <span class="acc">${nombre}</span>,</p>
            <p>Estamos encantados de tenerte como nuevo soci@s de nuestra comunidad cultural.</p>
            <div class="div"></div>
            <p>Para acceder a todas las ventajas, activa tu cuenta y define tu contraseña.</p>
            <div style="margin:40px 0"><a href="${activationLink}" class="btn">ACTIVAR MI CUENTA</a></div>
            <p style="font-size:12px;color:#666">Recibirás un segundo email de seguridad para completar el proceso.</p>
          </div>
          <div class="f"><p>CENTRO CULTURAL KALIAN</p><p>Responsable: Kalian. Finalidad: Gestión de soci@s. Derechos: Acceso y supresión.</p></div>
        </div></body></html>`,
    });
});
exports.sendMembershipUpdateEmail = (0, https_1.onCall)({ secrets: [BREVO_API_KEY], region: EU_REGION }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Auth required');
    const { email, nombre, uid, membresias } = request.data;
    const hoy = new Date().toISOString().split('T')[0];
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${uid}`;
    const membresiasHtml = Object.entries(membresias)
        .filter(([, fecha]) => fecha >= hoy)
        .map(([cat, fecha]) => {
        const cat_nombre = cat === 'musica' ? 'Music Is Cool' : cat === 'danza' ? 'Club de Baile' : cat === 'local' ? 'Locales' : cat;
        return `<div style="background:#1A1A1A;border:1px solid #D4AF3733;padding:15px;margin-bottom:10px;border-radius:12px;text-align:left">
          <p style="margin:0;color:#D4AF37;font-weight:900;text-transform:uppercase;font-size:12px">${cat_nombre}</p>
          <p style="margin:5px 0 0;font-size:10px;color:#F5F5F066;font-weight:700">VÁLIDO HASTA: ${fecha}</p>
        </div>`;
    }).join('') || '<p style="color:#666;font-size:12px;font-style:italic">No tienes membresías activas.</p>';
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
            <p>Hola <span class="acc">${nombre}</span>,</p>
            <p>Tu membresía en Kalian ha sido actualizada. Presenta este QR en el centro:</p>
            <div class="qr"><img src="${qrUrl}" width="200" height="200" style="display:block"></div>
            <p style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:2px;margin-bottom:40px">UID: ${uid}</p>
            <div style="max-width:400px;margin:0 auto;padding-top:20px">
              <p style="font-size:12px;font-weight:900;text-transform:uppercase;color:#D4AF37;margin-bottom:15px;text-align:left">Tus Membresías Activas:</p>
              ${membresiasHtml}
            </div>
          </div>
          <div class="f"><p>CENTRO CULTURAL KALIAN</p><p>Este carnet es personal e intransferible.</p></div>
        </div></body></html>`,
    });
});
// ─── sendReservationConfirmation ────────────────────────────────────────────
// Callable SIN auth: el invitado acaba de reservar y no tiene cuenta Firebase.
exports.sendReservationConfirmation = (0, https_1.onCall)({ secrets: [BREVO_API_KEY], region: EU_REGION }, async (request) => {
    const { email, nombre, eventoTitulo, ticketID, qrUrl, manageToken, fechaActividad } = request.data;
    if (!email || !ticketID || !manageToken) {
        throw new https_1.HttpsError('invalid-argument', 'Faltan datos obligatorios.');
    }
    // Formatear fecha y hora del evento (formato datetime-local: "2026-06-04T22:00")
    let fechaFormateada = '';
    if (fechaActividad && typeof fechaActividad === 'string') {
        const [dia, hora] = fechaActividad.split('T');
        if (dia) {
            const [y, m, d] = dia.split('-');
            const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            const mesNombre = meses[Number(m) - 1] || m;
            fechaFormateada = `${Number(d)} de ${mesNombre} de ${y}` + (hora ? ` · ${hora.substring(0, 5)}h` : '');
        }
    }
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
            <p>Hola <span class="acc">${nombre}</span>,</p>
            <p>Tu entrada para <span class="acc">${eventoTitulo}</span> está confirmada.</p>
            ${fechaFormateada ? `<p style="font-size:14px;color:#D4AF37;text-transform:uppercase;letter-spacing:3px;font-weight:700;margin-top:-10px">${fechaFormateada}</p>` : ''}
            <p class="tid">${ticketID}</p>
            <div class="qr"><img src="${qrUrl}" width="200" height="200" style="display:block"></div>
            <p style="font-size:12px;color:#666">Presenta este código en la entrada. El pago de acompañantes (si los hay) se realiza en efectivo.</p>
            <div style="margin-top:24px;padding-top:20px;border-top:1px solid #D4AF3733">
              <a href="https://kalian.es/mi-reserva?token=${manageToken}" class="btn">Gestionar mi reserva</a>
              <p class="note">Desde ahí puedes cambiar el número de acompañantes o cancelar.</p>
            </div>
          </div>
          <div class="f"><p>CENTRO CULTURAL KALIAN</p></div>
        </div></body></html>`,
    });
});
exports.gestionarReservaInvitado = (0, https_1.onCall)({ region: EU_REGION }, async (request) => {
    const { manageToken, accion, nuevoAcompanantes } = request.data;
    if (typeof manageToken !== 'string' || manageToken.length < 16 || manageToken.length > 64) {
        throw new https_1.HttpsError('invalid-argument', 'Token no válido.');
    }
    if (accion !== 'consultar' && accion !== 'cancelar' && accion !== 'editar') {
        throw new https_1.HttpsError('invalid-argument', 'Acción no válida.');
    }
    const db = admin.firestore();
    // Localizar la reserva por su manageToken. Error genérico si no existe
    // (no revelamos si el token es real o no).
    const snap = await db.collection('reservas')
        .where('manageToken', '==', manageToken)
        .limit(1)
        .get();
    if (snap.empty) {
        throw new https_1.HttpsError('not-found', 'No hemos encontrado esa reserva.');
    }
    const reservaRef = snap.docs[0].ref;
    const reserva = snap.docs[0].data();
    const esCurso = !!reserva.esCurso;
    const coleccionActividad = esCurso ? 'cursos' : 'eventos';
    const eventoId = reserva.eventoId;
    const resumenActividad = async () => {
        let maxAcomp = 4;
        let aforoMax = 0;
        let aforoRes = 0;
        if (eventoId) {
            const actSnap = await db.collection(coleccionActividad).doc(eventoId).get();
            if (actSnap.exists) {
                const a = actSnap.data();
                maxAcomp = Number(a.max_acompanantes || 4);
                aforoMax = Number(a.aforo_maximo || a.aforo_max || a.aforo_total || 0);
                aforoRes = Number(a.aforo_reservado || 0);
            }
        }
        // Releer la reserva para reflejar cambios recientes (p.ej. tras editar).
        const rSnap = await reservaRef.get();
        const r = (rSnap.exists ? rSnap.data() : reserva);
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
            if (!rDoc.exists)
                return; // ya borrada
            const r = rDoc.data();
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
        throw new https_1.HttpsError('invalid-argument', 'Número de acompañantes no válido.');
    }
    await db.runTransaction(async (tx) => {
        const rDoc = await tx.get(reservaRef);
        if (!rDoc.exists)
            throw new https_1.HttpsError('not-found', 'La reserva ya no existe.');
        const r = rDoc.data();
        const actuales = Number(r.acompañantes || 0);
        const diferencia = nuevo - actuales;
        if (diferencia === 0)
            return;
        const yaIngresados = Number(r.asistentes_ingresados || 0);
        if (1 + nuevo < yaIngresados) {
            throw new https_1.HttpsError('failed-precondition', `No puedes bajar de ${yaIngresados}: ya hay esos asistentes registrados.`);
        }
        if (!eventoId)
            throw new https_1.HttpsError('failed-precondition', 'Reserva sin actividad asociada.');
        const actRef = db.collection(coleccionActividad).doc(eventoId);
        const actDoc = await tx.get(actRef);
        if (!actDoc.exists)
            throw new https_1.HttpsError('not-found', 'La actividad ya no existe.');
        const a = actDoc.data();
        const maxAcomp = Number(a.max_acompanantes || 4);
        if (nuevo > maxAcomp) {
            throw new https_1.HttpsError('failed-precondition', `El máximo de acompañantes para esta actividad es ${maxAcomp}.`);
        }
        if (!esCurso) {
            const aforoMax = Number(a.aforo_maximo || a.aforo_max || a.aforo_total || 0);
            const aforoRes = Number(a.aforo_reservado || 0);
            if (aforoRes + diferencia > aforoMax) {
                throw new https_1.HttpsError('failed-precondition', `Sin aforo suficiente. Plazas libres: ${Math.max(0, aforoMax - aforoRes)}.`);
            }
            tx.update(actRef, {
                aforo_reservado: admin.firestore.FieldValue.increment(diferencia),
            });
        }
        tx.update(reservaRef, {
            acompañantes: nuevo,
            numPersonas: 1 + nuevo,
        });
    });
    return { ok: true, reserva: await resumenActividad() };
});
//# sourceMappingURL=index.js.map