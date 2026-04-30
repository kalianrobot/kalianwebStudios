import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, getDocsFromServer, doc, setDoc, getDoc, updateDoc, query, orderBy, DocumentData, deleteDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Shield, UserCog, Trash2, UserCheck } from 'lucide-react';

const AdminStaff = () => {
  const [staff, setStaff] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [doorPass, setDoorPass] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const fetchStaff = async () => {
    setLoading(true);
    setMsg('');
    try {
      const snap = await getDocs(collection(db, "users"));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (a.role || '').localeCompare(b.role || ''));
      setStaff(data);

      const configSnap = await getDoc(doc(db, "configuracion", "seguridad"));
      if (configSnap.exists()) {
        setDoorPass(configSnap.data().clave_puerta || '');
      }
    } catch (err: any) {
      console.error("AdminStaff: Error en fetchStaff:", err);
      setMsg("❌ Error de carga: " + (err.message || "Permiso denegado"));
    }
    setLoading(false);
  };

  const handleSaveDoorPass = async () => {
    if (!doorPass) return;
    setSavingPass(true);
    try {
      await setDoc(doc(db, "configuracion", "seguridad"), {
        clave_puerta: doorPass
      }, { merge: true });
      setMsg("✅ Clave de puerta actualizada");
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al guardar la clave");
    }
    setSavingPass(false);
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!window.confirm(`¿Seguro que quieres cambiar el rol a ${newRole.toUpperCase()}?`)) return;
    try {
      await updateDoc(doc(db, "users", userId), {
        role: newRole
      });
      setMsg(`✅ Rol actualizado a ${newRole}`);
      fetchStaff();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar rol");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar este acceso de staff? El usuario seguirá existiendo como socio si tiene ficha, pero perderá sus permisos especiales.")) return;
    try {
      await deleteDoc(doc(db, "users", userId));
      setMsg("✅ Permisos eliminados");
      fetchStaff();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar");
    }
  };

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <Link to="/staff" className="text-kalian-gold/40 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">← Volver al Panel</Link>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight">GESTIÓN <span className="text-kalian-cream">STAFF</span></h1>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-kalian-gold/40 mt-2">Administración de Permisos y Roles</p>
          </div>
          <button onClick={fetchStaff} className="p-4 bg-kalian-gold/10 text-kalian-gold rounded-2xl border border-kalian-gold/20 hover:bg-kalian-gold/20 transition-all">🔄 Refrescar</button>
        </header>

        {msg && <div className="bg-kalian-gold text-black p-5 rounded-3xl mb-12 kalian-poster-text text-xl text-center shadow-2xl animate-bounce">{msg}</div>}

        <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] overflow-hidden shadow-2xl mb-12">
          <div className="p-8 border-b border-kalian-gold/10 bg-black/20">
            <h2 className="text-2xl kalian-poster-text text-kalian-gold uppercase">Acceso Rápido Puerta (/puerta)</h2>
            <p className="text-[9px] font-bold text-kalian-cream/40 uppercase tracking-widest mt-1">Configura la clave compartida para el staff de puerta</p>
          </div>
          <div className="p-8 flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-1 space-y-2">
              <p className="text-[9px] font-black text-kalian-gold/60 uppercase tracking-[0.3em] ml-4">Clave Maestra de Puerta</p>
              <input 
                type="text" 
                value={doorPass}
                onChange={(e) => setDoorPass(e.target.value)}
                placeholder="Ej: KALIAN2024"
                className="w-full p-5 bg-white/5 rounded-2xl border border-white/10 text-kalian-gold font-black tracking-widest outline-none focus:border-kalian-gold transition-all"
              />
            </div>
            <button 
              onClick={handleSaveDoorPass}
              disabled={savingPass}
              className="bg-kalian-gold text-black px-10 py-5 rounded-2xl kalian-poster-text text-xl hover:bg-white transition-all shadow-xl shadow-kalian-gold/20 disabled:opacity-50"
            >
              {savingPass ? 'GUARDANDO...' : 'GUARDAR CLAVE'}
            </button>
          </div>
        </div>

        <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] overflow-hidden shadow-2xl">
          <div className="p-8 border-b border-kalian-gold/10 bg-black/20">
            <div className="grid grid-cols-12 gap-4 text-[10px] font-black uppercase tracking-widest text-kalian-gold/60">
              <div className="col-span-5">Usuario / Email</div>
              <div className="col-span-3 text-center">Rol Actual</div>
              <div className="col-span-4 text-right">Acciones de Permisos</div>
            </div>
          </div>

          <div className="divide-y divide-kalian-gold/5">
            {loading ? (
              <div className="p-20 text-center kalian-poster-text text-3xl text-kalian-gold/20 animate-pulse">Cargando equipo...</div>
            ) : staff.length === 0 ? (
              <div className="p-20 text-center kalian-poster-text text-3xl text-kalian-gold/20">No hay staff registrado</div>
            ) : staff.map(u => (
              <div key={u.id} className="p-8 grid grid-cols-12 gap-4 items-center group hover:bg-white/5 transition-all">
                <div className="col-span-5">
                  <p className="text-xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors">{u.nombre || 'Sin nombre'}</p>
                  <p className="text-[10px] font-bold text-kalian-cream/40 uppercase tracking-widest mt-1">{u.email}</p>
                </div>
                
                <div className="col-span-3 flex justify-center">
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                    u.role === 'admin' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                    u.role === 'teacher' ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' :
                    'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  }`}>
                    {u.role}
                  </span>
                </div>

                <div className="col-span-4 flex justify-end gap-2">
                  <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
                    <button 
                      onClick={() => handleUpdateRole(u.id, 'admin')}
                      title="Hacer Admin"
                      className={`p-2 rounded-lg transition-all ${u.role === 'admin' ? 'bg-red-500 text-white shadow-lg' : 'text-white/20 hover:text-red-500'}`}
                    >
                      <Shield size={18} />
                    </button>
                    <button 
                      onClick={() => handleUpdateRole(u.id, 'teacher')}
                      title="Hacer Profesor"
                      className={`p-2 rounded-lg transition-all ${u.role === 'teacher' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/20 hover:text-indigo-500'}`}
                    >
                      <UserCog size={18} />
                    </button>
                    <button 
                      onClick={() => handleUpdateRole(u.id, 'portero')}
                      title="Hacer Portero"
                      className={`p-2 rounded-lg transition-all ${u.role === 'portero' ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/20 hover:text-emerald-500'}`}
                    >
                      <UserCheck size={18} />
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => handleDeleteUser(u.id)}
                    className="p-3 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 bg-kalian-gold/5 border border-kalian-gold/10 p-8 rounded-[2.5rem]">
          <h3 className="text-xl kalian-poster-text text-kalian-gold mb-4 uppercase">¿Cómo añadir a alguien nuevo?</h3>
          <p className="text-sm text-kalian-cream/60 leading-relaxed">
            Para que alguien aparezca en esta lista, primero debe haber iniciado sesión al menos una vez en el panel de staff (<span className="text-kalian-gold">/staff/login</span>). 
            Una vez que el sistema detecte su UID, aparecerá aquí y podrás asignarle el rol de <span className="text-emerald-500 font-bold">Portero</span>, <span className="text-indigo-500 font-bold">Profesor</span> o <span className="text-red-500 font-bold">Administrador</span>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminStaff;
