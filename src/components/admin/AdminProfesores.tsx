import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, DocumentData, updateDoc, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { createSocioAuth } from '../../lib/adminAuth';

const AdminProfesores = () => {
  const [profesores, setProfesores] = useState<DocumentData[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ 
    nombre: '', 
    email: '', 
    especialidad: '',
    activo: true
  });
  const [editando, setEditando] = useState<string | null>(null);

  const fetchProfesores = async () => {
    try {
      const snap = await getDocs(query(collection(db, "profesores"), orderBy("nombre", "asc")));
      setProfesores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error al obtener profesores:", err);
    }
  };

  useEffect(() => { fetchProfesores(); }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const emailClean = form.email.trim().toLowerCase();
      
      if (editando) {
        await updateDoc(doc(db, "profesores", editando), { ...form, email: emailClean });
        await updateDoc(doc(db, "users", editando), { nombre: form.nombre, email: emailClean });
        setMsg("✅ Profesor actualizado");
      } else {
        // 1. Intentar crear en Firebase Auth
        let uid = null;
        try {
          const authResult = await createSocioAuth(emailClean);
          uid = authResult.uid;
        } catch (authErr: any) {
          if (authErr.code !== 'auth/email-already-in-use') throw authErr;
        }
        
        // 2. Si no hay UID (porque ya existe en Auth), buscamos en Firestore de forma exhaustiva
        if (!uid) {
          // Función auxiliar para buscar en una colección por email
          const findUidByEmail = async (colName: string) => {
            const q = query(collection(db, colName), where("email", "==", emailClean));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const data = snap.docs[0].data();
              // Priorizar el campo 'uid' si existe, si no, usar el ID del documento
              return data.uid || snap.docs[0].id;
            }
            
            // Intentar con el email original por si no estaba en minúsculas
            const qOrig = query(collection(db, colName), where("email", "==", form.email.trim()));
            const snapOrig = await getDocs(qOrig);
            if (!snapOrig.empty) {
              const dataOrig = snapOrig.docs[0].data();
              return dataOrig.uid || snapOrig.docs[0].id;
            }
            
            return null;
          };

          // Buscar en orden de probabilidad
          uid = await findUidByEmail("users");
          if (!uid) uid = await findUidByEmail("socios");
          if (!uid) {
            // Caso especial: socios a veces guardan el UID en un campo 'uid' y el ID del doc es el DNI
            const socioQuery = await getDocs(query(collection(db, "socios"), where("email", "==", emailClean)));
            if (!socioQuery.empty) uid = socioQuery.docs[0].data().uid;
          }
          if (!uid) uid = await findUidByEmail("profesores");
        }

        if (!uid) {
          alert("EL USUARIO EXISTE EN AUTH PERO NO TIENE PERFIL: El email '" + emailClean + "' ya tiene una cuenta de acceso creada, pero no tiene datos en ninguna tabla (socios/profesores). Por favor, bórralo de la consola de Firebase Auth o usa otro email.");
          setLoading(false);
          return;
        }

        // 3. Crear en Firestore profesores
        await setDoc(doc(db, "profesores", uid), {
          ...form,
          email: emailClean,
          uid: uid,
          fechaAlta: new Date().toISOString()
        });

        // 4. Crear/Actualizar en Firestore users con rol teacher
        await setDoc(doc(db, "users", uid), {
          uid: uid,
          email: emailClean,
          nombre: form.nombre,
          role: 'teacher'
        }, { merge: true });

        setMsg("✅ Profesor creado y acceso vinculado");
      }
      
      setTimeout(() => setMsg(''), 3000);
      setForm({ nombre: '', email: '', especialidad: '', activo: true });
      setEditando(null);
      fetchProfesores();
    } catch (err: any) { 
      console.error("Error al guardar profesor:", err);
      alert("ERROR AL GUARDAR: " + (err.message || "Error desconocido")); 
    }
    setLoading(false);
  };

  const eliminar = async (uid: string) => {
    if (window.confirm("¿Seguro que quieres eliminar a este profesor? (No se borrará su acceso de Auth automáticamente)")) {
      await deleteDoc(doc(db, "profesores", uid));
      // Opcionalmente borrar de users
      await deleteDoc(doc(db, "users", uid));
      fetchProfesores();
    }
  };

  const repararAcceso = async (p: DocumentData) => {
    setLoading(true);
    try {
      const emailClean = p.email.trim().toLowerCase();
      
      // Buscar el UID real
      const findUidByEmail = async (colName: string) => {
        const q = query(collection(db, colName), where("email", "==", emailClean));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          return data.uid || (snap.docs[0].id.includes('@') ? null : snap.docs[0].id);
        }
        return null;
      };

      // Intentar encontrar el UID real en socios o users
      let realUid = await findUidByEmail("socios");
      if (!realUid) realUid = await findUidByEmail("users");

      if (!realUid || realUid === p.uid) {
        alert("No se ha podido encontrar un UID diferente para este email. Si el problema persiste, borra al profesor y vuelve a crearlo.");
      } else {
        // 1. Crear el nuevo perfil correcto
        await setDoc(doc(db, "profesores", realUid), {
          nombre: p.nombre,
          email: emailClean,
          especialidad: p.especialidad || '',
          activo: p.activo !== false,
          uid: realUid,
          fechaAlta: p.fechaAlta || new Date().toISOString()
        });

        await setDoc(doc(db, "users", realUid), {
          uid: realUid,
          email: emailClean,
          nombre: p.nombre,
          role: 'teacher'
        }, { merge: true });

        // 2. Borrar el perfil incorrecto
        await deleteDoc(doc(db, "profesores", p.uid));
        await deleteDoc(doc(db, "users", p.uid));

        setMsg("✅ Acceso reparado con éxito");
        fetchProfesores();
      }
    } catch (err) {
      console.error(err);
      alert("Error al reparar");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto">
        <Link to="/staff" className="text-indigo-600 font-bold text-xs uppercase tracking-widest">← Volver</Link>
        <h1 className="text-4xl font-black italic uppercase mb-8 mt-2 tracking-tighter">Gestión de <span className="text-indigo-600">Profesores</span></h1>

        {msg && <div className="bg-emerald-500 text-white p-5 rounded-3xl mb-8 font-bold text-center shadow-xl animate-bounce">{msg}</div>}

        <div className="grid md:grid-cols-2 gap-8">
          {/* FORMULARIO */}
          <form onSubmit={guardar} className="bg-white p-10 rounded-[3rem] shadow-2xl space-y-5 h-fit border-t-[12px] border-indigo-600">
            <h2 className="text-xl font-black uppercase italic mb-4">{editando ? 'Editar Profesor' : 'Nuevo Profesor'}</h2>
            
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Nombre Completo</label>
              <input type="text" placeholder="Nombre del profesor" className="w-full p-5 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Email (Login)</label>
              <input 
                type="email" 
                placeholder="email@kalian.es" 
                className="w-full p-5 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900 disabled:opacity-50" 
                value={form.email} 
                onChange={e => setForm({...form, email: e.target.value})} 
                required 
                disabled={!!editando}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Especialidad</label>
              <input type="text" placeholder="ej: Guitarra, Baile Moderno..." className="w-full p-5 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.especialidad} onChange={e => setForm({...form, especialidad: e.target.value})} />
            </div>

            <div className="flex gap-3">
              <button 
                disabled={loading}
                className="flex-1 bg-indigo-600 text-white p-6 rounded-[2rem] font-black uppercase shadow-2xl hover:bg-slate-900 transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? 'Procesando...' : (editando ? 'Actualizar' : 'Crear Profesor')}
              </button>
              {editando && (
                <button 
                  type="button"
                  onClick={() => {
                    setEditando(null);
                    setForm({ nombre: '', email: '', especialidad: '', activo: true });
                  }}
                  className="bg-slate-200 text-slate-600 px-8 rounded-[2rem] font-black uppercase"
                >Cancelar</button>
              )}
            </div>
          </form>

          {/* LISTADO */}
          <div className="space-y-4">
            <h2 className="text-xl font-black uppercase italic mb-4 ml-4 text-slate-400">Staff Docente</h2>
            {profesores.map(p => (
              <div key={p.id} className="bg-white p-6 rounded-[2.5rem] shadow-lg border border-slate-100 flex justify-between items-center group">
                <div>
                  <h3 className="font-black text-lg uppercase italic leading-none">{p.nombre}</h3>
                  <p className="text-[10px] text-indigo-500 font-black mt-1 uppercase tracking-widest">{p.especialidad || 'Sin especialidad'}</p>
                  <p className="text-[9px] text-slate-400 font-bold mt-1">{p.email}</p>
                  {p.uid && p.uid.length < 15 && (
                    <div className="mt-2">
                      <p className="text-[8px] text-red-500 font-bold uppercase mb-1">⚠️ UID Incorrecto (DNI detectado)</p>
                      <button 
                        onClick={() => repararAcceso(p)}
                        className="text-[8px] bg-red-500 text-white px-2 py-1 rounded-md font-black uppercase hover:bg-slate-900 transition-colors"
                      >
                        Reparar Acceso
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setEditando(p.uid);
                      setForm({
                        nombre: p.nombre,
                        email: p.email,
                        especialidad: p.especialidad || '',
                        activo: p.activo !== false
                      });
                    }}
                    className="p-3 bg-slate-100 rounded-xl hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 transition-all"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => eliminar(p.uid)}
                    className="p-3 bg-slate-100 rounded-xl hover:bg-red-100 text-slate-400 hover:text-red-600 transition-all"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            {profesores.length === 0 && (
              <p className="text-center py-10 text-slate-400 font-bold uppercase text-xs tracking-widest italic">No hay profesores registrados</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminProfesores;
