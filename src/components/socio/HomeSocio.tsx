import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, DocumentData, where } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import ReservaForm from '../public/ReservaForm';
import LegalModal from '../public/LegalModal';

export const HomeSocio = () => {
  const [eventos, setEventos] = useState<DocumentData[]>([]);
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [locales, setLocales] = useState<DocumentData[]>([]);
  const [academias, setAcademias] = useState<DocumentData[]>([]);
  const [itemSeleccionado, setItemSeleccionado] = useState<any | null>(null);
  const [posterSeleccionado, setPosterSeleccionado] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [subcategoriaActiva, setSubcategoriaActiva] = useState<string | null>(null);
  const [cursoDetalle, setCursoDetalle] = useState<any | null>(null);

  const subcategorias: { [key: string]: string[] } = {
    musica: ['Instrumento', 'Combo', 'Armonía moderna', 'Big Band', 'Master classes'],
    danza: ['Bachata', 'Bachata coreográfico', 'Salsa']
  };
  const [solicitudCurso, setSolicitudCurso] = useState<{ curso: any, tipo: 'consulta' | 'solicitud_inscripcion', modalidad?: any } | null>(null);
  const [formSolicitud, setFormSolicitud] = useState({ nombre: '', email: '', telefono: '', dni: '', mensaje: '', especialidad: '', aceptoTerminos: false });
  const [modalidadSeleccionada, setModalidadSeleccionada] = useState<{ [cursoId: string]: any }>({});
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [mensajeSolicitud, setMensajeSolicitud] = useState('');
  const [showLegal, setShowLegal] = useState(false);

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
    const fetchData = async () => {
      const qE = query(collection(db, "eventos"), orderBy("fecha", "asc"));
      const qC = query(collection(db, "cursos"), orderBy("fechaInicio", "asc"));
      const qL = collection(db, "locales");
      const qA = query(collection(db, "academias"), orderBy("orden", "asc"));
      const [snapE, snapC, snapL, snapA] = await Promise.all([getDocs(qE), getDocs(qC), getDocs(qL), getDocs(qA)]);
      setEventos(snapE.docs.map(d => ({ id: d.id, ...d.data() })));
      setCursos(snapC.docs.map(d => ({ id: d.id, ...d.data() })));
      setLocales(snapL.docs.map(d => ({ id: d.id, ...d.data() })));
      setAcademias(snapA.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(a => a.activo));
    };
    fetchData();
  }, []);

  const hayLocalesLibres = locales.some(l => l.estado === 'libre');

  const enviarSolicitud = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviandoSolicitud(true);
    try {
      const { addDoc } = await import('firebase/firestore');
      await addDoc(collection(db, "solicitudes_cursos"), {
        ...formSolicitud,
        cursoId: solicitudCurso?.curso.id,
        cursoTitulo: solicitudCurso?.curso.titulo,
        categoria: solicitudCurso?.curso.categoria,
        subcategoria: solicitudCurso?.curso.subcategoria,
        modalidad: solicitudCurso?.modalidad,
        tipo: solicitudCurso?.tipo,
        fechaSolicitud: new Date().toISOString(),
        estado: 'pendiente'
      });
      setMensajeSolicitud(solicitudCurso?.tipo === 'consulta' 
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
        <p className="text-kalian-gold/60 text-xs md:text-sm font-black tracking-[0.6em] uppercase italic">Eventos y Cursos para Soci@s Kalian</p>
        
        <div className="pt-8 flex justify-center">
          <Link 
            to="/perfil" 
            className="bg-kalian-gold text-black px-10 py-4 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20"
          >
            IR A MI PANEL →
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 space-y-32">
        
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
                    {ev.categoria !== 'ninguno' && (
                      <span className="bg-kalian-gold text-black text-[9px] font-black uppercase px-4 py-1.5 rounded-full tracking-widest shadow-lg">Descuento Soci@s</span>
                    )}
                    <span className="text-kalian-gold kalian-poster-text text-4xl drop-shadow-lg ml-auto">{ev.precio_estandar}€</span>
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

          {!categoriaActiva ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {academias.map((aca, idx) => (
                <div 
                  key={aca.id}
                  onClick={() => setCategoriaActiva(aca.id)}
                  className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] p-12 text-center space-y-6 cursor-pointer hover:border-kalian-gold/40 transition-all group relative overflow-hidden"
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
                    {aca.lema}
                  </p>
                  <div className="pt-4">
                    <span className={`${idx % 2 === 0 ? 'text-kalian-gold/40 group-hover:text-kalian-gold' : 'text-kalian-cream/40 group-hover:text-kalian-cream'} text-[9px] font-black uppercase tracking-[0.5em] transition-colors`}>
                      Seleccionar Categoría →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : !subcategoriaActiva ? (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex justify-between items-center">
                <button 
                  onClick={() => setCategoriaActiva(null)}
                  className="text-kalian-gold font-black uppercase text-[10px] tracking-[0.4em] flex items-center gap-2 hover:text-white transition-colors"
                >
                  ← VOLVER A CATEGORÍAS
                </button>
                <h3 className="text-3xl kalian-poster-text text-kalian-gold uppercase italic">
                  {academias.find(a => a.id === categoriaActiva)?.nombre}
                </h3>
              </div>

              <div className="text-center space-y-8">
                <p className="text-kalian-gold/40 text-[10px] font-black uppercase tracking-[0.5em]">Selecciona una especialidad</p>
                <div className="flex flex-wrap justify-center gap-4">
                  {(subcategorias[categoriaActiva] || []).map(sub => (
                    <button
                      key={sub}
                      onClick={() => setSubcategoriaActiva(sub)}
                      className="px-8 py-4 bg-black/40 border border-kalian-gold/20 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-kalian-gold hover:text-black transition-all uppercase italic"
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex justify-between items-center">
                <button 
                  onClick={() => setSubcategoriaActiva(null)}
                  className="text-kalian-gold font-black uppercase text-[10px] tracking-[0.4em] flex items-center gap-2 hover:text-white transition-colors"
                >
                  ← CAMBIAR ESPECIALIDAD
                </button>
                <div className="text-right">
                  <h3 className="text-2xl kalian-poster-text text-kalian-gold uppercase italic leading-none">
                  {academias.find(a => a.id === categoriaActiva)?.nombre}
                </h3>
                  <p className="text-[10px] font-black text-kalian-cream/40 uppercase tracking-widest mt-1">{subcategoriaActiva}</p>
                </div>
              </div>

              <div className="space-y-6">
                {cursos.filter(c => c.categoria === categoriaActiva && c.subcategoria === subcategoriaActiva).length > 0 ? (
                  cursos.filter(c => c.categoria === categoriaActiva && c.subcategoria === subcategoriaActiva).map(c => {
                    const isFull = c.aforo_actual >= c.aforo_total;
                    const isExpanded = expandido === c.id;

                    return (
                      <div 
                        key={c.id} 
                        className={`bg-black/40 border border-kalian-gold/10 rounded-3xl overflow-hidden transition-all duration-500 hover:border-kalian-gold/30 cursor-pointer`}
                        onClick={() => setCursoDetalle(c)}
                      >
                        <div 
                          className="p-8 md:p-10 flex flex-col md:flex-row justify-between items-center gap-8 group"
                        >
                          <div className="flex items-center gap-8 w-full md:w-auto">
                            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl border border-kalian-gold/10 ${c.categoria === 'danza' ? 'bg-kalian-orange/10' : 'bg-kalian-gold/10'}`}>
                              {c.categoria === 'danza' ? '💃' : '🎸'}
                            </div>
                            <div>
                              <h3 className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors">{c.titulo}</h3>
                              <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] mt-3">Categoría: {c.categoria} • {c.subcategoria}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-12 w-full md:w-auto justify-between md:justify-end">
                            <div className="text-center">
                              <p className={`text-3xl kalian-poster-text ${c.aforo_disponible === false ? 'text-red-500' : 'text-kalian-gold'}`}>
                                {c.aforo_disponible === false ? 'AGOTADO' : 'HAY PLAZAS'}
                              </p>
                              <p className="text-[8px] font-black uppercase text-kalian-gold/30 tracking-widest">Disponibilidad</p>
                            </div>
                            <div className="text-right">
                              <p className="text-3xl kalian-poster-text text-kalian-cream">
                                {c.modalidades && c.modalidades.length > 0 
                                  ? `Desde ${Math.min(...c.modalidades.map((m: any) => m.precio))}€` 
                                  : `${c.precio || 0}€`}
                              </p>
                              <p className="text-[8px] font-black uppercase text-kalian-gold/80 tracking-widest">Aportación</p>
                            </div>
                            <span className={`text-2xl text-kalian-gold transition-transform duration-500`}>→</span>
                          </div>
                        </div>
                      </div>
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
            </div>
          )}
        </section>

        {/* KALIAN GALLERY */}
        <section className="space-y-12">
          <div className="flex items-center gap-6">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold">KALIAN <span className="text-kalian-cream">GALLERY</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>
          
          <div className="bg-kalian-gold/5 border border-kalian-gold/10 border-dashed rounded-[3rem] p-16 text-center space-y-6">
            <div className="text-6xl mb-4 opacity-40">🖼️</div>
            <h3 className="text-3xl kalian-poster-text text-kalian-gold/60 uppercase italic">Exposiciones Programadas</h3>
            <p className="text-kalian-cream/40 text-sm max-w-md mx-auto leading-relaxed">
              Próximamente colgaremos aquí las exposiciones y muestras artísticas que tendrán lugar en nuestro espacio.
            </p>
          </div>
        </section>

        {/* KALIAN HUB */}
        <section className="space-y-12">
          <div className="flex items-center gap-6">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold">KALIAN <span className="text-kalian-cream">HUB</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>
          
          <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] p-12 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl">
            <div className="space-y-4 text-center md:text-left">
              <h3 className="text-3xl kalian-poster-text text-kalian-cream uppercase italic">¿Buscas un espacio para ensayar / crear / diseñar…?</h3>
              <p className="text-kalian-cream/60 text-sm max-w-md leading-relaxed">
                Consulta la disponibilidad actual para unirte a nuestra comunidad.
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

        {/* SECCIÓN CONTACTO */}
        <section className="pb-20">
          <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] p-12 text-center space-y-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-kalian-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            <div className="relative z-10 space-y-4">
              <h2 className="text-4xl kalian-poster-text text-kalian-gold uppercase italic">¿Necesitas <span className="text-kalian-cream">Ayuda?</span></h2>
              <p className="text-kalian-gold/40 text-[10px] font-black uppercase tracking-[0.4em]">Estamos a tu disposición para cualquier consulta</p>
            </div>
            
            <div className="relative z-10 flex flex-col items-center gap-6">
              <p className="text-kalian-cream/70 text-sm max-w-md mx-auto leading-relaxed">
                Si tienes dudas sobre tu suscripción, problemas con las reservas o quieres proponer una actividad, no dudes en escribirnos.
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
      {cursoDetalle && (
        <div className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-md flex items-center justify-center p-4 z-[1100] animate-in fade-in duration-500 overflow-y-auto">
          <div className="w-full max-w-2xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl p-8 md:p-12 relative my-auto">
            <button onClick={() => setCursoDetalle(null)} className="absolute top-8 right-8 text-kalian-gold/90 font-black text-2xl hover:text-kalian-gold transition-colors">✕</button>
            
            <div className="space-y-8">
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase text-kalian-gold/80 tracking-[0.4em]">{cursoDetalle.categoria} • {cursoDetalle.subcategoria}</span>
                <h2 className="text-5xl kalian-poster-text text-kalian-gold leading-none uppercase italic">{cursoDetalle.titulo}</h2>
                <p className="text-xs font-black text-kalian-cream/60 uppercase tracking-widest">{cursoDetalle.horario} | {cursoDetalle.profesorNombre || 'Pendiente de asignar'}</p>
              </div>

              <div className="space-y-6">
                {/* BLOQUE IMPORTANTE */}
                <div className="bg-kalian-gold/10 p-6 rounded-2xl border border-kalian-gold/20">
                  <p className="text-[10px] font-black text-kalian-gold uppercase tracking-widest mb-2">★ IMPORTANTE</p>
                  <p className="text-xs text-kalian-cream/90 italic leading-relaxed">
                    {cursoDetalle.ventajas || `Este curso incluye el alta como soci@ de la asociación Kalian y acceso a descuentos en actividades de la misma categoría.`}
                  </p>
                </div>

                {/* DESCRIPCIÓN DEL CURSO */}
                {cursoDetalle.descripcion && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Descripción del curso</p>
                    <p className="text-sm text-kalian-cream/80 leading-relaxed">
                      {cursoDetalle.descripcion}
                    </p>
                  </div>
                )}

                {/* MODALIDADES DE PRECIO */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-kalian-gold/60 uppercase tracking-widest">Modalidades de Aportación</p>
                  <div className="bg-black/40 rounded-2xl overflow-hidden border border-kalian-gold/10">
                    <table className="w-full text-left text-[10px] uppercase tracking-widest font-black">
                      <thead>
                        <tr className="bg-kalian-gold/5 text-kalian-gold/70 border-b border-kalian-gold/10">
                          <th className="p-4 w-10"></th>
                          <th className="p-4">Tipo</th>
                          <th className="p-4">Frecuencia</th>
                          <th className="p-4 text-right">Aportación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-kalian-gold/5">
                        {cursoDetalle.modalidades?.map((m: any, i: number) => {
                          const isSelected = modalidadSeleccionada[cursoDetalle.id]?.tipo === m.tipo && 
                                           modalidadSeleccionada[cursoDetalle.id]?.frecuencia === m.frecuencia &&
                                           modalidadSeleccionada[cursoDetalle.id]?.precio === m.precio;
                          
                          return (
                            <tr 
                              key={i} 
                              className={`text-kalian-cream/90 cursor-pointer hover:bg-white/5 transition-colors ${isSelected ? 'bg-kalian-gold/5' : ''}`}
                              onClick={() => {
                                setModalidadSeleccionada({ ...modalidadSeleccionada, [cursoDetalle.id]: m });
                                setErrorSeleccion(null);
                              }}
                            >
                              <td className="p-4">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-kalian-gold bg-kalian-gold' : 'border-white/20'}`}>
                                  {isSelected && <div className="w-2 h-2 bg-black rounded-full"></div>}
                                </div>
                              </td>
                              <td className="p-4">{m.tipo}</td>
                              <td className="p-4">{m.frecuencia}</td>
                              <td className="p-4 text-right font-black text-kalian-gold">{m.precio}€</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {errorSeleccion && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-red-500 text-center font-black uppercase text-[10px] tracking-widest">
                    ⚠️ {errorSeleccion}
                  </p>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button 
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
                  className="flex-1 bg-kalian-gold/20 text-kalian-gold border border-kalian-gold/40 p-5 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-kalian-gold hover:text-black transition-all shadow-lg shadow-kalian-gold/5"
                >
                  Solicitar Info
                </button>
                <button 
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
                  className={`flex-1 p-5 rounded-2xl kalian-poster-text text-lg tracking-widest transition-all shadow-xl ${cursoDetalle.aforo_disponible === false ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-kalian-gold text-black hover:bg-white shadow-kalian-gold/20'}`}
                >
                  {cursoDetalle.aforo_disponible === false ? 'CURSO CERRADO' : 'Inscribirse'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RESERVA */}
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
            <button onClick={() => setSolicitudCurso(null)} className="absolute top-8 right-8 text-kalian-gold/90 font-black text-2xl hover:text-kalian-gold transition-colors">✕</button>
            
            <h2 className="text-4xl kalian-poster-text text-kalian-gold leading-none mb-2 tracking-tight uppercase italic">{solicitudCurso.curso.titulo}</h2>
            <div className="flex justify-between items-center mb-10">
              <p className="text-[10px] font-black text-kalian-gold/90 uppercase tracking-[0.3em]">
                {solicitudCurso.tipo === 'consulta' ? 'Solicitud de Información' : 'Formulario de Inscripción'}
              </p>
              <p className="text-[10px] font-black text-kalian-cream uppercase tracking-widest bg-kalian-gold/10 px-3 py-1 rounded-full border border-kalian-gold/20">
                {solicitudCurso.modalidad?.tipo} | {solicitudCurso.modalidad?.frecuencia} | {solicitudCurso.modalidad?.precio}€
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
                      Acepto los <button type="button" onClick={() => setShowLegal(true)} className="text-kalian-gold hover:underline">términos de alta</button> como soci@ de la asociación Kalian y autorizo el tratamiento de mis datos para la gestión del curso.
                    </label>
                  </div>
                )}

                <button 
                  disabled={enviandoSolicitud}
                  className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20"
                >
                  {enviandoSolicitud ? 'ENVIANDO...' : (solicitudCurso.tipo === 'consulta' ? 'SOLICITAR INFORMACIÓN' : 'ENVIAR INSCRIPCIÓN')}
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

      <LegalModal isOpen={showLegal} onClose={() => setShowLegal(false)} />
    </div>
  );
};

export default HomeSocio;


