import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, DocumentData } from 'firebase/firestore';
import ReservaForm from './ReservaForm';

const HomePublica = () => {
  const { role } = useAuth();
  const [eventos, setEventos] = useState<DocumentData[]>([]);
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [itemSeleccionado, setItemSeleccionado] = useState<any | null>(null);
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
    <div className="min-h-screen bg-slate-950 text-white font-sans pb-20">
      {/* HERO */}
      <div className="p-10 md:p-20 text-center space-y-6">
        <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter leading-none">
          Kalian <span className="text-indigo-500">HKG</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-medium tracking-widest uppercase italic">Centro Cultural & Asociación Musical</p>
      </div>

      <div className="max-w-6xl mx-auto px-6 space-y-16">
        
        {/* SECCIÓN EVENTOS */}
        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter">Próximos <span className="text-indigo-500">Eventos</span></h2>
            <div className="h-[2px] flex-1 bg-white/10"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventos.map(ev => (
              <div 
                key={ev.id} 
                className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 space-y-6 hover:bg-white/10 transition-all group cursor-pointer"
                onClick={() => setItemSeleccionado(ev)}
              >
                <div className="flex justify-between items-start">
                  <span className="bg-indigo-600 text-white text-[9px] font-black uppercase px-3 py-1 rounded-full">{ev.categoria}</span>
                  <span className="text-indigo-400 font-black italic text-xl">{ev.precio_base}€</span>
                </div>
                <h3 className="text-2xl font-black uppercase italic leading-none group-hover:text-indigo-400 transition-colors">{ev.titulo}</h3>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fecha y Hora</p>
                  <p className="font-bold text-slate-200 uppercase">{new Date(ev.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <button className="w-full bg-white text-slate-950 p-4 rounded-2xl font-black uppercase text-xs tracking-widest group-hover:bg-indigo-500 group-hover:text-white transition-all">Reservar Plaza</button>
              </div>
            ))}
          </div>
        </section>

        {/* SECCIÓN CURSOS (Expandibles) */}
        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter">Academia <span className="text-emerald-500">Kalian</span></h2>
            <div className="h-[2px] flex-1 bg-white/10"></div>
          </div>

          <div className="space-y-4">
            {cursos.map(c => {
              const isFull = c.aforo_actual >= c.aforo_total;
              const isExpanded = expandido === c.id;

              return (
                <div 
                  key={c.id} 
                  className={`bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden transition-all duration-500 ${isExpanded ? 'ring-2 ring-emerald-500' : ''}`}
                >
                  {/* VISTA CERRADA */}
                  <div 
                    className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-6 cursor-pointer"
                    onClick={() => setExpandido(isExpanded ? null : c.id)}
                  >
                    <div className="flex items-center gap-6 w-full md:w-auto">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl ${c.categoria === 'danza' ? 'bg-emerald-500/20' : 'bg-indigo-500/20'}`}>
                        {c.categoria === 'danza' ? '💃' : '🎸'}
                      </div>
                      <div>
                        <h3 className="text-2xl font-black uppercase italic leading-none">{c.titulo}</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Categoría: {c.categoria}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                      <div className="text-center">
                        <p className={`text-2xl font-black italic ${isFull ? 'text-red-500' : 'text-emerald-400'}`}>
                          {isFull ? 'AGOTADO' : `${c.aforo_total - c.aforo_actual}`}
                        </p>
                        <p className="text-[8px] font-black uppercase text-slate-500">Plazas Libres</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black italic text-white">{c.precio}€</p>
                        <p className="text-[8px] font-black uppercase text-slate-500">Al Mes</p>
                      </div>
                      <span className={`text-xl transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>↓</span>
                    </div>
                  </div>

                  {/* VISTA EXPANDIDA */}
                  {isExpanded && (
                    <div className="px-8 pb-8 pt-4 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                      <div className="grid md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Horario y Profesor</p>
                            <p className="text-slate-200 font-bold uppercase">{c.horario || 'Consultar en el centro'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Vigencia del Curso</p>
                            <p className="text-slate-200 font-bold uppercase">{new Date(c.fechaInicio).toLocaleDateString()} al {new Date(c.fechaFin).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                          <p className="text-sm text-slate-400 italic">"Este curso otorga la condición de <b>Socio {c.categoria.toUpperCase()}</b> hasta la fecha de finalización, permitiendo el acceso gratuito a eventos de la misma categoría."</p>
                        </div>
                      </div>

                      <button 
                        onClick={() => setItemSeleccionado(c)}
                        className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/20"
                      >
                        Consultar Disponibilidad
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
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6 z-[1000] animate-in fade-in duration-300">
          <ReservaForm item={itemSeleccionado} alCerrar={() => setItemSeleccionado(null)} />
        </div>
      )}
    </div>
  );
};

export default HomePublica;
