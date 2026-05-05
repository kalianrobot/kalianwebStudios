import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

export const createSocioAuth = async (email: string) => {
  const secondaryApp = getApps().find(app => app.name === "SecondaryApp") || initializeApp(firebaseConfig, "SecondaryApp");
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const randomPassword = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, randomPassword);

    try {
      await sendPasswordResetEmail(secondaryAuth, email);
    } catch (resetErr) {
      console.warn("createSocioAuth: Error al enviar reset (no crítico):", resetErr);
    }

    return { uid: userCredential.user.uid, resetSent: true };
  } catch (error: any) {
    console.error("createSocioAuth:", error.code, error.message);
    if (error.code === 'auth/email-already-in-use') {
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
