import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, DocumentData, updateDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminExposiciones = () => {
  const { user } = useAuth();
  const [exposiciones, setExposiciones] = useState<DocumentData[]>([]);
  const [form, setForm] = useState({ 
    titulo: '', 
    autor: '', 
    descripcion: '',
    imagenUrl: '',
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: '',
    es_activa: true
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const fetchExposiciones = async () => {
    try {
      const snap = await getDocs(query(collection(db, "exposiciones"), orderBy("fechaInicio", "desc")));
      setExposiciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { 
    if (!user) return;
    const q = query(collection(db, "exposiciones"), orderBy("fechaInicio", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setExposiciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("AdminExposiciones: Error en onSnapshot:", err.message);
    });
    return () => unsub();
  }, [user]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubiendo(true);
    try {
      let finalImagenUrl = form.imagenUrl;

      if (archivo) {
        const storageRef = ref(storage, `exposiciones/${Date.now()}_${archivo.name}`);
        await uploadBytes(storageRef, archivo);
        finalImagenUrl = await getDownloadURL(storageRef);
      }

      const expoData = { 
        ...form, 
        imagenUrl: finalImagenUrl,
      };

      if (editando) {
        await updateDoc(doc(db, "exposiciones", editando), expoData);
        setMsg("✅ Exposición actualizada");
      } else {
        const newRef = doc(collection(db, "exposiciones"));
        await setDoc(newRef, expoData);
        setMsg("✅ Exposición creada");
      }

      setForm({ titulo: '', autor: '', descripcion: '', imagenUrl: '', fechaInicio: new Date().toISOString().split('T')[0], fechaFin: '', es_activa: true });
      setArchivo(null);
      setEditando(null);
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al guardar");
    }
    setSubiendo(false);
  };

  const eliminar = async (id: string) => {
    if (!window.confirm("¿Seguro?")) return;
    await deleteDoc(doc(db, "exposiciones", id));
  };

  const editar = (expo: any) => {
    setEditando(expo.id);
    setForm({
      titulo: expo.titulo || '',
      autor: expo.autor || '',
      descripcion: expo.descripcion || '',
      imagenUrl: expo.imagenUrl || '',
      fechaInicio: expo.fechaInicio || '',
      fechaFin: expo.fechaFin || '',
      es_activa: expo.es_activa !== false
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-kalian-dark text-kalian-cream p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-5xl kalian-poster-text text-kalian-gold italic uppercase tracking-tighter">Gestión Galería</h1>
          <Link to="/staff" className="text-xs font-black uppercase tracking-widest text-kalian-gold/40 hover:text-kalian-gold transition-colors">← Volver</Link>
        </div>

        {msg && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-4 rounded-xl mb-8 text-center font-black uppercase text-xs tracking-widest">{msg}</div>}

        <div className="grid lg:grid-cols-2 gap-12">
          {/* FORMULARIO */}
          <div className="bg-black/40 p-10 rounded-[3rem] border border-kalian-gold/10 h-fit sticky top-24">
            <h2 className="text-2xl kalian-poster-text text-kalian-gold mb-8 italic uppercase">{editando ? 'Editar Exposición' : 'Nueva Exposición'}</h2>
            <form onSubmit={guardar} className="space-y-6">
              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Título de la Exposición</p>
                <input 
                  type="text" placeholder="Título" 
                  className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold text-kalian-cream"
                  value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} required 
                />
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Nombre del Autor</p>
                <input 
                  type="text" placeholder="Autor" 
                  className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold text-kalian-cream"
                  value={form.autor} onChange={e => setForm({...form, autor: e.target.value})} required 
                />
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Descripción / Obra</p>
                <textarea 
                  placeholder="Descripción detallada..." 
                  className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold text-kalian-cream h-32"
                  value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} required 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Fecha Inicio</p>
                  <input 
                    type="date" 
                    className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold text-kalian-gold"
                    value={form.fechaInicio} onChange={e => setForm({...form, fechaInicio: e.target.value})} required 
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Fecha Fin</p>
                  <input 
                    type="date" 
                    className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold text-kalian-gold"
                    value={form.fechaFin} onChange={e => setForm({...form, fechaFin: e.target.value})} required 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Estado Manual (Opcional)</p>
                <select 
                  className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold text-kalian-gold"
                  value={form.es_activa ? 'true' : 'false'} onChange={e => setForm({...form, es_activa: e.target.value === 'true'})}
                >
                  <option value="true">ACTIVA</option>
                  <option value="false">PASADA</option>
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Cartel / Imagen</p>
                <input 
                  type="file" 
                  className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold text-xs text-kalian-gold/60"
                  onChange={e => setArchivo(e.target.files?.[0] || null)} 
                />
                {form.imagenUrl && <p className="text-[8px] text-emerald-500 font-black uppercase tracking-widest ml-4">✓ Imagen cargada</p>}
              </div>

              <button 
                disabled={subiendo}
                className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20 disabled:opacity-50"
              >
                {subiendo ? 'SUBIENDO...' : (editando ? 'ACTUALIZAR EXPOSICIÓN' : 'PUBLICAR EXPOSICIÓN')}
              </button>
              {editando && (
                <button 
                  type="button" onClick={() => { setEditando(null); setForm({ titulo: '', autor: '', descripcion: '', imagenUrl: '', fechaInicio: new Date().toISOString().split('T')[0], fechaFin: '', es_activa: true }); }}
                  className="w-full bg-transparent text-kalian-gold/40 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:text-kalian-gold transition-all"
                >
                  Cancelar Edición
                </button>
              )}
            </form>
          </div>

          {/* LISTADO */}
          <div className="space-y-6">
            <h2 className="text-2xl kalian-poster-text text-kalian-gold mb-8 italic uppercase">Exposiciones Registradas</h2>
            {exposiciones.map(expo => (
              <div key={expo.id} className="bg-black/20 rounded-[2.5rem] border border-kalian-gold/5 overflow-hidden flex gap-6 p-6 group hover:border-kalian-gold/20 transition-all">
                <div className="w-32 h-44 flex-shrink-0 rounded-2xl overflow-hidden bg-kalian-gold/5 border border-kalian-gold/10">
                  {expo.imagenUrl ? (
                    <img src={expo.imagenUrl} alt={expo.titulo} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl kalian-poster-text text-kalian-gold/10">?</div>
                  )}
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-[8px] font-black px-3 py-1 rounded-full border uppercase tracking-widest ${expo.es_activa ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-kalian-gold/5 border-kalian-gold/10 text-kalian-gold/40'}`}>
                        {expo.es_activa ? 'ACTIVA' : 'PASADA'}
                      </span>
                      <span className="text-[10px] font-mono text-kalian-gold/40">{expo.fechaInicio} al {expo.fechaFin}</span>
                    </div>
                    <h3 className="text-2xl kalian-poster-text text-kalian-gold uppercase italic leading-tight mb-1">{expo.titulo}</h3>
                    <p className="text-[10px] font-black text-kalian-cream/60 uppercase tracking-widest mb-4">Autor: {expo.autor}</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => editar(expo)} className="flex-1 bg-kalian-gold/10 text-kalian-gold p-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-kalian-gold hover:text-black transition-all">Editar</button>
                    <button onClick={() => eliminar(expo.id)} className="bg-red-500/10 text-red-500 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminExposiciones;
