import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, DocumentData, addDoc, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ReservaForm from '../components/public/ReservaForm';
import NewsletterForm from '../components/public/NewsletterForm';
import LegalModal from '../components/public/LegalModal';
import KalianHeader from '../components/shared/KalianHeader';
import EventCard from '../components/shared/EventCard';
import SectionTitle from '../components/shared/SectionTitle';

const ProgramacionPublica = () => {
  const { socioData } = useAuth();
  const { t } = useLanguage();
  const [eventos, setEventos] = useState<DocumentData[]>([]);
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [locales, setLocales] = useState<DocumentData[]>([]);
  const [academias, setAcademias] = useState<DocumentData[]>([]);
  const [exposiciones, setExposiciones] = useState<DocumentData[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [cursoDetalle, setCursoDetalle] = useState<any | null>(null);
  const [itemSeleccionado, setItemSeleccionado] = useState<any | null>(null);
  const [posterSeleccionado, setPosterSeleccionado] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [solicitudCurso, setSolicitudCurso] = useState<{ curso: any, tipo: 'consulta' | 'solicitud_inscripcion', modalidad?: any } | null>(null);
  const [formSolicitud, setFormSolicitud] = useState({ nombre: '', email: '', telefono: '', dni: '', mensaje: '', especialidad: '', aceptoTerminos: false });
  const [modalidadSeleccionada, setModalidadSeleccionada] = useState<{ [cursoId: string]: any }>({});
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [mensajeSolicitud, setMensajeSolicitud] = useState('');
  const [showLegal, setShowLegal] = useState(false);

  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [subcategoriaActiva, setSubcategoriaActiva] = useState<string | null>(null);
  const cursosListRef = useRef<HTMLDivElement>(null);

  const [errorSeleccion, setErrorSeleccion] = useState<string | null>(null);


  const formatMeses = (inicio: string, fin: string) => {
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    try {
      const dInicio = new Date(inicio);
      const dFin = new Date(fin);
      if (isNaN(dInicio.getTime()) || isNaN(dFin.getTime())) return "Fecha no disponible";
      return `${meses[dInicio.getMonth()]} - ${meses[dFin.getMonth()]}`;
    } catch (e) {
      return "Fecha no disponible";
    }
  };

  useEffect(() => {
    const hoy = new Date().toISOString();

    // Listen to events
    const qE = query(collection(db, "eventos"), orderBy("fecha", "asc"));
    const unsubE = onSnapshot(qE, (snap) => {
      setEventos(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(ev => ev.fecha >= hoy && ev.es_publico !== false));
    }, (err) => {
      console.error("ProgramacionPublica: Error en eventos onSnapshot:", err.message);
    });

    // Listen to courses
    const qC = collection(db, "cursos");
    const unsubC = onSnapshot(qC, (snap) => {
      const hoyStr = new Date().toISOString().split('T')[0];
      const allCursos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Solo mostramos cursos que no han terminado (fin >= hoy)
      const filtered = allCursos.filter((c: any) => !c.deletedAt && (!c.fechaFin || c.fechaFin >= hoyStr));
      // Ordenar por fechaInicio en memoria
      filtered.sort((a: any, b: any) => {
        const dateA = a.fechaInicio || '';
        const dateB = b.fechaInicio || '';
        return dateA.localeCompare(dateB);
      });
      setCursos(filtered);
    }, (err) => {
      console.error("ProgramacionPublica: Error en cursos onSnapshot:", err.message);
    });

    // Listen to academies
    const qA = query(collection(db, "academias"), orderBy("orden", "asc"));
    const unsubA = onSnapshot(qA, (snap) => {
      setAcademias(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(a => a.activo));
    }, (err) => {
      console.error("ProgramacionPublica: Error en academias onSnapshot:", err.message);
    });

    // Listen to exhibitions
    const qExpo = query(collection(db, "exposiciones"), orderBy("fechaInicio", "desc"));
    const unsubExpo = onSnapshot(qExpo, (snap) => {
      setExposiciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("ProgramacionPublica: Error en exposiciones onSnapshot:", err.message);
    });

    // Listen to locales (Real-time)
    const unsubL = onSnapshot(collection(db, "locales"), (snap) => {
      setLocales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("ProgramacionPublica: Error en locales onSnapshot:", err.message);
    });

    // Fetch config
    const fetchConfigData = async () => {
      try {
        const snapConfig = await getDoc(doc(db, "config", "site"));
        if (snapConfig.exists()) setConfig(snapConfig.data());
      } catch (err) {
        console.error("ProgramacionPublica: Error fetching config:", err);
      }
    };
    fetchConfigData();

    return () => {
      unsubE();
      unsubC();
      unsubA();
      unsubExpo();
      unsubL();
    };
  }, []);

  // Scroll automático al seleccionar subcategoría
  useEffect(() => {
    if (subcategoriaActiva && cursosListRef.current) {
      const yOffset = -100; // Ajuste para que el encabezado no quede pegado al borde superior
      const element = cursosListRef.current;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }, [subcategoriaActiva]);

  const enviarSolicitud = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoSolicitud(true);
    try {
      await addDoc(collection(db, "solicitudes_cursos"), {
        ...formSolicitud,
        cursoId: solicitudCurso.curso.id,
        cursoTitulo: solicitudCurso.curso.titulo,
        categoria: solicitudCurso.curso.categoria,
        subcategoria: solicitudCurso.curso.subcategoria,
        modalidad: solicitudCurso.modalidad,
        tipo: solicitudCurso.tipo,
        fechaSolicitud: new Date().toISOString(),
        estado: 'pendiente'
      });
      setMensajeSolicitud(solicitudCurso.tipo === 'consulta' 
        ? "✅ Tu solicitud de información ha sido enviada. Te contactaremos pronto."
        : "✅ Tu solicitud de inscripción ha sido recibida. El equipo de Kalian validará tus datos y te contactará para finalizar el alta.");
      
      setTimeout(() => {
        setSolicitudCurso(null);
        setMensajeSolicitud('');
        setFormSolicitud({ nombre: '', email: '', telefono: '', dni: '', mensaje: '', especialidad: '', aceptoTerminos: false });
      }, 5000);
    } catch (err) {
      console.error(err);
      alert("Error al enviar la solicitud");
    } finally {
      setEnviandoSolicitud(false);
    }
  };

  const localesLibres = locales.filter(l => 
    (l.estado || '').toLowerCase() === 'disponible' && 
    (l.alquilado === false || l.alquilado === undefined || l.alquilado === null)
  );
  const hayLocalesLibres = localesLibres.length > 0;

  const hoy = new Date().toISOString().split('T')[0];
  const expoActual = exposiciones.find(e => e.fechaInicio <= hoy && (e.fechaFin ? e.fechaFin >= hoy : true));
  const exposProximas = exposiciones.filter(e => e.fechaInicio > hoy).sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));

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
      return `${t('home.openReservations')}: ${aperturaSocios.toLocaleDateString()}`;
    }
    if (aperturaGral && hoy < aperturaGral) {
      return `Apertura General: ${aperturaGral.toLocaleDateString()}`;
    }
    return "Apertura 7 días antes";
  };

  return (
    <div className="min-h-screen bg-kalian-dark text-kalian-cream font-sans pb-20">
      {/* SHARED HEADER */}
      <KalianHeader showPanelButton={false} />

      <div className="max-w-6xl mx-auto px-6 space-y-32">
        
        {/* EVENTOS */}
        <section className="space-y-12">
          <SectionTitle title="PRÓXIMOS" subtitle="EVENTOS" color={config?.titleColor} />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {eventos.map(ev => (
              <EventCard 
                key={ev.id}
                event={ev}
                isSocio={!!socioData}
                isReservaAbierta={esReservaAbierta(ev)}
                mensajeApertura={getMensajeApertura(ev)}
                onClick={(item) => setItemSeleccionado(item)}
                onViewPoster={(url) => setPosterSeleccionado(url)}
              />
            ))}
          </div>
        </section>

        {/* CURSOS Y TALLERES */}
        <section className="space-y-12">
          <SectionTitle title="KALIAN" subtitle="CLUB" color={config?.titleColor} />

          {!categoriaActiva ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {academias.map((aca, idx) => (
                <motion.div 
                  key={aca.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.03 }}
                  onClick={() => setCategoriaActiva(aca.nombre)}
                  className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] p-12 text-center space-y-6 cursor-pointer hover:border-kalian-gold/40 transition-all group relative overflow-hidden shadow-xl hover:shadow-kalian-gold/5"
                >
                  <div className="absolute inset-0 bg-kalian-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                  
                  {/* Imagen de la academia */}
                  <div className="w-32 h-32 mx-auto rounded-3xl overflow-hidden border border-kalian-gold/20 group-hover:scale-110 transition-transform duration-500 shadow-2xl">
                    <img src={aca.imageUrl} alt={aca.nombre} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>

                  <h3 className={`text-5xl kalian-poster-text uppercase italic ${idx % 2 === 0 ? 'text-kalian-gold' : 'text-kalian-cream'}`}>
                    {aca.nombre}
                  </h3>
                  <p className={`${idx % 2 === 0 ? 'text-kalian-cream/60' : 'text-kalian-gold/60'} text-[10px] font-black uppercase tracking-[0.4em] leading-relaxed`}>
                    {aca.subcategorias?.join(' • ') || 'Especialidades Kalian'}
                  </p>
                  <div className="pt-4">
                    <span className={`${idx % 2 === 0 ? 'text-kalian-gold/40 group-hover:text-kalian-gold' : 'text-kalian-cream/40 group-hover:text-kalian-cream'} text-[9px] font-black uppercase tracking-[0.5em] transition-colors`}>
                      Seleccionar Categoría →
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : !subcategoriaActiva ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-center">
                <button 
                  onClick={() => setCategoriaActiva(null)}
                  className="text-kalian-gold font-black uppercase text-[10px] tracking-[0.4em] flex items-center gap-2 hover:text-white transition-colors group"
                >
                  <span className="group-hover:-translate-x-2 transition-transform">←</span> VOLVER A CATEGORÍAS
                </button>
                <h3 className="text-3xl kalian-poster-text text-kalian-gold uppercase italic">
                  {academias.find(a => a.nombre === categoriaActiva)?.nombre}
                </h3>
              </div>

              <div className="text-center space-y-12">
                {/* Cartel de la categoría */}
                {academias.find(a => a.nombre === categoriaActiva)?.imageUrl && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md mx-auto rounded-[2rem] overflow-hidden border border-kalian-gold/20 shadow-2xl"
                  >
                    <img 
                      src={academias.find(a => a.nombre === categoriaActiva)?.imageUrl} 
                      alt={academias.find(a => a.nombre === categoriaActiva)?.nombre} 
                      className="w-full h-auto object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                )}

                <p className="text-kalian-gold/40 text-[12px] font-black uppercase tracking-[0.6em]">Selecciona una especialidad</p>
                <div className="flex flex-wrap justify-center gap-6">
                  {(academias.find(a => a.nombre === categoriaActiva)?.subcategorias || []).map((sub: string) => (
                    <motion.button
                      key={sub}
                      whileHover={{ scale: 1.1, rotate: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSubcategoriaActiva(sub)}
                      className="px-12 py-6 bg-black/60 border border-kalian-gold/30 rounded-[2rem] kalian-poster-text text-2xl tracking-widest hover:bg-kalian-gold hover:text-black transition-all uppercase italic shadow-2xl"
                    >
                      {sub}
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-center">
                <button 
                  onClick={() => setSubcategoriaActiva(null)}
                  className="text-kalian-gold font-black uppercase text-[10px] tracking-[0.4em] flex items-center gap-2 hover:text-white transition-colors group"
                >
                  <span className="group-hover:-translate-x-2 transition-transform">←</span> CAMBIAR ESPECIALIDAD
                </button>
                <div className="text-right">
                  <h3 className="text-2xl kalian-poster-text text-kalian-gold uppercase italic leading-none">
                    {academias.find(a => a.nombre === categoriaActiva)?.nombre}
                  </h3>
                  <p className="text-[10px] font-black text-kalian-cream/40 uppercase tracking-widest mt-1">{subcategoriaActiva}</p>
                </div>
              </div>

              <div className="space-y-8" ref={cursosListRef}>
                {cursos.filter(c => {
                  const catMatch = c.categoria === categoriaActiva || 
                                 academias.find(a => a.id === c.categoria)?.nombre === categoriaActiva ||
                                 academias.find(a => a.nombre === c.categoria)?.id === academias.find(a => a.nombre === categoriaActiva)?.id;
                  
                  const subMatch = c.subcategoria?.trim().toLowerCase() === subcategoriaActiva?.trim().toLowerCase();
                  
                  return catMatch && subMatch;
                }).length > 0 ? (
                  cursos.filter(c => {
                    const catMatch = c.categoria === categoriaActiva || 
                                   academias.find(a => a.id === c.categoria)?.nombre === categoriaActiva ||
                                   academias.find(a => a.nombre === c.categoria)?.id === academias.find(a => a.nombre === categoriaActiva)?.id;
                    
                    const subMatch = c.subcategoria?.trim().toLowerCase() === subcategoriaActiva?.trim().toLowerCase();
                    
                    return catMatch && subMatch;
                  }).map(c => {
                    return (
                      <motion.div 
                        key={c.id} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ scale: 1.01, x: 10 }}
                        className="bg-black/40 border border-kalian-gold/10 rounded-[2.5rem] overflow-hidden transition-all duration-500 hover:border-kalian-gold/40 cursor-pointer shadow-xl hover:shadow-kalian-gold/5"
                        onClick={() => setCursoDetalle(c)}
                      >
                        <div 
                          className="p-10 md:p-12 flex flex-col md:flex-row justify-between items-center gap-8 group"
                        >
                          <div className="flex items-center gap-10 w-full md:w-auto">
                            <div className="w-24 h-24 rounded-[2rem] flex items-center justify-center text-5xl border border-kalian-gold/10 bg-kalian-gold/10">
                              {(academias.find(a => a.id === c.categoria || a.nombre === c.categoria)?.nombre || "").toLowerCase().includes('danza') ? '💃' : '🎸'}
                            </div>
                            <div>
                              <h3 className="text-4xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors leading-tight uppercase italic">{c.titulo}</h3>
                              <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.4em] mt-4">Categoría: {c.categoria} • {c.subcategoria}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-16 w-full md:w-auto justify-between md:justify-end">
                            <div className="text-center">
                              <p className={`text-4xl kalian-poster-text ${c.aforo_disponible === false ? 'text-red-500' : 'text-kalian-gold'}`}>
                                {c.aforo_disponible === false ? 'AGOTADO' : 'HAY PLAZAS'}
                              </p>
                              <p className="text-[9px] font-black uppercase text-kalian-gold/30 tracking-[0.2em] mt-1">Disponibilidad</p>
                            </div>
                            <div className="text-right">
                              <p className="text-4xl kalian-poster-text text-kalian-cream">
                                {c.modalidades && c.modalidades.length > 0 
                                  ? `Desde ${Math.min(...c.modalidades.map((m: any) => m.precio))}€/mes` 
                                  : `${c.precio || 0}€/mes`}
                              </p>
                              <p className="text-[9px] font-black uppercase text-kalian-gold/80 tracking-[0.2em] mt-1">Aportación</p>
                            </div>
                            <span className="text-3xl text-kalian-gold group-hover:translate-x-4 transition-transform duration-500">→</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="col-span-full bg-kalian-gold/5 border border-kalian-gold/10 border-dashed rounded-[3rem] p-20 text-center space-y-6">
                    <div className="text-6xl mb-4 opacity-40">⏳</div>
                    <h3 className="text-3xl kalian-poster-text text-kalian-gold/40 uppercase italic tracking-widest">Próximamente más cursos en esta sección</h3>
                    <p className="text-kalian-gold/20 font-black uppercase text-xs tracking-[0.5em]">Estamos actualizando nuestra oferta académica</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </section>

        {/* KALIAN GALLERY */}
        <section className="space-y-12">
          <SectionTitle title="KALIAN" subtitle="GALLERY" color={config?.titleColor} />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* EXPOSICIÓN ACTUAL (DESTACADA) */}
            <motion.div 
              whileHover={{ scale: 1.01 }}
              className="lg:col-span-2 bg-black/40 border border-kalian-gold/20 rounded-[3rem] overflow-hidden group relative shadow-2xl min-h-[400px]"
            >
              {expoActual ? (
                <Link to="/galeria" className="block h-full">
                  <div className="absolute inset-0">
                    <img 
                      src={expoActual.imagenUrl} 
                      alt={expoActual.titulo} 
                      className="w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-all duration-700 group-hover:scale-105" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                  </div>
                  <div className="relative z-10 p-12 h-full flex flex-col justify-end space-y-4">
                    <span className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.6em] animate-pulse">EXPOSICIÓN ACTUAL</span>
                    <h3 className="text-5xl md:text-7xl kalian-poster-text text-kalian-gold uppercase italic leading-none tracking-tighter">{expoActual.titulo}</h3>
                    <p className="text-xl font-black text-kalian-cream/80 uppercase tracking-widest italic">Autor/a: {expoActual.autor}</p>
                    <div className="pt-6">
                      <span className="inline-block bg-kalian-gold text-black px-8 py-3 rounded-xl kalian-poster-text text-sm tracking-widest hover:bg-white transition-all">
                        VER EXPOSICIÓN →
                      </span>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
                  <div className="text-6xl opacity-20">🖼️</div>
                  <h3 className="text-3xl kalian-poster-text text-kalian-gold/40 uppercase italic">Próximamente nueva exposición</h3>
                  <Link to="/galeria" className="text-kalian-gold font-black uppercase text-[10px] tracking-[0.4em] hover:text-white transition-colors">EXPLORAR ARCHIVO →</Link>
                </div>
              )}
            </motion.div>

            {/* PRÓXIMAS EXPOSICIONES (LISTA) */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-4">
                <h4 className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.4em]">Próximamente</h4>
                <Link to="/galeria" className="text-[8px] font-black text-kalian-cream/40 uppercase tracking-widest hover:text-kalian-gold transition-colors">Ver todas</Link>
              </div>
              
              <div className="space-y-4">
                {exposProximas.length > 0 ? (
                  exposProximas.slice(0, 3).map(expo => (
                    <motion.div 
                      key={expo.id}
                      whileHover={{ x: 10 }}
                      className="bg-kalian-gold/5 border border-kalian-gold/10 rounded-3xl p-6 flex items-center gap-6 group cursor-pointer"
                    >
                      <div className="w-16 h-20 flex-shrink-0 rounded-xl overflow-hidden border border-kalian-gold/20">
                        <img src={expo.imagenUrl} alt={expo.titulo} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] font-black text-kalian-gold/60 uppercase tracking-widest mb-1">
                          {new Date(expo.fechaInicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </p>
                        <h5 className="text-lg kalian-poster-text text-kalian-cream uppercase italic truncate">{expo.titulo}</h5>
                        <p className="text-[9px] font-black text-kalian-cream/40 uppercase tracking-widest truncate">{expo.autor}</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="bg-kalian-gold/5 border border-kalian-gold/10 border-dashed rounded-3xl p-10 text-center">
                    <p className="text-[9px] font-black text-kalian-gold/20 uppercase tracking-widest">No hay exposiciones programadas</p>
                  </div>
                )}
                
                <Link 
                  to="/galeria"
                  className="block w-full py-5 bg-kalian-gold/10 border border-kalian-gold/20 rounded-2xl text-center kalian-poster-text text-kalian-gold text-sm tracking-widest hover:bg-kalian-gold hover:text-black transition-all"
                >
                  VER GALERÍA COMPLETA
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* KALIAN HUB */}
        <section className="space-y-12">
          <SectionTitle title="KALIAN" subtitle="HUB" color={config?.titleColor} />
          
          <motion.div 
            whileHover={{ scale: 1.02, y: -5 }}
            className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] p-12 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl hover:border-kalian-gold/30 transition-all relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-kalian-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            
            <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
              <div className="w-32 h-32 flex-shrink-0 rounded-2xl overflow-hidden border border-kalian-gold/20 shadow-2xl">
                {config?.hubImageUrl ? (
                  <img src={config.hubImageUrl} alt="Hub" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full bg-kalian-gold/10 flex items-center justify-center text-5xl">🏢</div>
                )}
              </div>
              <div className="space-y-4 text-center md:text-left">
                <h3 className="text-3xl kalian-poster-text text-kalian-cream uppercase italic">¿Buscas un espacio para ensayar / crear / diseñar…?</h3>
                <p className="text-kalian-cream/60 text-sm max-w-md leading-relaxed">
                  Consulta la disponibilidad actual para unirte a nuestra comunidad.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-4 relative z-10">
              <div className={`px-10 py-6 rounded-3xl border-2 kalian-poster-text text-3xl tracking-widest ${hayLocalesLibres ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-red-500/30 bg-red-500/10 text-red-500'}`}>
                {hayLocalesLibres ? 'HAY DISPONIBILIDAD' : 'SIN DISPONIBILIDAD'}
              </div>
              <p className="text-[9px] font-black uppercase text-kalian-gold/40 tracking-[0.4em]">
                {hayLocalesLibres 
                  ? `Disponemos de ${localesLibres.length} locales libres actualmente`
                  : "Actualmente todos nuestros locales están ocupados. ¡Suscríbete para recibir avisos de próximas vacantes!"}
              </p>
            </div>
          </motion.div>
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

        {/* SECCIÓN CONTACTO */}
        <section>
          <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] p-12 text-center space-y-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-kalian-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            <div className="relative z-10 space-y-4">
              <h2 className="text-4xl kalian-poster-text text-kalian-gold uppercase italic">¿Necesitas <span className="text-kalian-cream">Ayuda?</span></h2>
              <p className="text-kalian-gold/40 text-[10px] font-black uppercase tracking-[0.4em]">Estamos a tu disposición para cualquier consulta</p>
            </div>
            
            <div className="relative z-10 flex flex-col items-center gap-6">
              <p className="text-kalian-cream/70 text-sm max-w-md mx-auto leading-relaxed">
                Si tienes dudas sobre las reservas, quieres proponer una actividad o necesitas información sobre la asociación, no dudes en escribirnos.
              </p>
              <a 
                href="mailto:info@kalian.es"
                className="bg-kalian-gold text-black px-12 py-5 rounded-2xl kalian-poster-text text-2xl tracking-[0.1em] hover:bg-white transition-all shadow-xl shadow-kalian-gold/20 flex items-center gap-4 group/btn"
              >
                CONTACTAR POR EMAIL
                <span className="group-hover/btn:translate-x-2 transition-transform duration-300">✉️</span>
              </a>
              <p className="text-kalian-gold/30 font-mono text-[10px] tracking-widest">info@kalian.es</p>
            </div>
          </div>
        </section>
      </div>

      {/* MODAL DETALLE CURSO */}
      <AnimatePresence>
        {cursoDetalle && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-md flex items-center justify-center p-4 z-[1100] overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-3xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl p-8 md:p-16 relative my-auto"
            >
              <button onClick={() => setCursoDetalle(null)} className="absolute top-8 right-8 text-kalian-gold/90 font-black text-2xl hover:text-kalian-gold transition-colors hover:rotate-90 duration-300">✕</button>
              
              <div className="space-y-10">
                <div className="space-y-4">
                  <span className="text-[12px] font-black uppercase text-kalian-gold/80 tracking-[0.6em]">{cursoDetalle.categoria} • {cursoDetalle.subcategoria}</span>
                  <h2 className="text-6xl kalian-poster-text text-kalian-gold leading-none uppercase italic">{cursoDetalle.titulo}</h2>
                  <div className="flex flex-wrap items-center gap-6 pt-2">
                    <p className="text-sm font-black text-kalian-cream/60 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-full border border-white/10">{cursoDetalle.horario}</p>
                    <p className="text-sm font-black text-kalian-cream/60 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-full border border-white/10">{cursoDetalle.profesorNombre || 'Pendiente de asignar'}</p>
                  </div>
                </div>

                <div className="space-y-8">
                  {/* BLOQUE IMPORTANTE */}
                  <div className="bg-kalian-gold/10 p-8 rounded-[2rem] border border-kalian-gold/20 shadow-inner">
                    <p className="text-[12px] font-black text-kalian-gold uppercase tracking-[0.4em] mb-4 flex items-center gap-2">
                      <span className="text-xl">★</span> IMPORTANTE
                    </p>
                    <p className="text-sm text-kalian-cream/90 italic leading-relaxed">
                      {cursoDetalle.ventajas || `Este curso incluye el alta como soci@ de la asociación KALIAN y acceso a descuentos en actividades de la misma categoría.`}
                    </p>
                  </div>

                  {/* DESCRIPCIÓN DEL CURSO */}
                  {cursoDetalle.descripcion && (
                    <div className="space-y-4">
                      <p className="text-[12px] font-black text-kalian-gold/60 uppercase tracking-[0.4em]">Descripción del curso</p>
                      <p className="text-base text-kalian-cream/80 leading-relaxed font-medium">
                        {cursoDetalle.descripcion}
                      </p>
                    </div>
                  )}

                  {/* MODALIDADES DE PRECIO */}
                  <div className="space-y-6">
                    <p className="text-[12px] font-black text-kalian-gold/60 uppercase tracking-[0.4em]">Modalidades de Aportación</p>
                    <div className="bg-black/40 rounded-[2rem] overflow-hidden border border-kalian-gold/10 shadow-2xl">
                      <table className="w-full text-left text-[11px] uppercase tracking-[0.2em] font-black">
                        <thead>
                          <tr className="bg-kalian-gold/10 text-kalian-gold border-b border-kalian-gold/20">
                            <th className="p-6 w-12"></th>
                            <th className="p-6">Tipo</th>
                            <th className="p-6">Frecuencia</th>
                            <th className="p-6 text-right">Aportación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-kalian-gold/10">
                          {cursoDetalle.modalidades?.map((m: any, i: number) => {
                            const isSelected = modalidadSeleccionada[cursoDetalle.id]?.tipo === m.tipo && 
                                             modalidadSeleccionada[cursoDetalle.id]?.frecuencia === m.frecuencia &&
                                             modalidadSeleccionada[cursoDetalle.id]?.precio === m.precio;
                            
                            return (
                              <tr 
                                key={i} 
                                className={`text-kalian-cream/90 cursor-pointer hover:bg-white/10 transition-all ${isSelected ? 'bg-kalian-gold/10' : ''}`}
                                onClick={() => {
                                  setModalidadSeleccionada({ ...modalidadSeleccionada, [cursoDetalle.id]: m });
                                  setErrorSeleccion(null);
                                }}
                              >
                                <td className="p-6">
                                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-kalian-gold bg-kalian-gold' : 'border-white/20'}`}>
                                    {isSelected && <div className="w-2.5 h-2.5 bg-black rounded-full"></div>}
                                  </div>
                                </td>
                                <td className="p-6">{m.tipo}</td>
                                <td className="p-6">{m.frecuencia}</td>
                                <td className="p-6 text-right font-black text-kalian-gold text-lg">{m.precio}€/mes</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {errorSeleccion && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl"
                  >
                    <p className="text-red-500 text-center font-black uppercase text-[12px] tracking-widest">
                      ⚠️ {errorSeleccion}
                    </p>
                  </motion.div>
                )}

                <div className="flex flex-col md:flex-row gap-6 pt-6">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const mod = modalidadSeleccionada[cursoDetalle.id];
                      if (!mod) {
                        setErrorSeleccion("Por favor, selecciona una modalidad de la tabla superior para poder informarte.");
                        return;
                      }
                      setSolicitudCurso({ curso: cursoDetalle, tipo: 'consulta', modalidad: mod });
                      setCursoDetalle(null);
                      setErrorSeleccion(null);
                    }}
                    className="flex-1 bg-kalian-gold/10 text-kalian-gold border border-kalian-gold/30 p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-kalian-gold/20 transition-all shadow-lg"
                  >
                    Solicitar Info
                  </motion.button>
                  <motion.button 
                    whileHover={cursoDetalle.aforo_disponible !== false ? { scale: 1.02 } : {}}
                    whileTap={cursoDetalle.aforo_disponible !== false ? { scale: 0.98 } : {}}
                    onClick={() => {
                      const mod = modalidadSeleccionada[cursoDetalle.id];
                      if (!mod) {
                        setErrorSeleccion("Por favor, selecciona una modalidad de la tabla superior para realizar la inscripción.");
                        return;
                      }
                      setSolicitudCurso({ curso: cursoDetalle, tipo: 'solicitud_inscripcion', modalidad: mod });
                      setCursoDetalle(null);
                      setErrorSeleccion(null);
                    }}
                    disabled={cursoDetalle.aforo_disponible === false}
                    className={`flex-1 p-6 rounded-2xl kalian-poster-text text-xl tracking-widest transition-all shadow-2xl ${cursoDetalle.aforo_disponible === false ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-kalian-gold text-black hover:bg-white shadow-kalian-gold/20'}`}
                  >
                    {cursoDetalle.aforo_disponible === false ? 'CURSO CERRADO' : 'Inscribirse Ahora'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL RESERVA EVENTO */}
      <AnimatePresence>
        {itemSeleccionado && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-md flex items-center justify-center p-6 z-[1000]"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <ReservaForm item={itemSeleccionado} alCerrar={() => setItemSeleccionado(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL SOLICITUD CURSO */}
      <AnimatePresence>
        {solicitudCurso && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-md flex items-center justify-center p-6 z-[1000]"
          >
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="w-full max-w-xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl p-10 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-kalian-gold"></div>
              <button onClick={() => setSolicitudCurso(null)} className="absolute top-8 right-8 text-kalian-gold/90 font-black text-2xl hover:text-kalian-gold transition-colors">✕</button>
              
              <h2 className="text-4xl kalian-poster-text text-kalian-gold leading-none mb-2 tracking-tight uppercase italic">{solicitudCurso.curso.titulo}</h2>
              <div className="flex justify-between items-center mb-10">
                <p className="text-[10px] font-black text-kalian-gold/90 uppercase tracking-[0.3em]">
                  {solicitudCurso.tipo === 'consulta' ? 'Solicitud de Información' : 'Formulario de Inscripción'}
                </p>
                <p className="text-[10px] font-black text-kalian-cream uppercase tracking-widest bg-kalian-gold/10 px-3 py-1 rounded-full border border-kalian-gold/20">
                  {solicitudCurso.modalidad?.tipo} | {solicitudCurso.modalidad?.frecuencia} | {solicitudCurso.modalidad?.precio}€/mes
                </p>
              </div>

              {mensajeSolicitud ? (
                <div className="bg-kalian-gold/5 border border-kalian-gold/20 text-kalian-gold p-12 rounded-[2.5rem] text-center font-black kalian-poster-text text-2xl animate-in fade-in zoom-in italic">
                  {mensajeSolicitud}
                </div>
              ) : (
                <form onSubmit={enviarSolicitud} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-kalian-gold/90 uppercase tracking-[0.3em] ml-4">Nombre Completo</label>
                      <input type="text" placeholder="TU NOMBRE" className="w-full p-4 bg-kalian-gold/10 rounded-xl border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold placeholder:text-kalian-cream/50" value={formSolicitud.nombre} onChange={e => setFormSolicitud({...formSolicitud, nombre: e.target.value})} required />
                    </div>
                    {solicitudCurso.tipo === 'solicitud_inscripcion' && (
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-kalian-gold/90 uppercase tracking-[0.3em] ml-4">DNI</label>
                        <input type="text" placeholder="DNI" className="w-full p-4 bg-kalian-gold/10 rounded-xl border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold placeholder:text-kalian-cream/50" value={formSolicitud.dni} onChange={e => setFormSolicitud({...formSolicitud, dni: e.target.value.toUpperCase()})} required />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-kalian-gold/90 uppercase tracking-[0.3em] ml-4">Email</label>
                      <input type="email" placeholder="tu@email.com" className="w-full p-4 bg-kalian-gold/10 rounded-xl border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold placeholder:text-kalian-cream/50" value={formSolicitud.email} onChange={e => setFormSolicitud({...formSolicitud, email: e.target.value})} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-kalian-gold/90 uppercase tracking-[0.3em] ml-4">Teléfono</label>
                      <input type="tel" placeholder="600 000 000" className="w-full p-4 bg-kalian-gold/10 rounded-xl border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold placeholder:text-kalian-cream/50" value={formSolicitud.telefono} onChange={e => setFormSolicitud({...formSolicitud, telefono: e.target.value})} required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-kalian-gold/90 uppercase tracking-[0.3em] ml-4">Mensaje (Opcional)</label>
                    <textarea placeholder="¿TIENES ALGUNA DUDA?" className="w-full p-4 bg-kalian-gold/10 rounded-xl border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold h-24 placeholder:text-kalian-cream/50" value={formSolicitud.mensaje} onChange={e => setFormSolicitud({...formSolicitud, mensaje: e.target.value})} />
                  </div>

                  {solicitudCurso.tipo === 'solicitud_inscripcion' && (
                    <div className="flex items-start gap-4 p-4 bg-kalian-gold/5 rounded-2xl border border-kalian-gold/10">
                      <input 
                        type="checkbox" 
                        id="terminos"
                        className="mt-1 w-5 h-5 accent-kalian-gold" 
                        checked={formSolicitud.aceptoTerminos}
                        onChange={e => setFormSolicitud({...formSolicitud, aceptoTerminos: e.target.checked})}
                        required
                      />
                      <label htmlFor="terminos" className="text-[10px] text-kalian-cream/60 leading-relaxed uppercase tracking-widest font-black cursor-pointer">
                        Acepto los <button type="button" onClick={() => setShowLegal(true)} className="text-kalian-gold underline hover:text-white transition-colors">términos de alta</button> como soci@ de la asociación Kalian y autorizo el tratamiento de mis datos para la gestión del curso.
                      </label>
                    </div>
                  )}

                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={enviandoSolicitud}
                    className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20"
                  >
                    {enviandoSolicitud ? 'ENVIANDO...' : (solicitudCurso.tipo === 'consulta' ? 'SOLICITAR INFORMACIÓN' : 'ENVIAR INSCRIPCIÓN')}
                  </motion.button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL CARTEL */}
      <AnimatePresence>
        {posterSeleccionado && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 z-[2000] cursor-zoom-out"
            onClick={() => setPosterSeleccionado(null)}
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative max-w-5xl w-full h-full flex items-center justify-center"
            >
              <img src={posterSeleccionado} alt="Cartel" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" referrerPolicy="no-referrer" />
              <button className="absolute top-0 right-0 m-4 bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-full flex items-center justify-center transition-all" onClick={() => setPosterSeleccionado(null)}>✕</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <LegalModal isOpen={showLegal} onClose={() => setShowLegal(false)} />
    </div>
  );
};

export default ProgramacionPublica;
