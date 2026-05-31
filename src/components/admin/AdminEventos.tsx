import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { collection, setDoc, doc, getDocs, getDocsFromServer, deleteDoc, query, orderBy, DocumentData, updateDoc, collectionGroup, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { normalizeToSlug } from '../../lib/slug';

const AdminEventos = () => {
  const [searchParams] = useSearchParams();
  const defaultReglas = `LA RESERVA ES FUNDAMENTAL PARA ASISTIR AL EVENTO.

SI HACES LA RESERVA PERO AL FINAL NO VAS A VENIR, CAMBIA EL NÚMERO DE ASISTENTES PARA PERMITIR QUE OTRA PERSONA OCUPE TU ENTRADA.

ESPACIO LIBRE DE REDES SOCIALES. PROHIBIDA LA DIFUSIÓN DE VÍDEOS O IMÁGENES.

ENTRADA HASTA LAS 00:00. RESERVAS DISPONIBLES HASTA COMPLETAR AFORO.`;

  const [eventos, setEventos] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    titulo: '',
    fecha: '',
    fecha_fin: '',
    sala: 'SALA GRANDE',
    precio_estandar: '',
    categoria: 'musica',
    aforo_maximo: '50',
    aforo_reservado: 0,
    aforo_actual: 0,
    max_acompanantes: '4',
    tiene_descuento: false,
    precio_descuento: '',
    cupon: '',
    precioCupon: '',
    fechaCupon: '',
    apertura_socios: '',
    apertura_general: '',
    imagenUrl: '',
    reglas: defaultReglas,
    descripcion: '',
    titulo_eu: '',
    descripcion_eu: '',
    reglas_eu: '',
    es_publico: true
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const { user } = useAuth();
  const [conflictos, setConflictos] = useState<{fecha: string, motivo: string}[]>([]);
  const [isCheckingConflictos, setIsCheckingConflictos] = useState(false);

  useEffect(() => { 
    if (!user) return;
    setLoading(true);
    setMsg('⏳ Cargando eventos...');

    const q = query(collection(db, "eventos"), orderBy("fecha", "asc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEventos(data);
      setLoading(false);
      setMsg('');
    }, (err) => {
      console.error("AdminEventos: Error en onSnapshot:", err.message);
      setMsg("❌ Error de permisos: " + err.message);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && eventos.length > 0) {
      const ev = eventos.find(e => e.id === editId);
      if (ev) {
        setEditando(ev.id);
        // Handle backward compatibility for fecha_fin
        let fechaFin = ev.fecha_fin || '';
        if (!fechaFin && ev.hora_fin && ev.fecha) {
          fechaFin = `${ev.fecha.substring(0, 11)}${ev.hora_fin}`;
        }
        
        setForm({
          titulo: ev.titulo || '',
          fecha: ev.fecha || '',
          fecha_fin: fechaFin,
          sala: ev.sala === 'SALA' || ev.sala === 'Toda la Sala' ? 'SALA GRANDE' : (ev.sala || 'SALA GRANDE'),
          precio_estandar: ev.precio_estandar?.toString() || '',
          categoria: ev.categoria || 'musica',
          aforo_maximo: ev.aforo_maximo?.toString() || '50',
          aforo_reservado: ev.aforo_reservado || 0,
          aforo_actual: ev.aforo_actual || 0,
          tiene_descuento: ev.tiene_descuento || false,
          precio_descuento: ev.precio_descuento?.toString() || '',
          cupon: ev.cupon || ev.clave_descuento || ev.codigoCupon || '',
          precioCupon: ev.precioCupon?.toString() || ev.precio_clave?.toString() || '',
          fechaCupon: ev.fechaCupon || ev.fechaAperturaCupon || '',
          apertura_socios: ev.apertura_socios || '',
          apertura_general: ev.apertura_general || '',
          imagenUrl: ev.imagenUrl || '',
          reglas: ev.reglas || defaultReglas,
          descripcion: ev.descripcion || '',
          titulo_eu: ev.titulo_eu || '',
          descripcion_eu: ev.descripcion_eu || '',
          reglas_eu: ev.reglas_eu || '',
          max_acompanantes: ev.max_acompanantes?.toString() || '4',
          es_publico: ev.es_publico !== false
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [searchParams, eventos]);

  const checkConflictos = async () => {
    if (!form.fecha || !form.fecha_fin) return;
    setIsCheckingConflictos(true);
    const conflicts: {fecha: string, motivo: string}[] = [];
    
    try {
      const start = new Date(form.fecha);
      const end = new Date(form.fecha_fin);
      const dateStr = form.fecha.substring(0, 10);

      // 1. Comprobar contra otros Eventos (Usando el estado 'eventos' ya cargado por onSnapshot)
      eventos.forEach(ev => {
        if (ev.id === editando) return;
        const evStart = new Date(ev.fecha);
        const evEnd = new Date(ev.fecha_fin || `${ev.fecha.substring(0, 11)}${ev.hora_fin || '23:59'}`);
        
        // Si comparten sala (considerando SALA GRANDE como Toda la Sala)
        const compartenSala = form.sala === ev.sala || 
                             ((form.sala === 'SALA GRANDE' || form.sala === 'SALA' || form.sala === 'Toda la Sala') && 
                              (ev.sala === 'SALA GRANDE' || ev.sala === 'SALA' || ev.sala === 'Toda la Sala'));
        
        if (compartenSala && (start < evEnd) && (end > evStart)) {
          conflicts.push({ fecha: dateStr, motivo: `Evento: ${ev.titulo}` });
        }
      });

      // 2. Comprobar contra Sesiones de Cursos (Solo si es absolutamente necesario para ahorrar recursos)
      // En una versión futura deberiamos tener las sesiones también en onSnapshot global.
      // Por ahora, bajamos la frecuencia de comprobación.
      const snapS = await getDocs(collectionGroup(db, "sesiones"));
      const snapC = await getDocs(collection(db, "cursos"));
      const cursosMap: Record<string, string> = {};
      snapC.docs.forEach(d => { cursosMap[d.id] = d.data().titulo; });

      snapS.docs.forEach(d => {
        const s = d.data();
        const cursoId = d.ref.parent.parent?.id;
        const sStart = new Date(`${s.fecha}T${s.hora_inicio}`);
        const sEnd = new Date(`${s.fecha}T${s.hora_fin}`);
        const compartenSala = form.sala === s.sala || 
                             ((form.sala === 'SALA GRANDE' || form.sala === 'SALA' || form.sala === 'Toda la Sala') && 
                              (s.sala === 'SALA GRANDE' || s.sala === 'SALA' || s.sala === 'Toda la Sala'));

        if (compartenSala && (start < sEnd) && (end > sStart)) {
          const cursoTitulo = cursosMap[cursoId || ''] || "Otro Curso";
          conflicts.push({ fecha: dateStr, motivo: `Curso: ${cursoTitulo} (${s.sala})` });
        }
      });

      setConflictos(conflicts);
    } catch (err) {
      console.error("AdminEventos: Error verificando conflictos:", err);
    }
    setIsCheckingConflictos(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      checkConflictos();
    }, 500);
    return () => clearTimeout(timer);
  }, [form.fecha, form.fecha_fin, form.sala, editando]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (conflictos.length > 0) {
      alert("⚠️ NO SE PUEDE GUARDAR: Se han detectado conflictos de horario en la sala.");
      return;
    }
    if (form.cupon && (!form.precioCupon || !form.fechaCupon)) {
      alert("⚠️ Si defines un cupón, debes especificar también el precio y la fecha de apertura para ese cupón.");
      return;
    }

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
        precioCupon: form.cupon ? Number(form.precioCupon) : Number(form.precio_estandar),
        aforo_maximo: Number(form.aforo_maximo),
        max_acompanantes: Number(form.max_acompanantes),
        aforo_reservado: editando ? (eventos.find(ev => ev.id === editando)?.aforo_reservado || 0) : 0,
        aforo_actual: editando ? (eventos.find(ev => ev.id === editando)?.aforo_actual || 0) : 0,
        // Mantener hora_fin para compatibilidad con web pública si es necesario
        hora_fin: form.fecha_fin.split('T')[1]?.substring(0, 5) || ''
      };

      if (editando) {
        await updateDoc(doc(db, "eventos", editando), eventoData);
        setMsg("✅ Evento actualizado con éxito");
      } else {
        const slug = normalizeToSlug(form.titulo);
        const customId = `${form.fecha.substring(0,10)}-${slug}`;
        await setDoc(doc(db, "eventos", customId), eventoData);
        setMsg("✅ Evento publicado con éxito");
      }

      setForm({
        titulo: '',
        fecha: '',
        fecha_fin: '',
        sala: 'SALA GRANDE',
        precio_estandar: '',
        categoria: 'musica',
        aforo_maximo: '50',
        aforo_reservado: 0,
        aforo_actual: 0,
        max_acompanantes: '4',
        tiene_descuento: false,
        precio_descuento: '',
        cupon: '',
        precioCupon: '',
        fechaCupon: '',
        apertura_socios: '',
        apertura_general: '',
        imagenUrl: '',
        reglas: defaultReglas,
        descripcion: '',
        titulo_eu: '',
        descripcion_eu: '',
        reglas_eu: '',
        es_publico: true
      });
      setArchivo(null);
      setEditando(null);
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
              <input type="text" placeholder="Izenburua (Euskera — opcional)" className="w-full p-3 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/5 focus:border-kalian-gold/40 transition-all text-kalian-gold/60 font-bold uppercase text-base" value={form.titulo_eu} onChange={e => setForm({...form, titulo_eu: e.target.value})} />
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
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Fecha e Inicio</label>
              <input type="datetime-local" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Fecha y Hora Fin</label>
              <input type="datetime-local" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.fecha_fin} onChange={e => setForm({...form, fecha_fin: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Aportación Estándar (€)</label>
              <input type="number" placeholder="APORTACIÓN (€)" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold font-black text-xl" value={form.precio_estandar} onChange={e => setForm({...form, precio_estandar: e.target.value})} required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Sala / Espacio</label>
              <select 
                className="w-full p-5 bg-kalian-gold/5 rounded-2xl font-black uppercase border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold"
                value={form.sala}
                onChange={e => setForm({...form, sala: e.target.value})}
              >
                <option value="SALA GRANDE">SALA GRANDE</option>
                <option value="Estudio">Estudio</option>
                <option value="Local Pequeño">Local Pequeño</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Estado de Disponibilidad</label>
              <div className={`p-4 rounded-2xl border transition-all ${conflictos.length > 0 ? 'bg-red-500/20 border-red-500/50' : 'bg-emerald-500/20 border-emerald-500/50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${conflictos.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${conflictos.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {isCheckingConflictos ? 'Verificando...' : conflictos.length > 0 ? 'Conflictos Detectados' : 'Horario Disponible'}
                  </p>
                </div>
                {conflictos.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {conflictos.slice(0, 3).map((c, idx) => (
                      <span key={idx} className="text-[7px] bg-red-500/30 text-red-200 px-1.5 py-0.5 rounded font-mono">
                        {c.motivo}
                      </span>
                    ))}
                    {conflictos.length > 3 && <span className="text-[7px] text-red-300">+{conflictos.length - 3} más</span>}
                  </div>
                )}
              </div>
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
                <label className="text-[9px] font-black uppercase text-kalian-gold/80 ml-4 tracking-widest">Aportación Soci@s (€)</label>
                <input type="number" placeholder="APORTACIÓN SOCI@S (€)" className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold font-black text-xl" value={form.precio_descuento} onChange={e => setForm({...form, precio_descuento: e.target.value})} required />
              </div>
            )}
          </div>

          {/* GESTIÓN DE CUPÓN Y ACCESO ANTICIPADO */}
          <div className="p-8 bg-emerald-500/5 rounded-[3rem] border border-emerald-500/20 space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">🎟️</div>
              <h3 className="text-xl kalian-poster-text text-emerald-500 uppercase italic">Gestión de Cupón y Acceso Anticipado</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-emerald-500/40 ml-4 tracking-widest">Código del Cupón</label>
                <input 
                  type="text" 
                  placeholder="EJ: PREVENTA2024" 
                  className="w-full p-5 bg-black/40 rounded-2xl outline-none border border-emerald-500/10 focus:border-emerald-500 transition-all text-emerald-500 font-black uppercase" 
                  value={form.cupon} 
                  onChange={e => setForm({...form, cupon: e.target.value.toUpperCase()})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-emerald-500/40 ml-4 tracking-widest">Aportación con Cupón (€)</label>
                <input 
                  type="number" 
                  placeholder="APORTACIÓN (€)" 
                  className="w-full p-5 bg-black/40 rounded-2xl outline-none border border-emerald-500/10 focus:border-emerald-500 transition-all text-emerald-500 font-black text-xl" 
                  value={form.precioCupon} 
                  onChange={e => setForm({...form, precioCupon: e.target.value})} 
                  required={!!form.cupon}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-emerald-500/40 ml-4 tracking-widest">Apertura con Cupón</label>
                <input 
                  type="datetime-local" 
                  className="w-full p-5 bg-black/40 rounded-2xl outline-none border border-emerald-500/10 focus:border-emerald-500 transition-all text-kalian-cream font-bold" 
                  value={form.fechaCupon} 
                  onChange={e => setForm({...form, fechaCupon: e.target.value})} 
                  required={!!form.cupon}
                />
              </div>
            </div>
            <p className="text-[10px] text-emerald-500/40 italic ml-4">
              * Los usuarios que introduzcan este código podrán reservar antes que el público general y al precio definido aquí.
            </p>
          </div>

          {/* APERTURAS ESCALONADAS (SOCIOS Y GENERAL) */}
          <div className="p-8 bg-kalian-gold/5 rounded-[3rem] border border-kalian-gold/10 space-y-6">
            <h3 className="text-sm font-black uppercase text-kalian-gold tracking-[0.2em]">Apertura de Reservas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Apertura Soci@s</label>
                <input type="datetime-local" className="w-full p-5 bg-black/40 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.apertura_socios} onChange={e => setForm({...form, apertura_socios: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Apertura Invitados (General)</label>
                <input type="datetime-local" className="w-full p-5 bg-black/40 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream font-bold" value={form.apertura_general} onChange={e => setForm({...form, apertura_general: e.target.value})} required />
              </div>
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
              <textarea
                placeholder="Arauak (Euskera — opcional)"
                className="w-full p-4 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/5 focus:border-kalian-gold/40 transition-all text-kalian-cream/60 font-bold min-h-[100px] text-sm"
                value={form.reglas_eu}
                onChange={e => setForm({...form, reglas_eu: e.target.value})}
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
              <textarea
                placeholder="Deskribapena (Euskera — opcional)"
                className="w-full p-4 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/5 focus:border-kalian-gold/40 transition-all text-kalian-cream/60 font-bold min-h-[100px] text-sm"
                value={form.descripcion_eu}
                onChange={e => setForm({...form, descripcion_eu: e.target.value})}
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
                    hora_fin: '',
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

        <div className="space-y-12">
          {/* EVENTOS PROGRAMADOS */}
          <div className="space-y-4">
            <h2 className="text-2xl kalian-poster-text text-kalian-gold/80 uppercase mb-6 ml-4 tracking-widest">Eventos Programados</h2>
            {loading ? (
              <div className="p-20 text-center animate-pulse text-slate-500 font-bold uppercase tracking-[0.2em]">Cargando eventos...</div>
            ) : eventos.filter(ev => new Date(ev.fecha) >= new Date()).length === 0 ? (
              <p className="text-center py-10 text-kalian-gold/20 font-black uppercase tracking-widest italic">No hay eventos programados</p>
            ) : (
              eventos
                .filter(ev => new Date(ev.fecha) >= new Date())
                .map(ev => (
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
                          {new Date(ev.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} | {ev.sala === 'SALA' || ev.sala === 'Toda la Sala' ? 'SALA GRANDE' : (ev.sala || 'SALA GRANDE')} | {ev.categoria.toUpperCase()} | {ev.precio_estandar}€ {ev.tiene_descuento ? `(Soci@s: ${ev.precio_descuento}€)` : '(Sin dto)'} | RESERVADO: {ev.aforo_reservado || 0}/{ev.aforo_maximo} | CHECK-IN: {ev.aforo_actual || 0} | MÁX ACOMP: {ev.max_acompanantes || 4} | {ev.es_publico !== false ? '🟢 PÚBLICO' : '🔴 PRIVADO'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => {
                          setEditando(ev.id);
                          // Handle backward compatibility for fecha_fin
                          let fechaFin = ev.fecha_fin || '';
                          if (!fechaFin && ev.hora_fin && ev.fecha) {
                            fechaFin = `${ev.fecha.substring(0, 11)}${ev.hora_fin}`;
                          }

                          setForm({
                            titulo: ev.titulo || '',
                            fecha: ev.fecha || '',
                            fecha_fin: fechaFin,
                            sala: ev.sala === 'SALA' || ev.sala === 'Toda la Sala' ? 'SALA GRANDE' : (ev.sala || 'SALA GRANDE'),
                            precio_estandar: ev.precio_estandar?.toString() || '',
                            categoria: ev.categoria || 'musica',
                            aforo_maximo: ev.aforo_maximo?.toString() || '50',
                            aforo_reservado: ev.aforo_reservado || 0,
                            aforo_actual: ev.aforo_actual || 0,
                            tiene_descuento: ev.tiene_descuento || false,
                            precio_descuento: ev.precio_descuento?.toString() || '',
                            cupon: ev.cupon || ev.clave_descuento || ev.codigoCupon || '',
                            precioCupon: ev.precioCupon?.toString() || ev.precio_clave?.toString() || '',
                            fechaCupon: ev.fechaCupon || ev.fechaAperturaCupon || '',
                            apertura_socios: ev.apertura_socios || '',
                            apertura_general: ev.apertura_general || '',
                            imagenUrl: ev.imagenUrl || '',
                            reglas: ev.reglas || defaultReglas,
                            descripcion: ev.descripcion || '',
                            titulo_eu: ev.titulo_eu || '',
                            descripcion_eu: ev.descripcion_eu || '',
                            reglas_eu: ev.reglas_eu || '',
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
                        onClick={() => {
                          setEditando(null);
                          // Handle backward compatibility for fecha_fin
                          let fechaFin = ev.fecha_fin || '';
                          if (!fechaFin && ev.hora_fin && ev.fecha) {
                            fechaFin = `${ev.fecha.substring(0, 11)}${ev.hora_fin}`;
                          }

                          setForm({
                            titulo: `${ev.titulo} (COPIA)`,
                            fecha: ev.fecha || '',
                            fecha_fin: fechaFin,
                            sala: ev.sala === 'SALA' || ev.sala === 'Toda la Sala' ? 'SALA GRANDE' : (ev.sala || 'SALA GRANDE'),
                            precio_estandar: ev.precio_estandar?.toString() || '',
                            categoria: ev.categoria || 'musica',
                            aforo_maximo: ev.aforo_maximo?.toString() || '50',
                            aforo_reservado: 0,
                            aforo_actual: 0,
                            tiene_descuento: ev.tiene_descuento || false,
                            precio_descuento: ev.precio_descuento?.toString() || '',
                            cupon: ev.cupon || ev.clave_descuento || ev.codigoCupon || '',
                            precioCupon: ev.precioCupon?.toString() || ev.precio_clave?.toString() || '',
                            fechaCupon: ev.fechaCupon || ev.fechaAperturaCupon || '',
                            apertura_socios: ev.apertura_socios || '',
                            apertura_general: ev.apertura_general || '',
                            imagenUrl: ev.imagenUrl || '',
                            reglas: ev.reglas || defaultReglas,
                            descripcion: ev.descripcion || '',
                            titulo_eu: ev.titulo_eu ? `${ev.titulo_eu} (KOPIA)` : '',
                            descripcion_eu: ev.descripcion_eu || '',
                            reglas_eu: ev.reglas_eu || '',
                            max_acompanantes: ev.max_acompanantes?.toString() || '4',
                            es_publico: ev.es_publico !== false
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          setMsg("📋 Datos copiados. Ajusta la fecha y guarda para duplicar.");
                          setTimeout(() => setMsg(''), 3000);
                        }}
                        className="bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                      >
                        DUPLICAR
                      </button>
                      <button 
                        onClick={async () => { 
                          if (window.confirm("¿Seguro que quieres borrar este evento?")) {
                            await deleteDoc(doc(db, "eventos", ev.id)); 
                          }
                        }} 
                        className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                      >
                        BORRAR
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* HISTÓRICO DE EVENTOS */}
          <div className="space-y-4 pt-12 border-t border-kalian-gold/10">
            <h2 className="text-2xl kalian-poster-text text-kalian-gold/40 uppercase mb-6 ml-4 tracking-widest italic">Histórico de Eventos</h2>
            {eventos.filter(ev => new Date(ev.fecha) < new Date()).length === 0 ? (
              <p className="text-center py-10 text-kalian-gold/10 font-black uppercase tracking-widest italic">No hay eventos pasados</p>
            ) : (
              eventos
                .filter(ev => new Date(ev.fecha) < new Date())
                .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                .map(ev => (
                  <div key={ev.id} className="bg-black/20 p-6 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm border border-kalian-gold/5 opacity-60 hover:opacity-100 transition-all">
                    <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                      {ev.imagenUrl && (
                        <div className="w-16 h-16 rounded-xl overflow-hidden border border-kalian-gold/5 grayscale">
                          <img src={ev.imagenUrl} alt={ev.titulo} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-xl kalian-poster-text text-kalian-cream/60 uppercase italic">{ev.titulo}</h3>
                        <p className="text-[8px] text-kalian-gold/40 font-black uppercase tracking-[0.3em] mt-1">
                          {new Date(ev.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })} | {ev.categoria.toUpperCase()} | {ev.precio_estandar}€ | ASISTENCIA: {ev.aforo_actual || 0}/{ev.aforo_maximo}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setEditando(null);
                          // Handle backward compatibility for fecha_fin
                          let fechaFin = ev.fecha_fin || '';
                          if (!fechaFin && ev.hora_fin && ev.fecha) {
                            fechaFin = `${ev.fecha.substring(0, 11)}${ev.hora_fin}`;
                          }

                          setForm({
                            titulo: `${ev.titulo} (REPETIR)`,
                            fecha: '',
                            fecha_fin: '',
                            sala: ev.sala === 'SALA' || ev.sala === 'Toda la Sala' ? 'SALA GRANDE' : (ev.sala || 'SALA GRANDE'),
                            precio_estandar: ev.precio_estandar?.toString() || '',
                            categoria: ev.categoria || 'musica',
                            aforo_maximo: ev.aforo_maximo?.toString() || '50',
                            aforo_reservado: 0,
                            aforo_actual: 0,
                            tiene_descuento: ev.tiene_descuento || false,
                            precio_descuento: ev.precio_descuento?.toString() || '',
                            cupon: ev.cupon || ev.clave_descuento || ev.codigoCupon || '',
                            precioCupon: ev.precioCupon?.toString() || ev.precio_clave?.toString() || '',
                            fechaCupon: '',
                            apertura_socios: '',
                            apertura_general: '',
                            imagenUrl: ev.imagenUrl || '',
                            reglas: ev.reglas || defaultReglas,
                            descripcion: ev.descripcion || '',
                            titulo_eu: ev.titulo_eu || '',
                            descripcion_eu: ev.descripcion_eu || '',
                            reglas_eu: ev.reglas_eu || '',
                            max_acompanantes: ev.max_acompanantes?.toString() || '4',
                            es_publico: ev.es_publico !== false
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          setMsg("📋 Datos recuperados del histórico. Pon una nueva fecha.");
                        }}
                        className="bg-kalian-gold/5 text-kalian-gold/40 hover:text-kalian-gold px-4 py-2 rounded-lg font-black text-[8px] uppercase tracking-widest transition-all"
                      >
                        REPETIR
                      </button>
                      <button 
                        onClick={async () => { 
                          if (window.confirm("¿Seguro que quieres borrar este evento del histórico?")) {
                            await deleteDoc(doc(db, "eventos", ev.id)); 
                          }
                        }} 
                        className="bg-red-500/5 text-red-500/40 hover:text-red-500 px-4 py-2 rounded-lg font-black text-[8px] uppercase tracking-widest transition-all"
                      >
                        BORRAR
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminEventos;
