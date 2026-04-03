import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, query, where, getDocs, DocumentData, updateDoc, doc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  socioData: DocumentData | null;
  isAdmin: boolean;
  isTeacher: boolean;
  role: 'admin' | 'teacher' | 'socio' | 'invitado' | 'invitado_registrado';
  loading: boolean;
  loginAdmin: (password: string) => boolean;
  loginTeacher: (password: string) => boolean;
  logoutAdmin: () => void;
  logoutTeacher: () => void;
  logoutSocio: () => Promise<void>;
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
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('kalianAdmin') === 'true');
  const [isTeacher, setIsTeacher] = useState(localStorage.getItem('kalianTeacher') === 'true');
  const [loading, setLoading] = useState(true);

  const hoy = new Date().toISOString().split('T')[0];

  const esSocioActivo = (categoria: string) => {
    if (!socioData?.expiraciones) return false;
    const fechaExp = socioData.expiraciones[categoria];
    return fechaExp && fechaExp >= hoy;
  };

  const loginAdmin = (password: string) => {
    if (password === 'kalian2026') {
      setIsAdmin(true);
      setIsTeacher(false);
      localStorage.setItem('kalianAdmin', 'true');
      localStorage.removeItem('kalianTeacher');
      return true;
    }
    return false;
  };

  const loginTeacher = (password: string) => {
    if (password === 'profekalian') {
      setIsTeacher(true);
      setIsAdmin(false);
      localStorage.setItem('kalianTeacher', 'true');
      localStorage.removeItem('kalianAdmin');
      return true;
    }
    return false;
  };

  const logoutAdmin = () => {
    setIsAdmin(false);
    localStorage.removeItem('kalianAdmin');
  };

  const logoutTeacher = () => {
    setIsTeacher(false);
    localStorage.removeItem('kalianTeacher');
  };

  const logoutSocio = () => {
    return signOut(auth);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const q = query(collection(db, "socios"), where("uid", "==", firebaseUser.uid));
          const snap = await getDocs(q);
          if (!snap.empty) {
            setSocioData(snap.docs[0].data());
          } else if (firebaseUser.email) {
            // Vincular socio por email si fue creado por admin sin UID
            const qEmail = query(collection(db, "socios"), where("email", "==", firebaseUser.email));
            const snapEmail = await getDocs(qEmail);
            if (!snapEmail.empty) {
              const docRef = snapEmail.docs[0].ref;
              await updateDoc(docRef, { uid: firebaseUser.uid });
              setSocioData({ ...snapEmail.docs[0].data(), uid: firebaseUser.uid });
            }
          }
        } catch (error) {
          console.error("Error obteniendo datos del socio:", error);
        }
      } else {
        setUser(null);
        setSocioData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const obtenerRolDinamico = (): 'admin' | 'teacher' | 'socio' | 'invitado' | 'invitado_registrado' => {
    if (isAdmin) return 'admin';
    if (isTeacher) return 'teacher';
    if (!user) return 'invitado';
    
    const tieneContratoActivo = Object.values(socioData?.expiraciones || {})
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
    esSocioActivo
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
