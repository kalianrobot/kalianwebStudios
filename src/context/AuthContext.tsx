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
        console.log("Auth: Usuario detectado:", firebaseUser.email);
        setUser(firebaseUser);
        try {
          // 1. Obtener datos de rol (Admin/Teacher)
          const userRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const data = userSnap.data();
            console.log("Auth: Documento de usuario encontrado:", data.role);
            setUserData(data);
            // Prioridad absoluta al email maestro
            if (firebaseUser.email === "kalianrobot@gmail.com") {
              console.log("Auth: Admin maestro detectado por email");
              setIsAdmin(true);
              setIsTeacher(false);
              setIsPortero(false);
            } else {
              setIsAdmin(data.role === 'admin');
              setIsTeacher(data.role === 'teacher');
              setIsPortero(data.role === 'portero');
            }
          } else {
            console.log("Auth: Documento de usuario NO existe");
            // Si no existe en users, comprobamos si es el admin por defecto
            if (firebaseUser.email === "kalianrobot@gmail.com") {
              console.log("Auth: Creando admin maestro por defecto");
              setIsAdmin(true);
              setIsTeacher(false);
              setIsPortero(false);
              // Crear el documento de admin si no existe
              try {
                await setDoc(userRef, {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email,
                  nombre: "Administrador",
                  role: 'admin'
                });
              } catch (e) {
                console.error("Error creating admin doc:", e);
              }
            } else {
              setIsAdmin(false);
              setIsTeacher(false);
              setIsPortero(false);
            }
          }

          // 2. Obtener datos de socio
          const q = query(collection(db, "socios"), where("uid", "==", firebaseUser.uid));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const sId = snap.docs[0].id;
            const sData = snap.docs[0].data();
            setSocioData(sData);
            
            // Sincronizar estado en segundo plano para no bloquear el login
            syncSocioStatus(sId).then(async () => {
              const updatedSnap = await getDoc(doc(db, "socios", sId));
              if (updatedSnap.exists()) {
                setSocioData(updatedSnap.data());
              }
            }).catch(err => console.error("Error sync status:", err));

          } else if (firebaseUser.email) {
            const qEmail = query(collection(db, "socios"), where("email", "==", firebaseUser.email));
            const snapEmail = await getDocs(qEmail);
            if (!snapEmail.empty) {
              const docRef = snapEmail.docs[0].ref;
              const sId = docRef.id;
              await updateDoc(docRef, { uid: firebaseUser.uid });
              setSocioData(snapEmail.docs[0].data());

              // Sincronizar estado en segundo plano
              syncSocioStatus(sId).then(async () => {
                const updatedSnap = await getDoc(doc(db, "socios", sId));
                if (updatedSnap.exists()) {
                  setSocioData(updatedSnap.data());
                }
              }).catch(err => console.error("Error sync status:", err));
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
