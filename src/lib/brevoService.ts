/**
 * Brevo Service for sending transactional emails.
 */

const BREVO_API_KEY = import.meta.env.VITE_BREVO_API_KEY;

export const sendWelcomeEmail = async (email: string, nombre: string, activationLink: string) => {
  if (!BREVO_API_KEY) {
    console.warn("BREVO_API_KEY is not defined in environment variables.");
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
                <p>Estamos encantados de tenerte como nuevo socio de nuestra comunidad cultural. Prepárate para vivir experiencias únicas.</p>
                <div class="divider"></div>
                <p>Para empezar a disfrutar de todas las ventajas en nuestra plataforma web, necesitas activar tu cuenta y definir tu contraseña.</p>
                <div style="margin: 40px 0;">
                  <a href="${activationLink}" class="btn">ACTIVAR MI CUENTA</a>
                </div>
                <p style="font-size: 12px; color: #666;">Recibirás un segundo email oficial de seguridad para completar este proceso.</p>
              </div>
              <div class="footer">
                <p style="margin-bottom: 10px;">CENTRO CULTURAL KALIAN</p>
                <p>Responsable: Kalian. Finalidad: Gestión de socios. Derechos: Acceso y supresión.</p>
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
