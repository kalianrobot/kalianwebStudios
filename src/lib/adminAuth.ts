import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const isDev = import.meta.env.DEV;

// Genera una contraseña aleatoria criptográficamente segura. La cuenta recibirá
// inmediatamente un email de reset, pero hasta entonces queremos que la contraseña
// inicial no sea predecible.
const generateSecurePassword = (length = 24): string => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset[bytes[i] % charset.length];
  }
  return out;
};

/**
 * Crea el usuario en Firebase Auth sin desloguear al admin que está operando.
 * NO envía ningún email: el enlace para crear la contraseña lo genera y manda
 * después la Cloud Function correspondiente (`sendWelcomeEmail` en las altas
 * manuales, `sendCourseApprovalEmail` al aprobar una inscripción), para que al
 * socio le llegue un único correo en vez de dos.
 */
export const createSocioAuth = async (email: string) => {
  if (isDev) console.log("createSocioAuth: Iniciando para", email);
  const secondaryApp = getApps().find(app => app.name === "SecondaryApp") || initializeApp(firebaseConfig, "SecondaryApp");
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const randomPassword = generateSecurePassword();
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, randomPassword);
    const user = userCredential.user;
    if (isDev) console.log("createSocioAuth: Usuario creado en Auth con UID:", user.uid);

    return { uid: user.uid };
  } catch (error: any) {
    if (isDev) console.error("createSocioAuth: Error capturado:", error.code);
    if (error.code === 'auth/email-already-in-use') {
      return { uid: null, alreadyExists: true };
    }
    throw error;
  }
};
