import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, DocumentData, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Link, useSearchParams } from 'react-router-dom';

const AdminEventos = () => {
  const [searchParams] = useSearchParams();
  const defaultReglas = `LA RESERVA ES FUNDAMENTAL PARA ASISTIR AL EVENTO.

SI HACES LA RESERVA PERO AL FINAL NO VAS A VENIR, CAMBIA EL NÚMERO DE ASISTENTES PARA PERMITIR QUE OTRA PERSONA OCUPE TU ENTRADA.

ESPACIO LIBRE DE REDES SOCIALES. PROHIBIDA LA DIFUSIÓN DE VÍDEOS O IMÁGENES.

ENTRADA HASTA LAS 00:00. RESERVAS DISPONIBLES HASTA COMPLETAR AFORO.`;

  const [eventos, setEventos] = useState<DocumentData[]>([]);
  const [form, setForm] = useState({ 
    titulo: '', 
    fecha: '', 
    precio_estandar: '', 
    categoria: 'musica', 
    aforo_maximo: '50',
    aforo_reservado: 0,
    aforo_actual: 0,
    max_acompanantes: '4',
    tiene_descuento: false,
    precio_descuento: '',
    clave_descuento: '',
    precio_clave: '',
    apertura_socios: '',
    apertura_general: '',
    imagenUrl: '',
    reglas: defaultReglas,
    descripcion: '',
    es_publico: true
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const fetchEventos = async () => {
    try {
      const snap = await getDocs(query(collection(db, "eventos"), orderBy("fecha", "desc")));
      setEventos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchEventos(); }, []);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && eventos.length > 0) {
      const ev = eventos.find(e => e.id === editId);
      if (ev) {
        setEditando(ev.id);
        setForm({
          titulo: ev.titulo || '',
          fecha: ev.fecha || '',
          precio_estandar: ev.precio_estandar?.toString() || '',
          categoria: ev.categoria || 'musica',
          aforo_maximo: ev.aforo_maximo?.toString() || '50',
          aforo_reservado: ev.aforo_reservado || 0,
          aforo_actual: ev.aforo_actual || 0,
          tiene_descuento: ev.tiene_descuento || false,
          precio_descuento: ev.precio_descuento?.toString() || '',
          clave_descuento: ev.clave_descuento || '',
          precio_clave: ev.precio_clave?.toString() || '',
          apertura_socios: ev.apertura_socios || '',
          apertura_general: ev.apertura_general || '',
          imagenUrl: ev.imagenUrl || '',
          reglas: ev.reglas || defaultReglas,
          descripcion: ev.descripcion || '',
          max_acompanantes: ev.max_acompanantes?.toString() || '4',
          es_publico: ev.es_publico !== false
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [searchParams, eventos]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubiendo(true);
    try {
      let finalImagenUrl = form.imagenUrl;

      if (archivo) {
        const storageRef = ref(storage, `eventos/${Date.now()}_${archivo.name}`);
        await uploadBytes(storageRef, archivo);
        finalImagenUrl = await getDownloadURL(storageRef);
      }

      const eventoData = { 
        ...form, 
        imagenUrl: finalImagenUrl,
        precio_estandar: Number(form.precio_estandar),
        precio_descuento: form.tiene_descuento ? Number(form.precio_descuento) : Number(form.precio_estandar),
        precio_clave: form.clave_descuento ? Number(form.precio_clave) : Number(form.precio_estandar),
        aforo_maximo: Number(form.aforo_maximo),
        max_acompanantes: Number(form.max_acompanantes),
        aforo_reservado: editando ? (eventos.find(ev => ev.id === editando)?.aforo_reservado || 0) : 0,
        aforo_actual: editando ? (eventos.find(ev => ev.id === editando)?.aforo_actual || 0) : 0
      };

      if (editando) {
        await updateDoc(doc(db, "eventos", editando), eventoData);
        setMsg("✅ Evento actualizado con éxito");
      } else {
        const slug = form.titulo.trim().replace(/\s+/g, '-').toUpperCase();
        const customId = `${form.fecha.substring(0,10)}-${slug}`;
        await setDoc(doc(db, "eventos", customId), eventoData);
        setMsg("✅ Evento publicado con éxito");
      }

      setForm({ 
        titulo: '', 
        fecha: '', 
        precio_estandar: '', 
        categoria: 'musica', 
        aforo_maximo: '50', 
        aforo_reservado: 0,
        aforo_actual: 0,
        max_acompanantes: '4',
        tiene_descuento: false, 
        precio_descuento: '', 
        clave_descuento: '',
        precio_clave: '',
        apertura_socios: '',
        apertura_general: '',
        imagenUrl: '',
        reglas: defaultReglas,
        descripcion: '',
        es_publico: true
      });
      setArchivo(null);
      setEditando(null);
      fetchEventos();
      setTimeout(() => setMsg(''), 3000);
    } catch (err: any) {
      console.error(err);
      alert("Error al guardar: " + err.message);
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="min-h-screen bg-kalian-dark p-6 font-sans text-kalian-cream">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12">
          <Link to="/staff" className="text-kalian-gold font-black text-[10px] uppercase tracking-[0.4em] hover:text-white transition-colors">← VOLVER AL PANEL</Link>
          <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight uppercase italic leading-none">CARTELERA <span className="text-kalian-cream">EVENTOS</span></h1>
        </header>

        {msg && <div className="bg-kalian-gold text-black p-6 rounded-2xl mb-10 font-black kalian-poster-text text-2xl text-center animate-bounce uppercase tracking-widest shadow-2xl shadow-kalian-gold/20">{msg}</div>}

        <form onSubmit={guardar} className="bg-black/40 p-10 rounded-[3rem] shadow-2xl space-y-6 mb-16 text-kalian-cream border border-kalian-gold/10">
          <h2 className="text-xl font-black uppercase italic mb-4 text-kalian-gold">{editando ? 'Editar Evento' : 'Nuevo Evento'}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Visibilidad del Evento</label>
              <button 
                type="button"
                onClick={() => setForm({...form, es_publico: !form.es_publico})}
                className={`w-full p-5 rounded-2xl font-black uppercase tracking-widest transition-all ${form.es_publico ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}
              >
                {form.es_publico ? 'PÚBLICO (Visible en Web)' : 'PRIVADO (Solo Staff)'}
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Título del Evento</label>
              <input type="text" placeholder="EJ: CONCIERTO DE JAZZ" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold font-black uppercase text-xl" value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} required />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Cartel del Evento (.jpg)</label>
            <div className="flex items-center gap-4">
              <input 
                type="file" 
                accept="image/jpeg,image/png"
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                className="flex-1 p-4 bg-kalian-gold/5 rounded-2xl border border-kalian-gold/10 text-xs font-bold"
              />
              {form.imagenUrl && !archivo && (
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-kalian-gold/20">
                  <img src={form.imagenUrl} alt="Vista previa" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Fecha y Hora</label>
              <input type="datetime-local" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Precio Estándar (€)</label>
              <input type="number" placeholder="PRECIO (€)" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold font-black text-xl" value={form.precio_estandar} onChange={e => setForm({...form, precio_estandar: e.target.value})} required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">¿Tiene Descuento para Soci@s?</label>
              <button 
                type="button"
                onClick={() => setForm({...form, tiene_descuento: !form.tiene_descuento})}
                className={`w-full p-5 rounded-2xl font-black uppercase tracking-widest transition-all ${form.tiene_descuento ? 'bg-kalian-gold text-black' : 'bg-kalian-gold/5 text-kalian-gold border border-kalian-gold/10'}`}
              >
                {form.tiene_descuento ? 'CON DESCUENTO' : 'SIN DESCUENTO'}
              </button>
            </div>
            {form.tiene_descuento && (
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Precio Soci@s (€)</label>
                <input type="number" placeholder="PRECIO SOCI@S (€)" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold font-black text-xl" value={form.precio_descuento} onChange={e => setForm({...form, precio_descuento: e.target.value})} required />
              </div>
            )}
          </div>

          {/* SISTEMA DE CUPONES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-kalian-gold/5 rounded-[2rem] border border-kalian-gold/10">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Clave de Descuento (Cupón)</label>
              <input type="text" placeholder="EJ: KALIANLINDY" className="w-full p-5 bg-black/40 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold font-black uppercase" value={form.clave_descuento} onChange={e => setForm({...form, clave_descuento: e.target.value.toUpperCase()})} />
            </div>
            {form.clave_descuento && (
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Precio con Clave (€)</label>
                <input type="number" placeholder="PRECIO CLAVE (€)" className="w-full p-5 bg-black/40 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold font-black text-xl" value={form.precio_clave} onChange={e => setForm({...form, precio_clave: e.target.value})} required />
              </div>
            )}
          </div>

          {/* RESERVA ESCALONADA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-kalian-gold/5 rounded-[2rem] border border-kalian-gold/10">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Apertura Reservas Soci@s</label>
              <input type="datetime-local" className="w-full p-5 bg-black/40 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.apertura_socios} onChange={e => setForm({...form, apertura_socios: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Apertura Reservas General / Clave</label>
              <input type="datetime-local" className="w-full p-5 bg-black/40 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.apertura_general} onChange={e => setForm({...form, apertura_general: e.target.value})} required />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">IMPORTANTE (Reglas)</label>
              <textarea 
                placeholder="Normas del evento..." 
                className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold min-h-[150px]" 
                value={form.reglas} 
                onChange={e => setForm({...form, reglas: e.target.value})} 
                required 
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Descripción del evento</label>
              <textarea 
                placeholder="Información libre sobre el evento..." 
                className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold min-h-[150px]" 
                value={form.descripcion} 
                onChange={e => setForm({...form, descripcion: e.target.value})} 
                required 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Aforo Máximo</label>
              <input type="number" placeholder="AFORO MÁX" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.aforo_maximo} onChange={e => setForm({...form, aforo_maximo: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Máx. Acompañantes</label>
              <input type="number" placeholder="MÁX ACOMP." className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.max_acompanantes} onChange={e => setForm({...form, max_acompanantes: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Descuento Soci@s</label>
              <select className="w-full p-5 bg-kalian-gold/5 rounded-2xl font-black uppercase border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold" value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}>
                <option value="musica">Descuento Soci@s Music Is Cool</option>
                <option value="danza">Descuento Soci@s Club De Baile</option>
                <option value="ninguno">Ninguno (sin descuento)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Aforo Reservado (Manual)</label>
              <input type="number" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.aforo_reservado} onChange={e => setForm({...form, aforo_reservado: Number(e.target.value)})} />
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              disabled={subiendo}
              className="flex-1 bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20 active:scale-95 uppercase disabled:opacity-50"
            >
              {subiendo ? 'Subiendo...' : (editando ? 'Actualizar Evento' : 'Publicar Concierto / Evento')}
            </button>
            {editando && (
              <button 
                type="button"
                onClick={() => {
                  setEditando(null);
                  setForm({ 
                    titulo: '', 
                    fecha: '', 
                    precio_estandar: '', 
                    categoria: 'musica', 
                    aforo_max: '50', 
                    tiene_descuento: false, 
                    precio_descuento: '', 
                    clave_descuento: '',
                    precio_clave: '',
                    apertura_socios: '',
                    apertura_general: '',
                    imagenUrl: '',
                    reglas: defaultReglas,
                    descripcion: ''
                  });
                  setArchivo(null);
                }}
                className="bg-kalian-gold/10 text-kalian-gold px-8 rounded-2xl font-black uppercase"
              >Cancelar</button>
            )}
          </div>
        </form>

        <div className="space-y-4">
          <h2 className="text-2xl kalian-poster-text text-kalian-gold/80 uppercase mb-6 ml-4 tracking-widest">Eventos Programados</h2>
          {eventos.map(ev => (
            <div key={ev.id} className="bg-black/40 p-8 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm border border-kalian-gold/10 group hover:border-kalian-gold/40 transition-all overflow-hidden">
              <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                {ev.imagenUrl && (
                  <div className="w-24 h-24 rounded-2xl overflow-hidden border border-kalian-gold/10 flex-shrink-0">
                    <img src={ev.imagenUrl} alt={ev.titulo} className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <h3 className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors uppercase italic">{ev.titulo}</h3>
                  <p className="text-[10px] text-kalian-gold/80 font-black uppercase tracking-[0.3em] mt-2">
                    {new Date(ev.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} | {ev.categoria.toUpperCase()} | {ev.precio_estandar}€ {ev.tiene_descuento ? `(Soci@s: ${ev.precio_descuento}€)` : '(Sin dto)'} | RESERVADO: {ev.aforo_reservado || 0}/{ev.aforo_maximo} | CHECK-IN: {ev.aforo_actual || 0} | MÁX ACOMP: {ev.max_acompanantes || 4} | {ev.es_publico !== false ? '🟢 PÚBLICO' : '🔴 PRIVADO'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setEditando(ev.id);
                    setForm({
                      titulo: ev.titulo || '',
                      fecha: ev.fecha || '',
                      precio_estandar: ev.precio_estandar?.toString() || '',
                      categoria: ev.categoria || 'musica',
                      aforo_maximo: ev.aforo_maximo?.toString() || '50',
                      aforo_reservado: ev.aforo_reservado || 0,
                      aforo_actual: ev.aforo_actual || 0,
                      tiene_descuento: ev.tiene_descuento || false,
                      precio_descuento: ev.precio_descuento?.toString() || '',
                      clave_descuento: ev.clave_descuento || '',
                      precio_clave: ev.precio_clave?.toString() || '',
                      apertura_socios: ev.apertura_socios || '',
                      apertura_general: ev.apertura_general || '',
                      imagenUrl: ev.imagenUrl || '',
                      reglas: ev.reglas || defaultReglas,
                      descripcion: ev.descripcion || '',
                      max_acompanantes: ev.max_acompanantes?.toString() || '4',
                      es_publico: ev.es_publico !== false
                    });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="bg-kalian-gold/10 text-kalian-gold hover:bg-kalian-gold hover:text-black px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                >
                  EDITAR
                </button>
                <button 
                  onClick={async () => { 
                    if (window.confirm("¿Seguro que quieres borrar este evento?")) {
                      await deleteDoc(doc(db, "eventos", ev.id)); 
                      fetchEventos(); 
                    }
                  }} 
                  className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                >
                  BORRAR
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminEventos;
