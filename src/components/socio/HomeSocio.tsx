import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, DocumentData } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import ReservaForm from '../public/ReservaForm';

const HomeSocio = () => {
  const [eventos, setEventos] = useState<DocumentData[]>([]);
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [itemSeleccionado, setItemSeleccionado] = useState<any | null>(null);
  const [posterSeleccionado, setPosterSeleccionado] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const qE = query(collection(db, "eventos"), orderBy("fecha", "asc"));
      const qC = query(collection(db, "cursos"), orderBy("fechaInicio", "asc"));
      const [snapE, snapC] = await Promise.all([getDocs(qE), getDocs(qC)]);
      setEventos(snapE.docs.map(d => ({ id: d.id, ...d.data() })));
      setCursos(snapC.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-kalian-dark text-kalian-cream font-sans pb-20">
      {/* HERO SOCIO */}
      <div className="p-10 md:p-20 text-center space-y-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-kalian-gold)_0%,_transparent_70%)]"></div>
        </div>
        <h1 className="text-5xl md:text-8xl kalian-poster-text text-kalian-gold tracking-[-0.05em]">
          CATÁLOGO <span className="text-kalian-cream">EXCLUSIVO</span>
        </h1>
        <p className="text-kalian-gold/60 text-xs md:text-sm font-black tracking-[0.6em] uppercase italic">Eventos y Cursos para Socios Kalian</p>
        
        <div className="pt-8 flex justify-center">
          <Link 
            to="/perfil" 
            className="bg-kalian-gold text-black px-10 py-4 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20"
          >
            IR A MI PANEL →
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 space-y-24">
        
        {/* SECCIÓN EVENTOS */}
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
                {/* IMAGEN DEL EVENTO */}
                <div className="h-64 relative overflow-hidden bg-kalian-gold/5 border-b border-kalian-gold/10 flex-shrink-0">
                  {ev.imagenUrl ? (
                    <img 
                      src={ev.imagenUrl} 
                      alt={ev.titulo} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
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

                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">Fecha y Hora</p>
                      <p className="font-bold text-kalian-cream/80 uppercase text-sm tracking-widest">{new Date(ev.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-3 mt-4">
                    {ev.imagenUrl && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setPosterSeleccionado(ev.imagenUrl);
                        }}
                        className="w-full bg-kalian-gold/10 text-kalian-gold border border-kalian-gold/20 p-4 rounded-2xl kalian-poster-text text-sm tracking-widest hover:bg-kalian-gold/20 transition-all"
                      >
                        Ver Cartel
                      </button>
                    )}
                    <button className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/10">
                      Reservar Plaza
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECCIÓN CURSOS */}
        <section className="space-y-12">
          <div className="flex items-center gap-6">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold">ACADEMIA <span className="text-kalian-cream">KALIAN</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>

          <div className="space-y-6">
            {cursos.map(c => {
              const isFull = c.aforo_actual >= c.aforo_total;
              const isExpanded = expandido === c.id;

              return (
                <div 
                  key={c.id} 
                  className={`bg-black/40 border border-kalian-gold/10 rounded-3xl overflow-hidden transition-all duration-500 ${isExpanded ? 'ring-1 ring-kalian-gold shadow-2xl shadow-kalian-gold/5' : ''}`}
                >
                  <div 
                    className="p-8 md:p-10 flex flex-col md:flex-row justify-between items-center gap-8 cursor-pointer group"
                    onClick={() => setExpandido(isExpanded ? null : c.id)}
                  >
                    <div className="flex items-center gap-8 w-full md:w-auto">
                      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl border border-kalian-gold/10 ${c.categoria === 'danza' ? 'bg-kalian-orange/10' : 'bg-kalian-gold/10'}`}>
                        {c.categoria === 'danza' ? '💃' : '🎸'}
                      </div>
                      <div>
                        <h3 className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors">{c.titulo}</h3>
                        <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] mt-3">Categoría: {c.categoria}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-12 w-full md:w-auto justify-between md:justify-end">
                      <div className="text-center">
                        <p className={`text-3xl kalian-poster-text ${c.aforo_disponible === false ? 'text-red-500' : 'text-kalian-gold'}`}>
                          {c.aforo_disponible === false ? 'SIN PLAZAS' : 'LIBRES'}
                        </p>
                        <p className="text-[8px] font-black uppercase text-kalian-gold/30 tracking-widest">Disponibilidad</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl kalian-poster-text text-kalian-cream">{c.precio}€</p>
                        <p className="text-[8px] font-black uppercase text-kalian-gold/30 tracking-widest">Al Mes</p>
                      </div>
                      <span className={`text-2xl text-kalian-gold transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`}>↓</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-10 pb-10 pt-6 border-t border-kalian-gold/5 animate-in slide-in-from-top-4 duration-500">
                      <div className="grid md:grid-cols-2 gap-12 mb-10">
                        <div className="space-y-6">
                          <div className="space-y-1">
                            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">Horario y Profesor</p>
                            <p className="text-kalian-cream/90 font-bold uppercase text-sm">{c.horario || 'Consultar en el centro'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">Vigencia del Curso</p>
                            <p className="text-kalian-cream/90 font-bold uppercase text-sm">{new Date(c.fechaInicio).toLocaleDateString()} al {new Date(c.fechaFin).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="bg-kalian-gold/5 p-8 rounded-3xl border border-kalian-gold/10">
                          <p className="text-sm text-kalian-gold/70 italic leading-relaxed">"Este curso otorga la condición de <b>Socio {c.categoria.toUpperCase()}</b> hasta la fecha de finalización, permitiendo el acceso gratuito a eventos de la misma categoría."</p>
                        </div>
                      </div>

                      <button 
                        onClick={() => setItemSeleccionado(c)}
                        disabled={c.aforo_disponible === false}
                        className={`w-full p-6 rounded-2xl kalian-poster-text text-xl tracking-widest transition-all shadow-2xl ${c.aforo_disponible === false ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-kalian-gold text-black hover:bg-white shadow-kalian-gold/20'}`}
                      >
                        {c.aforo_disponible === false ? 'CURSO CERRADO' : 'Inscribirse al Curso'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* MODAL RESERVA */}
      {itemSeleccionado && (
        <div className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-md flex items-center justify-center p-6 z-[1000] animate-in fade-in duration-500">
          <div className="w-full max-w-2xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl overflow-hidden">
            <ReservaForm item={itemSeleccionado} alCerrar={() => setItemSeleccionado(null)} />
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
            <img 
              src={posterSeleccionado} 
              alt="Cartel del evento" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              referrerPolicy="no-referrer"
            />
            <button 
              className="absolute top-0 right-0 m-4 bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-full flex items-center justify-center transition-all"
              onClick={() => setPosterSeleccionado(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeSocio;
