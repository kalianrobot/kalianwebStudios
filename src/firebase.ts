import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

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
export const db = getFirestore(app);
export const auth = getAuth(app);
