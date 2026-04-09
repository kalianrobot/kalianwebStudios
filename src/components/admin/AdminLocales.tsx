import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, updateDoc, doc, DocumentData, setDoc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

const AdminLocales = () => {
  const [locales, setLocales] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<any | null>(null);
  const [msg, setMsg] = useState('');

  const fetchLocales = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "locales"));
      if (snap.empty) {
        const initial = [
          { id: 'L1', nombre: 'Local 1', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L2', nombre: 'Local 2', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L3', nombre: 'Local 3', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L4', nombre: 'Local 4', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L5', nombre: 'Local 5', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L6', nombre: 'Local 6', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L7', nombre: 'Local 7', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
        ];
        for (const loc of initial) {
          const { id, ...data } = loc;
          await setDoc(doc(db, "locales", id), data);
        }
        setLocales(initial);
      } else {
        setLocales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchLocales(); }, []);

  const toggleEstado = async (id: string, actual: string) => {
    const nuevo = actual === 'disponible' ? 'mantenimiento' : 'disponible';
    try {
      await updateDoc(doc(db, "locales", id), { estado: nuevo });
      fetchLocales();
    } catch (err) { console.error(err); }
  };

  const guardarLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;

    try {
      // 1. Actualizar Local
      await updateDoc(doc(db, "locales", editando.id), {
        alquilado: editando.alquilado,
        nombreGrupo: editando.nombreGrupo || '',
        actividadArtistica: editando.actividadArtistica || '',
        fechaExpiracion: editando.fechaExpiracion || '',
        inquilinos: editando.inquilinos || []
      });

      // 2. Sincronizar Inquilinos como Socios
      if (editando.alquilado && editando.inquilinos) {
        for (const inq of editando.inquilinos) {
          if (!inq.dni) continue;
          const dniUpper = inq.dni.toUpperCase();
          const socioRef = doc(db, "socios", dniUpper);
          const socioSnap = await getDoc(socioRef);

          const socioData = {
            dni: dniUpper,
            nombre: inq.nombre || '',
            direccion: inq.direccion || '',
            email: inq.email || '',
            cuentaBancaria: inq.cuentaBancaria || '',
            verificado: true,
            localId: editando.id, // Guardamos el ID del local para el perfil
            [`membresias.local`]: editando.fechaExpiracion || '',
            estado: 'activo' // Al asignar local, se activa
          };

          if (!socioSnap.exists()) {
            await setDoc(socioRef, { ...socioData, uid: 'local-' + Math.random().toString(36).substring(7) });
          } else {
            await updateDoc(socioRef, socioData);
          }
        }
      }

      setMsg("✅ Local actualizado y soci@s sincronizados");
      setTimeout(() => setMsg(''), 3000);
      setEditando(null);
      fetchLocales();
    } catch (err) {
      console.error(err);
      alert("Error al guardar");
    }
  };

  const addInquilino = () => {
    const nuevo = { nombre: '', dni: '', direccion: '', email: '', cuentaBancaria: '' };
    setEditando({ ...editando, inquilinos: [...(editando.inquilinos || []), nuevo] });
  };

  const removeInquilino = (index: number) => {
    const list = [...editando.inquilinos];
    list.splice(index, 1);
    setEditando({ ...editando, inquilinos: list });
  };

  const updateInquilino = (index: number, field: string, value: string) => {
    const list = [...editando.inquilinos];
    list[index] = { ...list[index], [field]: value };
    setEditando({ ...editando, inquilinos: list });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <Link to="/staff" className="text-indigo-600 font-bold text-xs uppercase tracking-widest">← Volver</Link>
            <h1 className="text-3xl font-black italic uppercase text-slate-900 mt-2">Gestión de Locales</h1>
          </div>
          {msg && <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold animate-bounce shadow-lg">{msg}</div>}
        </header>

        {loading ? (
          <div className="text-center py-20 font-bold text-slate-400 uppercase tracking-widest animate-pulse">Cargando Locales...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {locales.map(l => (
              <div key={l.id} className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 flex flex-col justify-between group hover:border-indigo-200 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-black uppercase italic">{l.nombre}</h2>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${l.estado === 'disponible' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                      {l.estado}
                    </span>
                  </div>
                  
                  <div className="flex gap-4 mb-6">
                    <div className="flex-1 bg-slate-50 p-3 rounded-2xl text-center">
                      <p className="text-[8px] font-black uppercase text-slate-400">Soci@s</p>
                      <p className="font-black text-lg">{l.inquilinos?.length || 0}</p>
                    </div>
                    <div className={`flex-1 p-3 rounded-2xl text-center ${l.alquilado ? 'bg-red-50' : 'bg-emerald-50'}`}>
                      <p className="text-[8px] font-black uppercase text-slate-400">Estado</p>
                      <p className={`font-black text-lg ${l.alquilado ? 'text-red-600' : 'text-emerald-600'}`}>{l.alquilado ? 'ALQUILADO' : 'LIBRE'}</p>
                    </div>
                  </div>

                  {l.alquilado && (
                    <div className="mb-6 space-y-2">
                      <p className="text-[10px] font-black uppercase text-indigo-600 tracking-tighter">Grupo: <span className="text-slate-900">{l.nombreGrupo}</span></p>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">Actividad: <span className="text-slate-900">{l.actividadArtistica}</span></p>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">Expira: <span className="text-slate-900">{l.fechaExpiracion === '2099-12-31' ? 'INDEFINIDA' : l.fechaExpiracion}</span></p>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <button 
                    onClick={() => setEditando(l)}
                    className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-600 transition-all shadow-md"
                  >
                    Editar Alquiler / Soci@s
                  </button>
                  <button 
                    onClick={() => toggleEstado(l.id, l.estado)}
                    className="w-full p-4 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-slate-900 transition-all"
                  >
                    {l.estado === 'disponible' ? 'Poner en Mantenimiento' : 'Habilitar Local'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL DE EDICIÓN */}
        {editando && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 z-50 overflow-y-auto">
            <div className="bg-white w-full max-w-4xl rounded-[3.5rem] shadow-2xl overflow-hidden my-auto">
              <form onSubmit={guardarLocal} className="p-10 space-y-8">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-black uppercase italic">Editar <span className="text-indigo-600">{editando.nombre}</span></h2>
                  <button type="button" onClick={() => setEditando(null)} className="text-slate-300 hover:text-slate-900 text-2xl">✕</button>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl">
                      <span className="font-black uppercase text-xs">Estado de Alquiler</span>
                      <button 
                        type="button"
                        onClick={() => setEditando({...editando, alquilado: !editando.alquilado})}
                        className={`px-6 py-2 rounded-xl font-black uppercase text-[10px] transition-all ${editando.alquilado ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-500'}`}
                      >
                        {editando.alquilado ? 'Alquilado' : 'Libre'}
                      </button>
                    </div>

                    {editando.alquilado && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Nombre del Grupo</label>
                          <input type="text" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 font-bold" value={editando.nombreGrupo || ''} onChange={e => setEditando({...editando, nombreGrupo: e.target.value})} required />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Actividad Artística</label>
                          <input type="text" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 font-bold" value={editando.actividadArtistica || ''} onChange={e => setEditando({...editando, actividadArtistica: e.target.value})} required />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Fecha Expiración Alquiler</label>
                          <div className="flex gap-2">
                            <input type="date" className="flex-1 p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 font-bold" value={editando.fechaExpiracion || ''} onChange={e => setEditando({...editando, fechaExpiracion: e.target.value})} required />
                            <button 
                              type="button"
                              onClick={() => setEditando({...editando, fechaExpiracion: '2099-12-31'})}
                              className="bg-slate-900 text-white px-4 rounded-2xl font-black uppercase text-[9px]"
                            >Indefinida</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-black uppercase text-xs text-slate-400">Inquilinos / Soci@s de Local</h3>
                      {editando.alquilado && (
                        <button type="button" onClick={addInquilino} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black uppercase text-[9px] hover:bg-indigo-700">+ Añadir</button>
                      )}
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {editando.inquilinos?.map((inq: any, idx: number) => (
                        <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-3 relative group">
                          <button type="button" onClick={() => removeInquilino(idx)} className="absolute top-4 right-4 text-red-300 hover:text-red-500 text-lg opacity-0 group-hover:opacity-100 transition-all">✕</button>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <input type="text" placeholder="DNI" className="p-3 bg-white rounded-xl text-[10px] font-black uppercase outline-none border border-slate-100" value={inq.dni} onChange={e => updateInquilino(idx, 'dni', e.target.value)} required />
                            <input type="text" placeholder="NOMBRE COMPLETO" className="p-3 bg-white rounded-xl text-[10px] font-bold outline-none border border-slate-100" value={inq.nombre} onChange={e => updateInquilino(idx, 'nombre', e.target.value)} required />
                          </div>
                          <input type="text" placeholder="DIRECCIÓN" className="w-full p-3 bg-white rounded-xl text-[10px] font-bold outline-none border border-slate-100" value={inq.direccion} onChange={e => updateInquilino(idx, 'direccion', e.target.value)} />
                          <input type="email" placeholder="EMAIL" className="w-full p-3 bg-white rounded-xl text-[10px] font-bold outline-none border border-slate-100" value={inq.email} onChange={e => updateInquilino(idx, 'email', e.target.value)} />
                          <input type="text" placeholder="CUENTA BANCARIA (IBAN)" className="w-full p-3 bg-white rounded-xl text-[10px] font-mono outline-none border border-slate-100" value={inq.cuentaBancaria} onChange={e => updateInquilino(idx, 'cuentaBancaria', e.target.value)} />
                        </div>
                      ))}
                      {(!editando.inquilinos || editando.inquilinos.length === 0) && (
                        <p className="text-center py-10 text-slate-300 font-bold uppercase text-[10px] tracking-widest italic">No hay inquilinos registrados</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-6">
                  <button type="submit" className="flex-1 bg-slate-900 text-white p-6 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl hover:bg-indigo-600 transition-all">Guardar Cambios</button>
                  <button type="button" onClick={() => setEditando(null)} className="px-10 bg-slate-100 text-slate-400 rounded-[2rem] font-black uppercase tracking-widest hover:text-slate-900 transition-all">Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLocales;
