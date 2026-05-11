/**
 * Brevo Service for sending transactional emails.
 *
 * SECURITY (A2): este módulo se ejecuta en el cliente y por tanto la clave
 * `VITE_BREVO_API_KEY` se incrusta en el bundle público. Cualquiera puede
 * extraerla desde DevTools y enviar correos en nombre del dominio. La solución
 * correcta es mover estos envíos a una Cloud Function HTTPS callable que
 * reciba `email`, `nombre`, `uid` y use la API key sólo en el entorno del
 * servidor. Mientras tanto se mantiene esta versión como compatibilidad.
 */

const BREVO_API_KEY = import.meta.env.VITE_BREVO_API_KEY;
const isDev = import.meta.env.DEV;

export const sendWelcomeEmail = async (email: string, nombre: string, activationLink: string) => {
  if (!BREVO_API_KEY) {
    if (isDev) console.warn("BREVO_API_KEY is not defined in environment variables.");
    return;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: "Centro Cultural Kalian",
          email: "hola@kalian.es" // Replace with actual sender email
        },
        to: [{
          email: email,
          name: nombre
        }],
        subject: "¡Bienvenido/a a Kalian! Activa tu cuenta",
        htmlContent: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
              body { margin: 0; padding: 0; background-color: #0A0A0A; font-family: 'Inter', sans-serif; color: #F5F5F0; }
              .container { max-width: 600px; margin: 0 auto; background-color: #0A0A0A; border: 1px solid #D4AF3733; }
              .header { padding: 60px 40px; text-align: center; border-bottom: 1px solid #D4AF3733; }
              .content { padding: 40px; text-align: center; }
              .footer { padding: 30px; text-align: center; background-color: #000; border-top: 1px solid #D4AF3733; font-size: 10px; color: #666; }
              h1 { color: #D4AF37; font-size: 48px; font-weight: 900; text-transform: uppercase; letter-spacing: -2px; margin: 0; line-height: 0.9; font-style: italic; }
              p { font-size: 16px; line-height: 1.6; color: #F5F5F0CC; margin-bottom: 25px; }
              .btn { display: inline-block; background-color: #D4AF37; color: #000; padding: 20px 40px; text-decoration: none; border-radius: 0; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; font-size: 14px; transition: background-color 0.3s; }
              .accent { color: #D4AF37; font-weight: 700; }
              .divider { height: 2px; width: 40px; background-color: #D4AF37; margin: 30px auto; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin-bottom: 10px;">BIENVENIDO</h1>
                <h1>A KALIAN</h1>
              </div>
              <div class="content">
                <p>Hola <span class="accent">${nombre}</span>,</p>
                <p>Estamos encantados de tenerte como nuevo soci@s de nuestra comunidad cultural. Prepárate para vivir experiencias únicas.</p>
                <div class="divider"></div>
                <p>Para empezar a disfrutar de todas las ventajas en nuestra plataforma web, necesitas activar tu cuenta y definir tu contraseña.</p>
                <div style="margin: 40px 0;">
                  <a href="${activationLink}" class="btn">ACTIVAR MI CUENTA</a>
                </div>
                <p style="font-size: 12px; color: #666;">Recibirás un segundo email oficial de seguridad para completar este proceso.</p>
              </div>
              <div class="footer">
                <p style="margin-bottom: 10px;">CENTRO CULTURAL KALIAN</p>
                <p>Responsable: Kalian. Finalidad: Gestión de soci@s. Derechos: Acceso y supresión.</p>
              </div>
            </div>
          </body>
          </html>
        `
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Error sending email via Brevo");
    }

    return await response.json();
  } catch (error) {
    console.error("Error in sendWelcomeEmail:", error);
    throw error;
  }
};

export const sendMembershipUpdateEmail = async (email: string, nombre: string, uid: string, membresias: Record<string, string>) => {
  if (!BREVO_API_KEY) {
    if (isDev) console.warn("BREVO_API_KEY is not defined.");
    return;
  }

  // B11: ya no enviamos el UID a un servicio QR de terceros (filtración de identificadores).
  // El carnet con el QR se genera en cliente al iniciar sesión.
  const carnetUrl = `https://kalian.es/perfil`;
  const hoy = new Date().toISOString().split('T')[0];
  
  const membresiasHtml = Object.entries(membresias)
    .filter(([_, fecha]) => fecha >= hoy)
    .map(([cat, fecha]) => {
      const nombreCat = cat === 'musica' ? 'Music Is Cool' : cat === 'danza' ? 'Club de Baile' : cat === 'local' ? 'Locales' : cat;
      return `
        <div style="background-color: #1A1A1A; border: 1px solid #D4AF3733; padding: 15px; margin-bottom: 10px; border-radius: 12px; text-align: left;">
          <p style="margin: 0; color: #D4AF37; font-weight: 900; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">${nombreCat}</p>
          <p style="margin: 5px 0 0 0; font-size: 10px; color: #F5F5F066; font-weight: 700;">VÁLIDO HASTA: ${fecha}</p>
        </div>
      `;
    }).join('');

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: "Centro Cultural Kalian",
          email: "hola@kalian.es"
        },
        to: [{
          email: email,
          name: nombre
        }],
        subject: "Tu Carnet Digital Kalian ha sido actualizado",
        htmlContent: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
              body { margin: 0; padding: 0; background-color: #0A0A0A; font-family: 'Inter', sans-serif; color: #F5F5F0; }
              .container { max-width: 600px; margin: 0 auto; background-color: #0A0A0A; border: 1px solid #D4AF3733; }
              .header { padding: 40px; text-align: center; border-bottom: 1px solid #D4AF3733; }
              .content { padding: 40px; text-align: center; }
              .footer { padding: 30px; text-align: center; background-color: #000; border-top: 1px solid #D4AF3733; font-size: 10px; color: #666; }
              h1 { color: #D4AF37; font-size: 32px; font-weight: 900; text-transform: uppercase; margin: 0; font-style: italic; letter-spacing: -1px; }
              .btn { display: inline-block; background-color: #D4AF37; color: #000; padding: 18px 36px; text-decoration: none; border-radius: 0; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; font-size: 13px; }
              .accent { color: #D4AF37; font-weight: 700; }
              .membresias-container { max-width: 400px; margin: 0 auto; padding-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>CARNET DIGITAL</h1>
              </div>
              <div class="content">
                <p>Hola <span class="accent">${nombre}</span>,</p>
                <p>Tu membresía en Kalian ha sido actualizada. Accede a tu carnet digital con QR para entrar al centro:</p>

                <div style="margin: 40px 0;">
                  <a href="${carnetUrl}" class="btn">VER MI CARNET</a>
                </div>

                <p style="font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 40px;">Identificador socio: ${uid.substring(0, 8)}…</p>
                
                <div class="membresias-container">
                  <p style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #D4AF37; margin-bottom: 15px; text-align: left; letter-spacing: 1px;">Tus Membresías Activas:</p>
                  ${membresiasHtml || '<p style="color: #666; font-size: 12px; font-style: italic;">No tienes membresías activas en este momento.</p>'}
                </div>
              </div>
              <div class="footer">
                <p>CENTRO CULTURAL KALIAN</p>
                <p>Este carnet es personal e intransferible.</p>
              </div>
            </div>
          </body>
          </html>
        `
      })
    });
    return await response.json();
  } catch (error) {
    console.error("Error in sendMembershipUpdateEmail:", error);
    throw error;
  }
};
