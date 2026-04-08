import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, doc, setDoc, getDoc, query, orderBy, DocumentData, deleteDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { createSocioAuth } from '../../lib/adminAuth';
import { sendWelcomeEmail } from '../../lib/brevoService';

const AdminSocios = () => {
  const [socios, setSocios] = useState<DocumentData[]>([]);
  const [cursosExistentes, setCursosExistentes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ dni: '', nombre: '', email: '' });
  const [msg, setMsg] = useState('');
  const hoy = new Date().toISOString().split('T')[0];

  const fetchSocios = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "socios"), orderBy("nombre", "asc")));
      setSocios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      // Fetch existing courses to filter UI
      const cursosSnap = await getDocs(collection(db, "cursos"));
      const ids = new Set(cursosSnap.docs.map(d => d.id));
      setCursosExistentes(ids);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSocios(); }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar este socio? Esta acción no se puede deshacer.")) return;
    try {
      await deleteDoc(doc(db, "socios", id));
      setMsg("✅ Socio eliminado");
      setTimeout(() => setMsg(''), 3000);
      fetchSocios();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.dni || !form.email) return;

    setLoading(true);
    try {
      const emailClean = form.email.trim().toLowerCase();
      const dniUpper = form.dni.toUpperCase();
      const socioRef = doc(db, "socios", dniUpper);
      const socioSnap = await getDoc(socioRef);

      if (socioSnap.exists()) {
        alert("Este DNI ya está registrado como socio.");
        setLoading(false);
        return;
      }

      // 1. Create in Firebase Auth and send activation link
      let realUid = "manual-" + Math.random().toString(36).substring(7);
      try {
        const authResult = await createSocioAuth(emailClean);
        if (authResult.uid) realUid = authResult.uid;
        
        // Send welcome email via Brevo
        await sendWelcomeEmail(emailClean, form.nombre || "Socio Kalian", "https://kalian.es/login");
      } catch (err) {
        console.error("Error creating auth user or sending email:", err);
      }

      // 2. Save to Firestore
      await setDoc(socioRef, {
        dni: dniUpper,
        nombre: form.nombre,
        email: emailClean,
        uid: realUid,
        expiraciones: {},
        cursos: [],
        verificado: true,
        fechaAlta: new Date().toISOString()
      });

      setMsg("✅ Socio creado y email enviado");
      setTimeout(() => setMsg(''), 3000);
      setForm({ dni: '', nombre: '', email: '' });
      setShowForm(false);
      fetchSocios();
    } catch (err) {
      console.error(err);
      alert("Error al crear socio");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <Link to="/staff" className="text-kalian-gold/40 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">← Volver al Panel</Link>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight">SOCI@S <span className="text-kalian-cream">KALIAN</span></h1>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setShowForm(!showForm)} 
              className="bg-kalian-gold text-black px-8 py-3 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/10"
            >
              {showForm ? 'CANCELAR' : '+ NUEVO SOCI@S'}
            </button>
            <button onClick={fetchSocios} className="p-3 bg-kalian-gold/10 text-kalian-gold rounded-2xl border border-kalian-gold/20 hover:bg-kalian-gold/20 transition-all">🔄</button>
          </div>
        </header>

        {msg && <div className="bg-kalian-gold text-black p-5 rounded-3xl mb-12 kalian-poster-text text-xl text-center shadow-2xl animate-bounce">{msg}</div>}

        {showForm && (
          <form onSubmit={handleCreate} className="bg-black/40 border border-kalian-gold/20 p-10 rounded-[3rem] mb-12 space-y-6 animate-in slide-in-from-top-4 duration-500">
            <h2 className="text-3xl kalian-poster-text text-kalian-gold mb-6">ALTA DE SOCI@S</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">DNI / NIE</p>
                <input 
                  type="text" placeholder="12345678X" 
                  className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold text-kalian-gold font-bold uppercase"
                  value={form.dni}
                  onChange={e => setForm({...form, dni: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Nombre Completo</p>
                <input 
                  type="text" placeholder="Nombre..." 
                  className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold text-kalian-gold font-bold"
                  value={form.nombre}
                  onChange={e => setForm({...form, nombre: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Email de Contacto</p>
                <input 
                  type="email" placeholder="tu@email.com" 
                  className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold text-kalian-gold font-bold"
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  required
                />
              </div>
            </div>
            <button 
              disabled={loading}
              className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20 disabled:opacity-50"
            >
              {loading ? 'PROCESANDO...' : 'CREAR SOCI@S Y ENVIAR BIENVENIDA'}
            </button>
          </form>
        )}

        {loading && !showForm ? (
          <div className="text-center py-32 kalian-poster-text text-4xl text-kalian-gold/20 animate-pulse">CARGANDO SOCI@S...</div>
        ) : (
          <div className="grid gap-6">
            {socios.length === 0 && <div className="text-center py-32 bg-black/20 rounded-[3rem] border border-kalian-gold/10 border-dashed text-kalian-gold/20 kalian-poster-text text-4xl">NO HAY SOCI@S REGISTRADOS</div>}
            {socios.map(s => {
              const exp = s.expiraciones || {};
              const activas = Object.keys(exp).filter(cat => exp[cat] >= hoy);
              
              return (
                <div key={s.id} className="bg-black/40 p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-8 border border-kalian-gold/10 group hover:border-kalian-gold/40 transition-all duration-500">
                  <div className="flex items-center gap-8 w-full md:w-auto">
                    <div className="w-16 h-16 bg-kalian-gold/10 rounded-2xl flex items-center justify-center text-3xl border border-kalian-gold/20">
                      👤
                    </div>
                    <div>
                      <p className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors leading-none mb-2">{s.nombre || 'Sin nombre'}</p>
                      <div className="flex gap-4 items-center">
                        <p className="text-[10px] text-kalian-gold/40 font-mono font-black tracking-[0.2em] uppercase">{s.dni || s.id}</p>
                        <p className="text-[10px] text-kalian-gold/20 italic font-bold">{s.email}</p>
                      </div>
                      {s.cursos && s.cursos.filter((cId: string) => cursosExistentes.has(cId)).length > 0 && (
                        <div className="mt-4 flex gap-2 flex-wrap">
                          {s.cursos.filter((cId: string) => cursosExistentes.has(cId)).map((cId: string) => (
                            <span key={cId} className="text-[8px] font-black uppercase bg-kalian-gold/5 text-kalian-gold/60 px-3 py-1 rounded-full border border-kalian-gold/10 tracking-widest">{cId}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                    <div className="flex gap-4 flex-wrap justify-end w-full md:w-auto">
                      {activas.map(cat => (
                        <div key={cat} className="flex flex-col items-end">
                          <span className="px-4 py-1.5 bg-kalian-gold text-black text-[10px] font-black uppercase rounded-xl shadow-xl shadow-kalian-gold/10 tracking-widest">{cat}</span>
                          <span className="text-[8px] font-black text-kalian-gold/40 mt-2 uppercase tracking-widest">Hasta {exp[cat]}</span>
                        </div>
                      ))}
                      {activas.length === 0 && <span className="px-6 py-2 bg-black/40 text-kalian-gold/20 font-black text-[10px] uppercase rounded-xl border border-kalian-gold/10 tracking-widest italic">Inactivo</span>}
                      <button 
                        onClick={() => handleDelete(s.id)}
                        className="p-3 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
                      >
                        ELIMINAR
                      </button>
                    </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSocios;
