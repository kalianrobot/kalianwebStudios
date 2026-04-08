import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, DocumentData, addDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import ReservaForm from '../components/public/ReservaForm';
import NewsletterForm from '../components/public/NewsletterForm';

const ProgramacionPublica = () => {
  const [eventos, setEventos] = useState<DocumentData[]>([]);
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [locales, setLocales] = useState<DocumentData[]>([]);
  const [itemSeleccionado, setItemSeleccionado] = useState<any | null>(null);
  const [posterSeleccionado, setPosterSeleccionado] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [solicitudCurso, setSolicitudCurso] = useState<any | null>(null);
  const [formSolicitud, setFormSolicitud] = useState({ nombre: '', email: '', telefono: '', dni: '', mensaje: '' });
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [mensajeSolicitud, setMensajeSolicitud] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const qE = query(collection(db, "eventos"), orderBy("fecha", "asc"));
      const qC = query(collection(db, "cursos"), orderBy("fechaInicio", "asc"));
      const qL = collection(db, "locales");
      const [snapE, snapC, snapL] = await Promise.all([getDocs(qE), getDocs(qC), getDocs(qL)]);
      
      const hoy = new Date().toISOString();
      setEventos(snapE.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(ev => ev.fecha >= hoy));
      setCursos(snapC.docs.map(d => ({ id: d.id, ...d.data() })));
      setLocales(snapL.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchData();
  }, []);

  const enviarSolicitud = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoSolicitud(true);
    try {
      await addDoc(collection(db, "solicitudes_cursos"), {
        ...formSolicitud,
        cursoId: solicitudCurso.id,
        cursoTitulo: solicitudCurso.titulo,
        categoria: solicitudCurso.categoria,
        fechaSolicitud: new Date().toISOString(),
        estado: 'pendiente'
      });
      setMensajeSolicitud("✅ Tu solicitud ha sido enviada. El equipo de Kalian se pondrá en contacto contigo pronto.");
      setTimeout(() => {
        setSolicitudCurso(null);
        setMensajeSolicitud('');
        setFormSolicitud({ nombre: '', email: '', telefono: '', dni: '', mensaje: '' });
      }, 5000);
    } catch (err) {
      console.error(err);
      alert("Error al enviar la solicitud");
    } finally {
      setEnviandoSolicitud(false);
    }
  };

  const hayLocalesLibres = locales.some(l => l.estado === 'libre');

  const esReservaAbierta = (ev: any) => {
    const hoy = new Date();
    const aperturaSocios = ev.apertura_socios ? new Date(ev.apertura_socios) : null;
    const aperturaGral = ev.apertura_general ? new Date(ev.apertura_general) : null;
    
    if (!aperturaSocios && !aperturaGral) {
      const fecha = new Date(ev.fecha);
      const diffTime = fecha.getTime() - hoy.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    }

    return (aperturaSocios && hoy >= aperturaSocios) || (aperturaGral && hoy >= aperturaGral);
  };

  const getMensajeApertura = (ev: any) => {
    const hoy = new Date();
    const aperturaSocios = ev.apertura_socios ? new Date(ev.apertura_socios) : null;
    const aperturaGral = ev.apertura_general ? new Date(ev.apertura_general) : null;

    if (aperturaSocios && hoy < aperturaSocios) {
      return `Apertura Soci@s: ${aperturaSocios.toLocaleDateString()}`;
    }
    if (aperturaGral && hoy < aperturaGral) {
      return `Apertura General: ${aperturaGral.toLocaleDateString()}`;
    }
    return "Apertura 7 días antes";
  };

  return (
    <div className="min-h-screen bg-kalian-dark text-kalian-cream font-sans pb-20">
      {/* HEADER PÚBLICO */}
      <div className="p-10 md:p-20 text-center space-y-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-kalian-gold)_0%,_transparent_70%)]"></div>
        </div>
        <h1 className="text-5xl md:text-8xl kalian-poster-text text-kalian-gold tracking-[-0.05em] uppercase italic">
          PROGRAMACIÓN <span className="text-kalian-cream">KALIAN</span>
        </h1>
        <p className="text-kalian-gold/60 text-xs md:text-sm font-black tracking-[0.6em] uppercase italic">Cultura y Comunidad en el corazón de la ciudad</p>
      </div>

      <div className="max-w-6xl mx-auto px-6 space-y-32">
        
        {/* EVENTOS */}
        <section className="space-y-12">
          <div className="flex items-center gap-6">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold">PRÓXIMOS <span className="text-kalian-cream">EVENTOS</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {eventos.map(ev => (
              <div 
                key={ev.id} 
                className="bg-black/40 border border-kalian-gold/10 rounded-[2.5rem] overflow-hidden hover:border-kalian-gold/40 transition-all group cursor-pointer relative flex flex-col h-full shadow-2xl"
                onClick={() => setItemSeleccionado(ev)}
              >
                <div className="h-64 relative overflow-hidden bg-kalian-gold/5 border-b border-kalian-gold/10 flex-shrink-0">
                  {ev.imagenUrl ? (
                    <img src={ev.imagenUrl} alt={ev.titulo} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10">
                      <span className="text-8xl kalian-poster-text text-kalian-gold">{ev.titulo.charAt(0)}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  <div className="absolute bottom-4 left-6 right-6 flex justify-between items-end">
                    <span className="bg-kalian-gold text-black text-[9px] font-black uppercase px-4 py-1.5 rounded-full tracking-widest shadow-lg">{ev.categoria}</span>
                    <span className="text-kalian-gold kalian-poster-text text-4xl drop-shadow-lg">{ev.precio_estandar}€</span>
                  </div>
                </div>
                
                <div className="p-8 space-y-6 flex-grow flex flex-col justify-between relative z-10">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors leading-none uppercase italic">{ev.titulo}</h3>
                      <div className="w-12 h-1 bg-kalian-gold/30 group-hover:w-full transition-all duration-500"></div>
                    </div>
                    <p className="font-bold text-kalian-cream/80 uppercase text-sm tracking-widest">{new Date(ev.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  
                  <div className="flex flex-col gap-3 mt-4">
                    {ev.imagenUrl && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setPosterSeleccionado(ev.imagenUrl); }}
                        className="w-full bg-kalian-gold/10 text-kalian-gold border border-kalian-gold/20 p-4 rounded-2xl kalian-poster-text text-sm tracking-widest hover:bg-kalian-gold/20 transition-all"
                      >Ver Cartel</button>
                    )}
                    {esReservaAbierta(ev) ? (
                      <button className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/10">
                        Reservar Plaza
                      </button>
                    ) : (
                      <div className="w-full bg-slate-800/50 text-slate-500 p-5 rounded-2xl kalian-poster-text text-lg tracking-widest text-center border border-white/5">
                        Próximamente
                        <p className="text-[8px] font-black uppercase tracking-widest mt-1">{getMensajeApertura(ev)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CURSOS */}
        <section className="space-y-12">
          <div className="flex items-center gap-6">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold">CURSOS Y <span className="text-kalian-cream">TALLERES</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {cursos.map(c => (
              <div key={c.id} className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] p-10 space-y-8 hover:border-kalian-gold/30 transition-all shadow-xl">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <span className="text-[9px] font-black uppercase text-kalian-gold/40 tracking-[0.3em]">{c.categoria}</span>
                    <h3 className="text-4xl kalian-poster-text text-kalian-cream leading-none uppercase italic">{c.titulo}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl kalian-poster-text text-kalian-gold">{c.precio}€</p>
                    <p className="text-[8px] font-black uppercase text-kalian-gold/30 tracking-widest">Al Mes</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm text-kalian-cream/60 leading-relaxed font-medium">
                    {c.horario || 'Horario a consultar'} • {new Date(c.fechaInicio).toLocaleDateString()} al {new Date(c.fechaFin).toLocaleDateString()}
                  </p>
                  <div className="bg-kalian-gold/5 p-6 rounded-2xl border border-kalian-gold/10">
                    <p className="text-[10px] text-kalian-gold/70 italic uppercase tracking-widest leading-relaxed">
                      Este curso incluye el alta como soci@ {c.categoria} y acceso a las ventajas de la asociación.
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setSolicitudCurso(c)}
                  className="w-full bg-kalian-gold/10 text-kalian-gold border border-kalian-gold/20 p-5 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-kalian-gold text-black transition-all"
                >
                  Solicitar Información / Inscripción
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* DISPONIBILIDAD LOCALES */}
        <section className="space-y-12">
          <div className="flex items-center gap-6">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold">LOCALES DE <span className="text-kalian-cream">ENSAYO</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>
          
          <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] p-12 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl">
            <div className="space-y-4 text-center md:text-left">
              <h3 className="text-3xl kalian-poster-text text-kalian-cream uppercase italic">¿Buscas un espacio para ensayar?</h3>
              <p className="text-kalian-cream/60 text-sm max-w-md leading-relaxed">
                Disponemos de locales equipados para bandas y artistas. Consulta la disponibilidad actual para unirte a nuestra comunidad.
              </p>
            </div>
            
            <div className="flex flex-col items-center gap-4">
              <div className={`px-10 py-6 rounded-3xl border-2 kalian-poster-text text-3xl tracking-widest ${hayLocalesLibres ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-red-500/30 bg-red-500/10 text-red-500'}`}>
                {hayLocalesLibres ? 'HAY DISPONIBILIDAD' : 'SIN DISPONIBILIDAD'}
              </div>
              <p className="text-[9px] font-black uppercase text-kalian-gold/40 tracking-[0.4em]">Estado de los locales en tiempo real</p>
            </div>
          </div>
        </section>

        {/* CONTRATACIÓN ARTISTAS */}
        <section className="space-y-12">
          <div className="flex items-center gap-6">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold">CONTRATACIÓN DE <span className="text-kalian-cream">ARTISTAS</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>
          
          <div className="bg-kalian-gold/5 border border-kalian-gold/10 border-dashed rounded-[3rem] p-20 text-center space-y-6">
            <div className="text-6xl mb-4 opacity-40">🎭</div>
            <h3 className="text-4xl kalian-poster-text text-kalian-gold/40 uppercase italic tracking-widest">Próximamente</h3>
            <p className="text-kalian-gold/20 font-black uppercase text-xs tracking-[0.5em]">Estamos preparando nuestra plataforma de booking</p>
          </div>
        </section>

        {/* NEWSLETTER */}
        <section className="pb-20">
          <div className="flex items-center gap-6 mb-12">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold">RECIBE LA <span className="text-kalian-cream">PROGRAMACIÓN</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>
          <NewsletterForm />
        </section>

      </div>

      {/* MODAL RESERVA EVENTO */}
      {itemSeleccionado && (
        <div className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-md flex items-center justify-center p-6 z-[1000] animate-in fade-in duration-500">
          <div className="w-full max-w-2xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl overflow-hidden">
            <ReservaForm item={itemSeleccionado} alCerrar={() => setItemSeleccionado(null)} />
          </div>
        </div>
      )}

      {/* MODAL SOLICITUD CURSO */}
      {solicitudCurso && (
        <div className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-md flex items-center justify-center p-6 z-[1000] animate-in fade-in duration-500">
          <div className="w-full max-w-xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl p-10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-kalian-gold"></div>
            <button onClick={() => setSolicitudCurso(null)} className="absolute top-8 right-8 text-kalian-gold/40 font-black text-2xl hover:text-kalian-gold transition-colors">✕</button>
            
            <h2 className="text-4xl kalian-poster-text text-kalian-gold leading-none mb-2 tracking-tight uppercase italic">{solicitudCurso.titulo}</h2>
            <p className="text-[10px] font-black text-kalian-gold/40 uppercase mb-10 tracking-[0.3em]">Solicitud de Información / Inscripción</p>

            {mensajeSolicitud ? (
              <div className="bg-kalian-gold/5 border border-kalian-gold/20 text-kalian-gold p-12 rounded-[2.5rem] text-center font-black kalian-poster-text text-2xl animate-in fade-in zoom-in italic">
                {mensajeSolicitud}
              </div>
            ) : (
              <form onSubmit={enviarSolicitud} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Nombre</label>
                    <input type="text" className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 text-kalian-cream outline-none focus:border-kalian-gold" value={formSolicitud.nombre} onChange={e => setFormSolicitud({...formSolicitud, nombre: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">DNI</label>
                    <input type="text" className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 text-kalian-cream outline-none focus:border-kalian-gold" value={formSolicitud.dni} onChange={e => setFormSolicitud({...formSolicitud, dni: e.target.value.toUpperCase()})} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Email</label>
                  <input type="email" className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 text-kalian-cream outline-none focus:border-kalian-gold" value={formSolicitud.email} onChange={e => setFormSolicitud({...formSolicitud, email: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Teléfono</label>
                  <input type="tel" className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 text-kalian-cream outline-none focus:border-kalian-gold" value={formSolicitud.telefono} onChange={e => setFormSolicitud({...formSolicitud, telefono: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Mensaje (Opcional)</label>
                  <textarea className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 text-kalian-cream outline-none focus:border-kalian-gold h-24" value={formSolicitud.mensaje} onChange={e => setFormSolicitud({...formSolicitud, mensaje: e.target.value})} />
                </div>
                <button 
                  disabled={enviandoSolicitud}
                  className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20"
                >
                  {enviandoSolicitud ? 'ENVIANDO...' : 'ENVIAR SOLICITUD'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL CARTEL */}
      {posterSeleccionado && (
        <div 
          className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 z-[2000] animate-in fade-in duration-300 cursor-zoom-out"
          onClick={() => setPosterSeleccionado(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
            <img src={posterSeleccionado} alt="Cartel" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" referrerPolicy="no-referrer" />
            <button className="absolute top-0 right-0 m-4 bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-full flex items-center justify-center transition-all" onClick={() => setPosterSeleccionado(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgramacionPublica;
