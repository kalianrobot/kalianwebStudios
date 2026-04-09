import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut, User, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs, DocumentData, updateDoc, doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  socioData: DocumentData | null;
  isAdmin: boolean;
  isTeacher: boolean;
  role: 'admin' | 'teacher' | 'socio' | 'invitado' | 'invitado_registrado';
  loading: boolean;
  loginAdmin: (email: string, password: string) => Promise<void>;
  loginTeacher: (email: string, password: string) => Promise<void>;
  logoutAdmin: () => void;
  logoutTeacher: () => void;
  logoutSocio: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  esSocioActivo: (categoria: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [socioData, setSocioData] = useState<DocumentData | null>(null);
  const [userData, setUserData] = useState<DocumentData | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [loading, setLoading] = useState(true);

  const hoy = new Date().toISOString().split('T')[0];

  const esSocioActivo = (categoria: string) => {
    if (!socioData?.membresias) return false;
    const fechaExp = socioData.membresias[categoria];
    return fechaExp && fechaExp >= hoy;
  };

  const loginAdmin = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const loginTeacher = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logoutAdmin = () => {
    signOut(auth);
  };

  const logoutTeacher = () => {
    signOut(auth);
  };

  const logoutSocio = () => {
    return signOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          // 1. Obtener datos de rol (Admin/Teacher)
          const userRef = doc(db, "users", firebaseUser.uid);
          let userSnap;
          try {
            userSnap = await getDoc(userRef);
          } catch (e: any) {
            if (e.code === 'unavailable' || e.message?.includes('offline')) {
              console.warn("Firestore offline, intentando obtener desde el servidor...");
              userSnap = await getDocFromServer(userRef);
            } else {
              throw e;
            }
          }

          if (userSnap.exists()) {
            const data = userSnap.data();
            setUserData(data);
            setIsAdmin(data.role === 'admin');
            setIsTeacher(data.role === 'teacher');
          } else {
            // Si no existe en users, comprobamos si es el admin por defecto
            if (firebaseUser.email === "kalianrobot@gmail.com") {
              setIsAdmin(true);
              setIsTeacher(false);
              // Crear el documento de admin si no existe para asegurar que la colección existe
              await setDoc(userRef, {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                nombre: "Administrador",
                role: 'admin'
              });
            } else {
              setIsAdmin(false);
              setIsTeacher(false);
            }
          }

          // 2. Obtener datos de socio
          const q = query(collection(db, "socios"), where("uid", "==", firebaseUser.uid));
          const snap = await getDocs(q);
          if (!snap.empty) {
            setSocioData(snap.docs[0].data());
          } else if (firebaseUser.email) {
            const qEmail = query(collection(db, "socios"), where("email", "==", firebaseUser.email));
            const snapEmail = await getDocs(qEmail);
            if (!snapEmail.empty) {
              const docRef = snapEmail.docs[0].ref;
              await updateDoc(docRef, { uid: firebaseUser.uid });
              setSocioData({ ...snapEmail.docs[0].data(), uid: firebaseUser.uid });
            }
          }
        } catch (error) {
          console.error("Error obteniendo datos del usuario:", error);
        }
      } else {
        setUser(null);
        setSocioData(null);
        setUserData(null);
        setIsAdmin(false);
        setIsTeacher(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const obtenerRolDinamico = (): 'admin' | 'teacher' | 'socio' | 'invitado' | 'invitado_registrado' => {
    if (isAdmin) return 'admin';
    if (isTeacher) return 'teacher';
    if (!user) return 'invitado';
    
    const tieneContratoActivo = socioData?.estado === 'activo' || Object.values(socioData?.membresias || {})
      .some(fecha => (fecha as string) >= hoy);
      
    return tieneContratoActivo ? 'socio' : 'invitado_registrado';
  };

  const role = obtenerRolDinamico();

  const value = { 
    user, 
    socioData, 
    isAdmin, 
    isTeacher,
    role, 
    loading, 
    loginAdmin, 
    loginTeacher,
    logoutAdmin, 
    logoutTeacher,
    logoutSocio,
    resetPassword,
    esSocioActivo
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
