import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeFirestore, collection, limit, getDocsFromServer, query } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD5gbpdxZ1acXElYmMGUd1s0aMELxV9lQ0",
  authDomain: "kalianhkg-886a6.firebaseapp.com",
  projectId: "kalianhkg-886a6",
  storageBucket: "kalianhkg-886a6.firebasestorage.app",
  messagingSenderId: "447832718855",
  appId: "1:447832718855:web:3720a40ab626e424f0b4a2",
  measurementId: "G-699BVNWMKJ"
};

// Inicializamos Firebase
const app = initializeApp(firebaseConfig);

// Exportamos las herramientas para usarlas en el resto de la web
// Forzamos LONG POLLING para evitar errores internos de Firestore en el proxy de AI Studio
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const auth = getAuth(app);
export const storage = getStorage(app);
