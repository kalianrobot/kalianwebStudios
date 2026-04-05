import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser } from "firebase/auth";

// Use the same config as the main app
const firebaseConfig = {
  apiKey: "AIzaSyD5gbpdxZ1acXElYmMGUd1s0aMELxV9lQ0",
  authDomain: "kalianhkg-886a6.firebaseapp.com",
  projectId: "kalianhkg-886a6",
  storageBucket: "kalianhkg-886a6.firebasestorage.app",
  messagingSenderId: "447832718855",
  appId: "1:447832718855:web:3720a40ab626e424f0b4a2",
  measurementId: "G-699BVNWMKJ"
};

/**
 * Creates a new user in Firebase Auth without signing out the current admin.
 * Returns the UID and a password reset link.
 */
export const createSocioAuth = async (email: string) => {
  console.log("createSocioAuth: Iniciando para", email);
  // Use a secondary app instance to avoid signing out the current user
  const secondaryApp = getApps().find(app => app.name === "SecondaryApp") || initializeApp(firebaseConfig, "SecondaryApp");
  const secondaryAuth = getAuth(secondaryApp);

  try {
    // 1. Create user with a random password
    const randomPassword = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    console.log("createSocioAuth: Intentando createUserWithEmailAndPassword");
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, randomPassword);
    const user = userCredential.user;
    console.log("createSocioAuth: Usuario creado en Auth con UID:", user.uid);

    // 2. Generate password reset link (optional, don't let it block)
    try {
      console.log("createSocioAuth: Intentando enviar email de reset");
      await sendPasswordResetEmail(secondaryAuth, email);
      console.log("createSocioAuth: Email de reset enviado");
    } catch (resetErr) {
      console.warn("createSocioAuth: Error al enviar reset (no crítico):", resetErr);
    }
    
    return { uid: user.uid, resetSent: true };
  } catch (error: any) {
    console.error("createSocioAuth: Error capturado:", error.code, error.message);
    if (error.code === 'auth/email-already-in-use') {
        console.log("createSocioAuth: El email ya existe, intentando enviar reset");
        try {
          await sendPasswordResetEmail(secondaryAuth, email);
        } catch (e) {
          console.warn("createSocioAuth: Error al enviar reset a usuario existente:", e);
        }
        return { uid: null, resetSent: true, alreadyExists: true };
    }
    throw error;
  }
};
