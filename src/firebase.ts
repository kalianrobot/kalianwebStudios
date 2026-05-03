import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Inicializamos Firebase con la configuración oficial del proyecto
const app = initializeApp(firebaseConfig);

// Exportamos las herramientas para usarlas en el resto de la web
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, (firebaseConfig as any).firestoreDatabaseId || "(default)");

export const auth = getAuth(app);
export const storage = getStorage(app);
