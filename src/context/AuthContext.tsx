import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut, User, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs, DocumentData, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { syncSocioStatus } from '../lib/socioService';

interface AuthContextType {
  user: User | null;
  socioData: DocumentData | null;
  isAdmin: boolean;
  isTeacher: boolean;
  isPortero: boolean;
  role: 'admin' | 'teacher' | 'portero' | 'socio' | 'invitado' | 'invitado_registrado';
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
  const [isPortero, setIsPortero] = useState(false);
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
          // 1. Prioridad Master Admin
          const emailLower = firebaseUser.email?.toLowerCase() || '';
          const isMaster = emailLower === "kalianrobot@gmail.com";
          
          let currentRole: any = isMaster ? 'admin' : 'invitado';
          
          if (isMaster) {
            setIsAdmin(true);
            setIsTeacher(false);
            setIsPortero(false);
            setLoading(false);
          }

          // 2. Carga de perfil en /users/
          const userRef = doc(db, "users", firebaseUser.uid);
          let userSnap = null;
          try {
            userSnap = await getDoc(userRef);
            
            if (userSnap && userSnap.exists()) {
              const data = userSnap.data();
              setUserData(data);
              currentRole = data.role || (isMaster ? 'admin' : 'invitado');
            } else if (isMaster || !userSnap) {
              const initialRole = isMaster ? 'admin' : 'invitado';
              const newUserData = {
                uid: firebaseUser.uid,
                email: emailLower,
                nombre: firebaseUser.displayName || (isMaster ? "Admin Maestro" : "Usuario Nuevo"),
                role: initialRole,
                createdAt: new Date().toISOString()
              };
              setUserData(newUserData);
              currentRole = initialRole;
              setDoc(userRef, newUserData, { merge: true }).catch(err => console.warn("Error creating profile doc:", err));
            }
          } catch (e: any) {
            console.warn("Auth: Error controlado en perfil:", e.message);
            if (isMaster) currentRole = 'admin';
          }

          // 3. Estabilizar estados booleanos y rol final
          if (isMaster) {
            setIsAdmin(true);
            setIsTeacher(false);
            setIsPortero(false);
          } else {
            setIsAdmin(currentRole === 'admin');
            setIsTeacher(['teacher', 'profesor', 'teacher_admin'].includes(currentRole));
            setIsPortero(currentRole === 'portero');
          }

          // 4. Carga de datos de Socio (Background)
          if (!isMaster) {
            const q = query(collection(db, "socios"), where("uid", "==", firebaseUser.uid));
            getDocs(q).then(snap => {
              if (!snap.empty) {
                const sId = snap.docs[0].id;
                setSocioData(snap.docs[0].data());
                syncSocioStatus(sId).then(async () => {
                  const updatedSnap = await getDoc(doc(db, "socios", sId));
                  if (updatedSnap.exists()) setSocioData(updatedSnap.data());
                }).catch(e => console.error("Sync error:", e));
              }
            }).catch(e => console.warn("Socio data fetch error:", e));
          }
        } catch (error: any) {
          console.error("Auth: Error en carga de sesión:", error.message);
        }
      } else {
        setUser(null);
        setSocioData(null);
        setUserData(null);
        setIsAdmin(false);
        setIsTeacher(false);
        setIsPortero(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const obtenerRolDinamico = (): 'admin' | 'teacher' | 'portero' | 'socio' | 'invitado' | 'invitado_registrado' => {
    if (isAdmin) return 'admin';
    if (isTeacher) return 'teacher';
    if (isPortero) return 'portero';
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
    isPortero,
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
