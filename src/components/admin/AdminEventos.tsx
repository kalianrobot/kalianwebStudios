import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, DocumentData } from 'firebase/firestore';
import { Link } from 'react-router-dom';

const AdminEventos = () => {
  const [eventos, setEventos] = useState<DocumentData[]>([]);
  const [form, setForm] = useState({ titulo: '', fecha: '', precio_estandar: '', categoria: 'musica', aforo_max: '50' });
  const [msg, setMsg] = useState('');

  const fetchEventos = async () => {
    try {
      const snap = await getDocs(query(collection(db, "eventos"), orderBy("fecha", "desc")));
      setEventos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchEventos(); }, []);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const slug = form.titulo.trim().replace(/\s+/g, '-').toUpperCase();
      const customId = `${form.fecha.substring(0,10)}-${slug}`;
      await setDoc(doc(db, "eventos", customId), { 
        ...form, 
        precio_estandar: Number(form.precio_estandar),
        aforo_max: Number(form.aforo_max),
        aforo_actual: 0
      });
      setMsg("✅ Evento publicado con éxito");
      setForm({ titulo: '', fecha: '', precio_estandar: '', categoria: 'musica', aforo_max: '50' });
      fetchEventos();
      setTimeout(() => setMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      alert("Error al publicar: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link to="/admin" className="text-indigo-600 font-bold text-xs uppercase tracking-widest">← Volver</Link>
          <h1 className="text-4xl font-black italic uppercase text-slate-900 mt-2">Cartelera Eventos</h1>
        </header>

        {msg && <div className="bg-emerald-500 text-white p-4 rounded-2xl mb-6 font-bold text-center animate-bounce">{msg}</div>}

        <form onSubmit={crear} className="bg-white p-10 rounded-[3rem] shadow-xl space-y-4 mb-10 text-slate-900 border border-slate-100">
          <input type="text" placeholder="Título del Evento" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} required />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Fecha y Hora</label>
              <input type="datetime-local" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Precio Estándar (€)</label>
              <input type="number" placeholder="Precio (€)" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.precio_estandar} onChange={e => setForm({...form, precio_estandar: e.target.value})} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Aforo Máximo</label>
              <input type="number" placeholder="Aforo Máx" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.aforo_max} onChange={e => setForm({...form, aforo_max: e.target.value})} required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Categoría</label>
              <select className="w-full p-4 bg-slate-50 rounded-2xl font-bold uppercase border border-slate-200 text-slate-900" value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}>
                <option value="musica">🎸 Música</option>
                <option value="danza">💃 Danza</option>
              </select>
            </div>
          </div>

          <button className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black uppercase hover:bg-indigo-600 transition-all shadow-lg active:scale-95">Publicar Concierto/Evento</button>
        </form>

        <div className="space-y-3">
          <h2 className="text-xl font-black uppercase italic mb-4 ml-4 text-slate-400">Eventos Programados</h2>
          {eventos.map(ev => (
            <div key={ev.id} className="bg-white p-6 rounded-3xl flex justify-between items-center shadow-sm border border-slate-100 group hover:border-indigo-200 transition-all">
              <div>
                <h3 className="font-black uppercase italic text-lg">{ev.titulo}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{ev.fecha} | {ev.categoria} | Aforo: {ev.aforo_actual || 0}/{ev.aforo_max}</p>
              </div>
              <button 
                onClick={async () => { 
                  // confirm() is blocked in iframes, using a simpler direct delete for now
                  await deleteDoc(doc(db, "eventos", ev.id)); 
                  fetchEventos(); 
                }} 
                className="text-red-300 hover:text-red-500 font-bold text-[10px] uppercase tracking-widest"
              >
                BORRAR
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminEventos;
