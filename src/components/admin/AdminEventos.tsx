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
    <div className="min-h-screen bg-kalian-dark p-6 font-sans text-kalian-cream">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12">
          <Link to="/admin" className="text-kalian-gold font-black text-[10px] uppercase tracking-[0.4em] hover:text-white transition-colors">← VOLVER AL PANEL</Link>
          <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight uppercase italic leading-none">CARTELERA <span className="text-kalian-cream">EVENTOS</span></h1>
        </header>

        {msg && <div className="bg-kalian-gold text-black p-6 rounded-2xl mb-10 font-black kalian-poster-text text-2xl text-center animate-bounce uppercase tracking-widest shadow-2xl shadow-kalian-gold/20">{msg}</div>}

        <form onSubmit={crear} className="bg-black/40 p-10 rounded-[3rem] shadow-2xl space-y-6 mb-16 text-kalian-cream border border-kalian-gold/10">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Título del Evento</label>
            <input type="text" placeholder="EJ: CONCIERTO DE JAZZ" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold font-black uppercase text-xl" value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} required />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Fecha y Hora</label>
              <input type="datetime-local" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Precio Estándar (€)</label>
              <input type="number" placeholder="PRECIO (€)" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold font-black text-xl" value={form.precio_estandar} onChange={e => setForm({...form, precio_estandar: e.target.value})} required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Aforo Máximo</label>
              <input type="number" placeholder="AFORO MÁX" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.aforo_max} onChange={e => setForm({...form, aforo_max: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Categoría</label>
              <select className="w-full p-5 bg-kalian-gold/5 rounded-2xl font-black uppercase border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold" value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}>
                <option value="musica">🎸 Música</option>
                <option value="danza">💃 Danza</option>
              </select>
            </div>
          </div>

          <button className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20 active:scale-95 uppercase">Publicar Concierto / Evento</button>
        </form>

        <div className="space-y-4">
          <h2 className="text-2xl kalian-poster-text text-kalian-gold/40 uppercase mb-6 ml-4 tracking-widest">Eventos Programados</h2>
          {eventos.map(ev => (
            <div key={ev.id} className="bg-black/40 p-8 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm border border-kalian-gold/10 group hover:border-kalian-gold/40 transition-all">
              <div className="text-center md:text-left">
                <h3 className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors uppercase italic">{ev.titulo}</h3>
                <p className="text-[10px] text-kalian-gold/40 font-black uppercase tracking-[0.3em] mt-2">
                  {new Date(ev.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} | {ev.categoria.toUpperCase()} | {ev.precio_estandar}€ | AFORO: {ev.aforo_actual || 0}/{ev.aforo_max}
                </p>
              </div>
              <button 
                onClick={async () => { 
                  await deleteDoc(doc(db, "eventos", ev.id)); 
                  fetchEventos(); 
                }} 
                className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
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
