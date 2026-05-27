"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMembershipUpdateEmail = exports.traducirTextoEU = exports.sendWelcomeEmail = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = require("firebase-admin");
const node_fetch_1 = require("node-fetch");
admin.initializeApp();
const BREVO_API_KEY = (0, params_1.defineSecret)('BREVO_API_KEY');
const SENDER = { name: 'Centro Cultural Kalian', email: 'hola@kalian.es' };
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
// ─── sendWelcomeEmail ────────────────────────────────────────────────────────
exports.sendWelcomeEmail = (0, https_1.onCall)({ secrets: [BREVO_API_KEY] }, async (request) => {
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
// ─── traducirTextoEU ─────────────────────────────────────────────────────────
exports.traducirTextoEU = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Auth required');
    const { texto } = request.data;
    if (!texto?.trim())
        return { traduccion: '' };
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=es|eu`;
    const res = await (0, node_fetch_1.default)(url);
    if (!res.ok)
        throw new https_1.HttpsError('internal', `MyMemory HTTP ${res.status}`);
    const data = await res.json();
    if (data.responseStatus !== 200)
        throw new https_1.HttpsError('internal', data.responseDetails || 'MyMemory error');
    return { traduccion: data.responseData.translatedText };
});
exports.sendMembershipUpdateEmail = (0, https_1.onCall)({ secrets: [BREVO_API_KEY] }, async (request) => {
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
//# sourceMappingURL=index.js.map