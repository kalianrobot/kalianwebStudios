/**
 * Temporal: en el proyecto de TEST activa el acceso con email/contraseña y
 * crea (o resetea) el usuario ADMIN_EMAIL con una contraseña aleatoria.
 * La contraseña solo se imprime cifrada con scripts/clave-publica-temporal.pem.
 */
const fs = require('fs');
const crypto = require('crypto');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const PROJECT = process.env.TARGET_PROJECT;
const EMAIL = 'kalianrobot@gmail.com';
if (!PROJECT || PROJECT === 'kalianhkg-886a6') { console.error('Proyecto no válido'); process.exit(1); }

const credential = cert(JSON.parse(fs.readFileSync(process.env.TARGET_CREDENTIALS, 'utf8')));
const app = initializeApp({ credential, projectId: PROJECT });

async function main() {
  const { access_token } = await credential.getAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ signIn: { email: { enabled: true, passwordRequired: true } } }),
    }
  );
  console.log('Activar email/contraseña:', res.status, res.ok ? 'OK' : await res.text());

  const password = crypto.randomBytes(12).toString('base64url');
  const auth = getAuth(app);
  try {
    const u = await auth.getUserByEmail(EMAIL);
    await auth.updateUser(u.uid, { password, emailVerified: true, disabled: false });
    console.log('Usuario existente actualizado:', u.uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    const u = await auth.createUser({ email: EMAIL, password, emailVerified: true });
    console.log('Usuario creado:', u.uid);
  }

  const pub = fs.readFileSync(__dirname + '/clave-publica-temporal.pem', 'utf8');
  const cifrada = crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(password));
  console.log('PASSWORD_CIFRADA=' + cifrada.toString('base64'));
}

main().catch(err => { console.error(err); process.exit(1); });
