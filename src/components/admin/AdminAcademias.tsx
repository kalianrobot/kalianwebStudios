import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, DocumentData, updateDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Link } from 'react-router-dom';

const AdminAcademias = () => {
  const [academias, setAcademias] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const seedDefaultAcademias = async () => {
    setSubiendo(true);
    setMsg("⏳ Inicializando academias...");
    try {
      const defaults = [
        {
          id: 'musica',
          nombre: 'Music is Cool',
          imageUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=2070&auto=format&fit=crop',
          orden: 1,
          activo: true,
          storagePath: '',
          subcategorias: ['Instrumento', 'Combo', 'Armonía moderna', 'Big Band', 'Master classes']
        },
        {
          id: 'danza',
          nombre: 'Club de Baile',
          imageUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=2069&auto=format&fit=crop',
          orden: 2,
          activo: true,
          storagePath: '',
          subcategorias: ['Bachata', 'Bachata coreográfico', 'Salsa']
        }
      ];

      for (const aca of defaults) {
        const { id, ...data } = aca;
        await setDoc(doc(db, "academias", id), data);
      }
      setMsg("✅ Academias por defecto creadas");
      fetchAcademias();
    } catch (err) {
      console.error(err);
      alert("Error al crear academias por defecto");
    } finally {
      setSubiendo(false);
    }
  };

  const [form, setForm] = useState<any>({
    nombre: '',
    nombre_eu: '',
    orden: 0,
    activo: true,
    imageUrl: '',
    storagePath: '',
    subcategorias: []
  });
  const [archivo, setArchivo] = useState<File | null>(null);

  const fetchAcademias = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "academias"), orderBy("orden", "asc"));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      
      // MIGRACIÓN: Si detectamos 'lema' y no hay subcategorías, migramos
      let huboMigracion = false;
      for (const aca of list) {
        if (aca.lema && (!aca.subcategorias || aca.subcategorias.length === 0)) {
          console.log(`Migrando lema de ${aca.nombre}...`);
          const nuevasSub = aca.lema.split('•').map((s: string) => s.trim()).filter((s: string) => s !== '');
          await updateDoc(doc(db, "academias", aca.id), {
            subcategorias: nuevasSub,
            lema: deleteField() // Borramos el campo lema
          });
          huboMigracion = true;
        } else if (aca.lema) {
          // Si tiene lema pero ya tiene subcategorías, simplemente borramos el lema
          await updateDoc(doc(db, "academias", aca.id), {
            lema: deleteField()
          });
          huboMigracion = true;
        }
      }
      
      if (huboMigracion) {
        fetchAcademias(); // Recargamos si hubo cambios
        return;
      }

      setAcademias(list);
    } catch (err) {
      console.error("Error fetching academias:", err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAcademias(); }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubiendo(true);
    try {
      let finalImageUrl = form.imageUrl;
      let finalStoragePath = form.storagePath;

      if (archivo) {
        // Si estamos editando y había una imagen previa, podríamos borrarla, 
        // pero para simplificar y evitar errores si se comparte el path, solo subimos la nueva.
        const fileName = `${Date.now()}_${archivo.name}`;
        const storageRef = ref(storage, `academias/${fileName}`);
        await uploadBytes(storageRef, archivo);
        finalImageUrl = await getDownloadURL(storageRef);
        finalStoragePath = storageRef.fullPath;
      }

      const academiaData = {
        ...form,
        imageUrl: finalImageUrl,
        storagePath: finalStoragePath,
        orden: Number(form.orden)
      };

      if (editando) {
        await updateDoc(doc(db, "academias", editando), academiaData);
        setMsg("✅ Academia actualizada con éxito");
      } else {
        const customId = form.nombre.toLowerCase().trim().replace(/\s+/g, '-');
        // Ensure subcategorias is initialized as empty array for new academies
        const newData = { ...academiaData, subcategorias: academiaData.subcategorias || [] };
        await setDoc(doc(db, "academias", customId), newData);
        setMsg("✅ Academia creada con éxito");
      }

      setForm({ nombre: '', nombre_eu: '', orden: 0, activo: true, imageUrl: '', storagePath: '', subcategorias: [] });
      setArchivo(null);
      setEditando(null);
      fetchAcademias();
      setTimeout(() => setMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      setMsg("❌ Error al guardar: " + err.message);
      setTimeout(() => setMsg(''), 5000);
    } finally {
      setSubiendo(false);
    }
  };

  const borrar = async (academia: any) => {
    try {
      setMsg(`⏳ Eliminando ${academia.nombre}...`);
      if (academia.storagePath) {
        const storageRef = ref(storage, academia.storagePath);
        await deleteObject(storageRef).catch(e => console.warn("Error borrando imagen de storage:", e));
      }
      await deleteDoc(doc(db, "academias", academia.id));
      setMsg("❌ Academia eliminada");
      fetchAcademias();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setMsg("❌ Error al borrar");
      setTimeout(() => setMsg(''), 5000);
    }
  };

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <Link to="/staff" className="text-kalian-gold/40 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">← Volver al Panel</Link>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight uppercase italic">GESTIÓN <span className="text-kalian-cream">ACADEMIAS</span></h1>
          </div>
          {academias.length === 0 && !loading && (
            <button 
              onClick={seedDefaultAcademias}
              className="bg-kalian-gold/10 text-kalian-gold border border-kalian-gold/20 px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-kalian-gold hover:text-black transition-all"
            >
              ✨ Inicializar Academias por Defecto
            </button>
          )}
        </header>

        {msg && <div className="bg-kalian-gold text-black p-5 rounded-3xl mb-12 kalian-poster-text text-xl text-center shadow-2xl animate-bounce">{msg}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* FORMULARIO */}
          <div className="lg:col-span-1">
            <form onSubmit={guardar} className="bg-black/40 p-8 rounded-[2.5rem] border border-kalian-gold/10 space-y-6 sticky top-8">
              <h2 className="text-2xl kalian-poster-text text-kalian-gold uppercase italic">{editando ? 'Editar Academia' : 'Nueva Academia'}</h2>
              
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-kalian-gold/90 ml-4 tracking-widest">Nombre</label>
                <input type="text" placeholder="EJ: MUSIC IS COOL" className="w-full p-4 bg-kalian-gold/10 rounded-xl outline-none border border-kalian-gold/20 focus:border-kalian-gold transition-all text-kalian-cream font-bold placeholder:text-kalian-cream/50" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required />
                <input type="text" placeholder="Izena (Euskera — opcional)" className="w-full p-3 bg-kalian-gold/5 rounded-xl outline-none border border-kalian-gold/5 focus:border-kalian-gold/40 transition-all text-kalian-gold/60 font-bold text-sm placeholder:text-kalian-cream/30" value={form.nombre_eu} onChange={e => setForm({...form, nombre_eu: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-kalian-gold/90 ml-4 tracking-widest">Orden</label>
                  <input type="number" className="w-full p-4 bg-kalian-gold/10 rounded-xl outline-none border border-kalian-gold/20 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.orden} onChange={e => setForm({...form, orden: Number(e.target.value)})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-kalian-gold/90 ml-4 tracking-widest">Estado</label>
                  <button 
                    type="button"
                    onClick={() => setForm({...form, activo: !form.activo})}
                    className={`w-full p-4 rounded-xl font-black uppercase tracking-widest transition-all text-xs ${form.activo ? 'bg-emerald-500 text-black' : 'bg-red-500/20 text-red-500 border border-red-500/20'}`}
                  >
                    {form.activo ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-kalian-gold/90 ml-4 tracking-widest">Imagen (Fondo)</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                  className="w-full p-4 bg-kalian-gold/10 rounded-xl border border-kalian-gold/20 text-[10px] font-bold text-kalian-cream"
                />
                {form.imageUrl && !archivo && (
                  <div className="mt-2 w-full h-20 rounded-xl overflow-hidden border border-kalian-gold/20">
                    <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* GESTIÓN DE SUBCATEGORÍAS */}
              <div className="space-y-4 pt-4 border-t border-kalian-gold/10">
                <label className="text-[9px] font-black uppercase text-kalian-gold/90 ml-4 tracking-widest">Subcategorías / Especialidades</label>
                <div className="flex flex-wrap gap-2">
                  {form.subcategorias.map((sub: string, index: number) => (
                    <div key={index} className="flex items-center gap-2 bg-kalian-gold/10 text-kalian-gold px-3 py-1.5 rounded-lg border border-kalian-gold/20 text-[10px] font-bold uppercase">
                      {sub}
                      <button 
                        type="button"
                        onClick={() => {
                          const newSubs = form.subcategorias.filter((_: any, i: number) => i !== index);
                          setForm({...form, subcategorias: newSubs});
                        }}
                        className="hover:text-white transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    id="new-sub-input"
                    placeholder="Nueva subcategoría..." 
                    className="flex-1 p-3 bg-kalian-gold/5 rounded-xl outline-none border border-kalian-gold/10 focus:border-kalian-gold/40 transition-all text-[10px] font-bold text-kalian-cream"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !form.subcategorias.includes(val)) {
                          setForm({...form, subcategorias: [...form.subcategorias, val]});
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('new-sub-input') as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && !form.subcategorias.includes(val)) {
                        setForm({...form, subcategorias: [...form.subcategorias, val]});
                        input.value = '';
                      }
                    }}
                    className="bg-kalian-gold/20 text-kalian-gold px-4 rounded-xl font-black text-xs hover:bg-kalian-gold hover:text-black transition-all"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button 
                  disabled={subiendo}
                  className="flex-1 bg-kalian-gold text-black p-4 rounded-xl kalian-poster-text text-lg tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20 disabled:opacity-50"
                >
                  {subiendo ? 'GUARDANDO...' : (editando ? 'ACTUALIZAR' : 'CREAR')}
                </button>
                {editando && (
                  <button 
                    type="button"
                    onClick={() => {
                      setEditando(null);
                      setForm({ nombre: '', nombre_eu: '', orden: 0, activo: true, imageUrl: '', storagePath: '', subcategorias: [] });
                      setArchivo(null);
                    }}
                    className="bg-white/10 text-white px-4 rounded-xl font-black uppercase text-[10px]"
                  >X</button>
                )}
              </div>
            </form>
          </div>

          {/* LISTADO */}
          <div className="lg:col-span-2 space-y-6">
            {loading ? (
              <div className="text-center py-20 kalian-poster-text text-3xl text-kalian-gold/20 animate-pulse">CARGANDO ACADEMIAS...</div>
            ) : (
              <div className="grid gap-6">
                {academias.length === 0 && <div className="text-center py-20 bg-black/20 rounded-[3rem] border border-kalian-gold/10 border-dashed text-kalian-gold/20 kalian-poster-text text-2xl uppercase italic">No hay academias configuradas</div>}
                {academias.map(aca => (
                  <div key={aca.id} className="bg-black/40 p-6 rounded-[2.5rem] flex items-center justify-between gap-6 border border-kalian-gold/10 group hover:border-kalian-gold/40 transition-all duration-500 overflow-hidden relative">
                    <div className="flex items-center gap-6 relative z-10">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border border-kalian-gold/20 flex-shrink-0 bg-kalian-dark">
                        <img src={aca.imageUrl} alt={aca.nombre} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-[10px] font-black bg-kalian-gold/10 text-kalian-gold px-2 py-0.5 rounded-md">ORDEN {aca.orden}</span>
                          {!aca.activo && <span className="text-[10px] font-black bg-red-500/10 text-red-500 px-2 py-0.5 rounded-md uppercase">Inactivo</span>}
                        </div>
                        <h3 className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors uppercase italic leading-none">{aca.nombre}</h3>
                        <p className="text-[10px] text-kalian-gold/40 font-black uppercase tracking-[0.2em] mt-2">
                          {aca.subcategorias?.join(' • ') || 'Sin especialidades'}
                        </p>
                        {aca.subcategorias && aca.subcategorias.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {aca.subcategorias.map((sub: string) => (
                              <span key={sub} className="text-[8px] bg-kalian-gold/5 text-kalian-gold/60 px-2 py-0.5 rounded border border-kalian-gold/10 uppercase font-bold">{sub}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 relative z-10">
                      <button 
                        onClick={() => {
                          setEditando(aca.id);
                          setForm({
                            nombre: aca.nombre,
                            nombre_eu: aca.nombre_eu || '',
                            orden: aca.orden,
                            activo: aca.activo,
                            imageUrl: aca.imageUrl,
                            storagePath: aca.storagePath,
                            subcategorias: aca.subcategorias || []
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="bg-kalian-gold/10 text-kalian-gold hover:bg-kalian-gold hover:text-black p-4 rounded-xl transition-all"
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => borrar(aca)}
                        className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white p-4 rounded-xl transition-all"
                      >
                        🗑️
                      </button>
                    </div>
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-kalian-gold/5 to-transparent pointer-events-none"></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAcademias;
