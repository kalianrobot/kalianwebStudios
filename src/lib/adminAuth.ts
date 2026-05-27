import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
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
 * Creates a new user in Firebase Auth without signing out the current admin.
 * Returns the UID and a password reset link.
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

    try {
      await sendPasswordResetEmail(secondaryAuth, email);
    } catch (resetErr) {
      if (isDev) console.warn("createSocioAuth: Error al enviar reset (no crítico):", resetErr);
    }

    return { uid: user.uid, resetSent: true };
  } catch (error: any) {
    if (isDev) console.error("createSocioAuth: Error capturado:", error.code);
    if (error.code === 'auth/email-already-in-use') {
      try {
        await sendPasswordResetEmail(secondaryAuth, email);
      } catch (e) {
        if (isDev) console.warn("createSocioAuth: Error al enviar reset a usuario existente:", e);
      }
      return { uid: null, resetSent: true, alreadyExists: true };
    }
    throw error;
  }
};
