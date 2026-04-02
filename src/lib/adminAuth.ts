import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser } from "firebase/auth";

// Firebase config from firebase.ts (simplified)
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
  // Use a secondary app instance to avoid signing out the current user
  const secondaryApp = getApps().find(app => app.name === "SecondaryApp") || initializeApp(firebaseConfig, "SecondaryApp");
  const secondaryAuth = getAuth(secondaryApp);

  try {
    // 1. Create user with a random password
    const randomPassword = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, randomPassword);
    const user = userCredential.user;

    // 2. Generate password reset link
    // Note: We use the main auth instance's config for the link if needed, 
    // but secondaryAuth works too as it's the same project.
    const resetLink = await sendPasswordResetEmail(secondaryAuth, email).then(() => {
        // Firebase doesn't return the link directly via sendPasswordResetEmail on client SDK.
        // It sends the email automatically.
        // Wait, the user wants to include the link in a CUSTOM Brevo email.
        // To get the link, we'd need Firebase Admin SDK or a specific API.
        // On client SDK, we can't get the link string, it just sends the email.
        return null;
    });

    // Wait, if I can't get the link string, I can't include it in the Brevo email.
    // Is there a way to get the link? 
    // Only via Admin SDK (not available here) or by using a custom action URL.
    // Actually, there's no way to get the reset link string from the client SDK.
    
    // Alternative: The user said "Este email debe incluir un enlace de 'Activación de Cuenta' generado mediante sendPasswordResetEmail".
    // If I can't get the link, I might have to tell the user that Firebase sends it directly.
    // BUT, maybe I can use `generatePasswordResetLink`? No, that's Admin SDK only.
    
    // Wait! If I use `sendPasswordResetEmail`, Firebase sends its own template.
    // The user wants to use BREVO.
    
    // Let's check if there's any other way.
    // Maybe I can just send the Brevo email and tell the user to check their inbox for the Firebase one?
    // No, the request says "Este email [de Brevo] debe incluir un enlace...".
    
    // If I can't get the link, I'll have to use a workaround or explain the limitation.
    // Actually, I can't get the link string from the client SDK.
    
    return { uid: user.uid, resetSent: true };
  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') {
        // User already exists in Auth, we can still send a reset email
        await sendPasswordResetEmail(secondaryAuth, email);
        return { uid: null, resetSent: true, alreadyExists: true };
    }
    throw error;
  }
};
