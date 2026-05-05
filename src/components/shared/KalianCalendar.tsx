import React, { useState, useEffect, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { db } from '../../firebase';
import { 
  collection, 
  getDocs, 
  getDocsFromServer,
  query, 
  orderBy, 
  collectionGroup, 
  where, 
  writeBatch, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Filter, Users, Star, Clock, MapPin, Trash2, Save, X } from 'lucide-react';

interface KalianCalendarProps {
  teacherMode?: boolean;
}

const KalianCalendar: React.FC<KalianCalendarProps> = ({ teacherMode = false }) => {
  const { user, isAdmin, isTeacher } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'cursos' | 'events' | 'mine'>('all');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  
  // Estado para el Modal (separado para evitar re-renders del calendario)
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState<{ date: string } | null>(null);
  
  // Estado para Confirmación de Drag/Drop o Resize
  const [pendingChange, setPendingChange] = useState<{
    info: any;
    newDate: string;
    newStart: string;
    newEnd: string;
    type: 'sesion' | 'evento';
    path: string;
    courseId?: string;
    esRecurrente?: boolean;
    oldEvent?: any;
  } | null>(null);
  
  // Datos auxiliares
  const [cursos, setCursos] = useState<any[]>([]);
  const [profesores, setProfesores] = useState<any[]>([]);
  const [rawEventos, setRawEventos] = useState<any[]>([]);
  const [rawSesiones, setRawSesiones] = useState<any[]>([]);

  const userUID = user?.uid;
  const userRole = isAdmin ? 'admin' : isTeacher ? 'profesor' : 'socio';

  // 1. LISTENERS EN TIEMPO REAL
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let unsubEventos = () => {};
    let unsubCursos = () => {};
    const unsubSesiones = () => {};
    let unsubProf = () => {};
    let unsubFallback = () => {};
    let unsubMulti = () => {};

    try {
      setLoading(true);
      
      // Listener para Eventos
      unsubEventos = onSnapshot(query(collection(db, "eventos"), orderBy("fecha", "asc")), (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data(), refPath: d.ref.path }));
        console.log("Calendar: Eventos actualizados:", data.length);
        setRawEventos(data);
        setLoading(false);
      }, (err) => {
        console.warn("Calendar: Error eventos:", err.message);
        setLoading(false);
      });

      // Listener para Sesiones (Enfoque Jerárquico por Curso para máxima fiabilidad)
      const setupRealTimeSesiones = async (cursosIdList: string[]) => {
        if (unsubMulti) unsubMulti(); // Limpiar previo si existe
        
        console.log("📡 Configurando Real-Time para sesiones de", cursosIdList.length, "cursos");
        const listeners: any[] = [];
        const sesionesMap: Record<string, any[]> = {};

        cursosIdList.forEach((cId) => {
          const unsub = onSnapshot(collection(db, "cursos", cId, "sesiones"), (sSnap) => {
            sesionesMap[cId] = sSnap.docs.map(sd => ({
              id: sd.id,
              ...sd.data(),
              refPath: sd.ref.path,
              courseId: cId
            }));
            const total = Object.values(sesionesMap).flat();
            setRawSesiones(total);
          }, (err) => console.warn(`Error en sesiones de ${cId}:`, err.message));
          listeners.push(unsub);
        });
        
        unsubMulti = () => listeners.forEach(un => un());
      };

      // Listener para Cursos (Y sus sesiones subordinadas)
      unsubCursos = onSnapshot(collection(db, "cursos"), (snap) => {
        const cursosData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log("💎 Calendar: Cursos recibidos:", cursosData.length);
        setCursos(cursosData);
        
        // Iniciamos carga de sesiones para estos cursos
        const ids = cursosData.map(c => c.id);
        setupRealTimeSesiones(ids);
      }, (err) => {
        console.error("Error cargando cursos:", err.message);
      });

      // Mantenemos esto solo como respaldo si se desea, pero el jerárquico es mejor para permisos
      // unsubSesiones = onSnapshot(collectionGroup(db, "sesiones"), ...);

      // Listener para Profesores
      unsubProf = onSnapshot(collection(db, "profesores"), (snap) => {
        if (!snap.empty) {
          setProfesores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } else {
          const qP = query(collection(db, "socios"), where("rol", "==", "profesor"));
          unsubFallback = onSnapshot(qP, (snapF) => {
            setProfesores(snapF.docs.map(df => ({ id: df.id, ...df.data() })));
          }, (err) => console.warn("Calendar: Error fallback prof:", err.message));
        }
      }, (err) => console.warn("Calendar: Error prof:", err.message));
    } catch (e: any) {
      console.error("Calendar: Fatal error initializing listeners:", e.message);
    }
    return () => {
      unsubEventos();
      unsubCursos();
      unsubSesiones();
      unsubProf();
      unsubFallback();
      if (unsubMulti) unsubMulti();
    };
  }, [user]);

  // 2. PROCESAMIENTO DE EVENTOS PARA EL CALENDARIO
  useEffect(() => {
    setLoading(true);
    
    const profMap: Record<string, string> = {};
    profesores.forEach(p => {
      profMap[p.id] = p.nombre || p.displayName || p.email || 'Sin Nombre';
    });

    const courseMap: Record<string, any> = {};
    cursos.forEach(c => {
      courseMap[c.id.trim()] = c;
    });

    const allEvents: any[] = [];
    console.log(`📊 Calendar Processing: Cursos=${cursos.length}, Sesiones=${rawSesiones.length}, Eventos=${rawEventos.length}`);

    // Procesar Eventos
    rawEventos.forEach(ev => {
      const isEditable = userRole === 'admin';
      const start = ev.fecha;
      const hasTime = typeof start === 'string' && start.includes('T');
      
      let end = undefined;
      if (ev.hora_fin) {
        const datePart = typeof start === 'string' ? start.split('T')[0] : '';
        if (datePart) {
          end = `${datePart}T${ev.hora_fin.padStart(5, '0')}`;
        }
      }

      // Color coding based on room
      let bgColor = '#3b82f6'; // Blue (default - SALA GRANDE)
      const roomRaw = (ev.sala || 'SALA GRANDE').toLowerCase().trim();
      let displayName = ev.sala || 'SALA GRANDE';

      if (roomRaw.includes('estudio')) {
        bgColor = '#f59e0b'; // Orange
        displayName = 'Estudio';
      } else if (roomRaw.includes('pequeño') || roomRaw === 't.' || roomRaw === 'local t' || roomRaw === 'local pequeño') {
        bgColor = '#10b981'; // Green
        displayName = 'Local Pequeño';
      } else {
        bgColor = '#3b82f6'; // Blue
        displayName = 'SALA GRANDE';
      }

      allEvents.push({
        id: ev.id,
        title: `[EVENTO] ${ev.titulo}`,
        start,
        end,
        allDay: !hasTime,
        backgroundColor: bgColor,
        borderColor: 'transparent',
        textColor: '#ffffff',
        editable: isEditable,
        extendedProps: { 
          type: 'evento', 
          data: ev,
          path: ev.refPath,
          fecha: typeof start === 'string' ? start.split('T')[0] : '',
          hora_inicio: hasTime ? start.split('T')[1]?.substring(0, 5) : "00:00",
          hora_fin: ev.hora_fin || (hasTime ? "23:59" : "23:59"),
          sala: displayName
        }
      });
    });

    // Procesar Sesiones
    rawSesiones.forEach(sesion => {
      if (sesion.deletedAt) return; // Filtrar sesiones eliminadas
      
      const cursoIdClean = sesion.courseId?.trim();
      const curso = cursoIdClean ? courseMap[cursoIdClean] : null;
      if (!curso) {
        if (cursoIdClean) console.warn(`⚠️ Sesión ${sesion.id} ignorada: No se encontró curso con ID ${cursoIdClean}`);
        return;
      }
      if (curso.deletedAt) return; 

      const isOwner = curso.profesorId === userUID;
      const isEditable = userRole === 'admin' || (userRole === 'profesor' && isOwner);

      // Normalizar horas
      const hInicio = (sesion.hora_inicio || '00:00').padStart(5, '0');
      const hFin = (sesion.hora_fin || '01:00').padStart(5, '0');

      // Color coding based on room
      const roomRaw = (sesion.sala || curso.sala || 'SALA GRANDE').toLowerCase().trim();
      let bgColor = '#3b82f6'; // Blue (default - SALA GRANDE)
      let displayName = sesion.sala || curso.sala || 'SALA GRANDE';
      
      if (roomRaw.includes('estudio')) {
        bgColor = '#f59e0b'; // Orange
        displayName = 'Estudio';
      } else if (roomRaw.includes('pequeño') || roomRaw === 't.' || roomRaw === 'local t' || roomRaw === 'local pequeño') {
        bgColor = '#10b981'; // Green
        displayName = 'Local Pequeño';
      } else {
        bgColor = '#3b82f6'; // Blue
        displayName = 'SALA GRANDE';
      }

      allEvents.push({
        id: sesion.id,
        title: `${sesion.esRecurrente ? '🔁 ' : ''}${curso.titulo}`,
        start: `${sesion.fecha}T${hInicio}`,
        end: `${sesion.fecha}T${hFin}`,
        allDay: false,
        backgroundColor: bgColor,
        borderColor: 'transparent',
        textColor: '#ffffff',
        editable: isEditable,
        className: isEditable ? 'cursor-pointer shadow-lg' : 'opacity-60 grayscale-[0.5] cursor-not-allowed',
        extendedProps: {
          type: 'sesion',
          courseId: sesion.courseId,
          courseName: curso.titulo,
          profesorId: curso.profesorId,
          profesorNombre: profMap[curso.profesorId] || 'Sin asignar',
          sala: displayName,
          fecha: sesion.fecha,
          hora_inicio: hInicio,
          hora_fin: hFin,
          path: sesion.refPath,
          esRecurrente: sesion.esRecurrente
        }
      });
    });

    setEvents(allEvents);
    setLoading(false);
  }, [rawEventos, rawSesiones, cursos, profesores, userRole, userUID]);

  // 3. LÓGICA DE COLISIÓN (USANDO DATOS EN MEMORIA PARA EVITAR ÍNDICES Y LENTITUD)
  const checkConflictos = useCallback((newStart: string, newEnd: string, sala: string, excludeId: string, fecha: string) => {
    const conflict = events.find(ev => {
      if (ev.id === excludeId) return false;
      const ep = ev.extendedProps;
      
      // Debe ser el mismo día
      if (ep.fecha !== fecha) return false;

      // Debe ser la misma sala O que una de las dos sea "Toda la Sala" o "SALA" (Normalización)
      const compartenSala = sala === ep.sala || 
                            ((sala === 'SALA GRANDE' || sala === 'SALA' || sala === 'Toda la Sala') && 
                             (ep.sala === 'SALA GRANDE' || ep.sala === 'SALA' || ep.sala === 'Toda la Sala'));
      if (!compartenSala) return false;

      // Comprobar solape: (nuevaInicio < existenteFin) && (nuevaFin > existenteInicio)
      return (newStart < ep.hora_fin) && (newEnd > ep.hora_inicio);
    });

    if (conflict) {
      return {
        title: conflict.title,
        time: `${conflict.extendedProps.hora_inicio}-${conflict.extendedProps.hora_fin}`
      };
    }
    return null;
  }, [events]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handlers del Calendario
  const handleEventClick = (info: any) => {
    setSelectedEvent(info.event);
  };

  const handleEventChange = async (info: any) => {
    const { event } = info;
    const { type, path, sala, profesorId, esRecurrente, courseId } = event.extendedProps;

    console.log("Event change detected:", { id: event.id, start: event.start, end: event.end });

    // 1. Permisos
    const isEditable = userRole === 'admin' || (userRole === 'profesor' && profesorId === userUID);
    if (!isEditable) {
      showToast("No tienes permisos para modificar este horario", "error");
      info.revert();
      return;
    }

    // Extraemos fecha y hora robustamente de los objetos Date (en hora local para evitar saltos de zona horaria)
    const startObj = event.start;
    const endObj = event.end || new Date(startObj.getTime() + 60 * 60 * 1000);

    const pad = (n: number) => n.toString().padStart(2, '0');
    
    const newDate = `${startObj.getFullYear()}-${pad(startObj.getMonth() + 1)}-${pad(startObj.getDate())}`;
    const newStart = `${pad(startObj.getHours())}:${pad(startObj.getMinutes())}`;
    const newEnd = `${pad(endObj.getHours())}:${pad(endObj.getMinutes())}`;

    // 2. Verificación de Conflictos
    const conflicto = await checkConflictos(newStart, newEnd, sala, event.id, newDate);
    if (conflicto) {
      showToast(`⚠️ CONFLICTO: El aula ya está ocupada por "${conflicto.title}" [${conflicto.time}]`, "error");
      info.revert();
      return;
    }

    // 3. Preparar Modal de Confirmación
    console.log("Opening confirmation modal for:", { newDate, newStart, newEnd });
    setPendingChange({
      info,
      newDate,
      newStart,
      newEnd,
      type,
      path,
      courseId,
      esRecurrente
    });
  };

  const confirmPendingChange = async (scope: 'single' | 'series') => {
    if (!pendingChange) return;
    setLoading(true);
    
    try {
      if (pendingChange.type === 'sesion') {
        if (scope === 'single') {
          await updateDoc(doc(db, pendingChange.path), {
            fecha: pendingChange.newDate,
            hora_inicio: pendingChange.newStart,
            hora_fin: pendingChange.newEnd
          });
        } else if (pendingChange.courseId) {
          // Actualización de serie - similar a la lógica en EventModal
          const batch = writeBatch(db);
          // Actualizar curso
          batch.update(doc(db, "cursos", pendingChange.courseId), {
            horaInicio: pendingChange.newStart,
            horaFin: pendingChange.newEnd
          });
          // Actualizar sesiones futuras (por simplicidad aquí actualizamos todas las del curso que coincidan en el mismo día de la semana antiguo si fuera necesario, 
          // pero el drag-and-drop suele ser una corrección puntual o un cambio de slot fijo)
          const qS = query(collection(db, "cursos", pendingChange.courseId, "sesiones"), where("fecha", ">=", pendingChange.newDate));
          const snap = await getDocs(qS);
          snap.docs.forEach(d => {
            batch.update(d.ref, {
              hora_inicio: pendingChange.newStart,
              hora_fin: pendingChange.newEnd
            });
          });
          await batch.commit();
        }
      } else {
        await updateDoc(doc(db, pendingChange.path), {
          fecha: pendingChange.newDate,
          // Para eventos, 'fecha' suele ser el campo que contiene T...
          ...(pendingChange.newDate.includes('T') ? {} : {
            fecha: `${pendingChange.newDate}T${pendingChange.newStart}`
          }),
          hora_fin: pendingChange.newEnd
        });
      }
      showToast("Horario actualizado correctamente", "success");
    } catch (err) {
      console.error(err);
      showToast("Error al actualizar en la base de datos", "error");
      pendingChange.info.revert();
    } finally {
      setLoading(false);
      setPendingChange(null);
    }
  };

  const cancelPendingChange = () => {
    if (pendingChange) {
      pendingChange.info.revert();
      setPendingChange(null);
    }
  };

  // 3. FILTRADO DE EVENTOS
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (filter === 'all') return true;
      if (filter === 'mine') {
        // En modo "Mis Clases", mostramos sesiones del profesor actual 
        // y eventos generales si el usuario es Admin
        if (ev.extendedProps.type === 'sesion') {
          return ev.extendedProps.profesorId === userUID;
        }
        return userRole === 'admin'; 
      }
      if (filter === 'events') return ev.extendedProps.type === 'evento';
      if (filter === 'cursos') return ev.extendedProps.type === 'sesion';
      return true;
    });
  }, [events, filter, userUID, userRole]);

  // Generamos una clave que combine la longitud de los datos y el filtro
  // para forzar el repintado solo cuando sea estrictamente necesario
  const calendarKey = useMemo(() => {
    return `cal-${events.length}-${filter}-${rawSesiones.length}`;
  }, [events.length, filter, rawSesiones.length]);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-black/20 p-4 rounded-3xl border border-kalian-gold/10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="text-kalian-gold w-5 h-5" />
            <h2 className="text-xl kalian-poster-text text-kalian-gold uppercase italic">Calendario Kalian</h2>
          </div>
          
          {/* Debug Info para el Usuario */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 px-3 py-2 bg-kalian-gold/5 rounded-2xl border border-kalian-gold/10 text-[9px] font-black uppercase text-kalian-gold/60">
            {cursos.length === 0 ? (
              <span className="text-red-400 animate-pulse">⚠️ Error: 0 Cursos Cargados</span>
            ) : (
              <span className="text-emerald-400">✅ {cursos.length} Cursos OK</span>
            )}
            <span className="hidden md:block w-1 h-1 bg-kalian-gold/20 rounded-full"></span>
            {rawSesiones.length === 0 ? (
              <span className="text-red-400 animate-pulse">⚠️ Error: 0 Sesiones Cargadas</span>
            ) : (
              <span className="text-emerald-400">✅ {rawSesiones.length} Sesiones OK</span>
            )}
            <span className="hidden md:block w-1 h-1 bg-kalian-gold/20 rounded-full"></span>
            <span>⚡ {rawEventos.length} Eventos</span>
            <div className="flex gap-2 ml-auto">
              <button 
                onClick={() => {
                  console.log("DEBUG CALENDAR MANUAL REFRESH");
                  window.location.reload();
                }}
                className="bg-kalian-gold/10 hover:bg-kalian-gold hover:text-black px-2 py-1 rounded transition-all text-[8px]"
              >
                REINTENTAR TODO
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex bg-kalian-gold/5 p-1 rounded-xl border border-kalian-gold/10">
          <button 
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'all' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
          >
            Ver Todo
          </button>
          <button 
            onClick={() => setFilter('cursos')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'cursos' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
          >
            Solo Cursos
          </button>
          <button 
            onClick={() => setFilter('events')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'events' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
          >
            Solo Eventos
          </button>
          {isTeacher && (
            <button 
              onClick={() => setFilter('mine')}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'mine' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
            >
              Mis Clases
            </button>
          )}
        </div>
      </div>

      {/* Leyenda de Colores */}
      <div className="flex flex-wrap items-center gap-6 px-8 py-4 bg-black/40 rounded-[2rem] border border-kalian-gold/10 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#3b82f6] shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
          <span className="text-[9px] font-black uppercase tracking-widest text-kalian-cream/60">SALA GRANDE</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#f59e0b] shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
          <span className="text-[9px] font-black uppercase tracking-widest text-kalian-cream/60">Estudio</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#10b981] shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
          <span className="text-[9px] font-black uppercase tracking-widest text-kalian-cream/60">Local Pequeño</span>
        </div>
      </div>

      {/* Calendario */}
      <div className="bg-black/40 p-6 rounded-[2.5rem] border border-kalian-gold/10 shadow-2xl relative">
        {loading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center rounded-[2.5rem]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-kalian-gold"></div>
          </div>
        )}

        {/* Toast Notification */}
        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className={`absolute top-10 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full font-black uppercase text-[10px] tracking-widest border shadow-xl ${
                toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
              }`}
            >
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="calendar-wrapper">
          <FullCalendar
            key={calendarKey}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={filteredEvents}
            eventClick={handleEventClick}
            eventDrop={handleEventChange}
            eventResize={handleEventChange}
            editable={true}
            selectable={true}
            locale="es"
            firstDay={1}
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            scrollTime="09:00:00"
            allDaySlot={true}
            allDayText="Todo el día"
            height="800px"
            contentHeight="740px"
            nowIndicator={true}
            expandRows={true}
            handleWindowResize={true}
            slotEventOverlap={false}
            defaultTimedEventDuration="01:00"
          />
        </div>
      </div>

      {/* MODAL DE EVENTO (Independiente) */}
      <AnimatePresence>
        {selectedEvent && (
          <EventModal 
            event={selectedEvent} 
            onClose={() => setSelectedEvent(null)} 
            userRole={userRole}
            userUID={userUID}
            cursos={cursos}
            checkConflictos={checkConflictos}
          />
        )}
      </AnimatePresence>

      {/* MODAL DE CONFIRMACIÓN DE CAMBIO */}
      <AnimatePresence>
        {pendingChange && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-kalian-dark w-full max-w-sm rounded-[2rem] border border-kalian-gold/20 shadow-2xl p-8 space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="bg-kalian-gold/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-kalian-gold/20">
                  <Clock className="text-kalian-gold w-8 h-8" />
                </div>
                <h3 className="text-xl kalian-poster-text text-kalian-gold uppercase italic">¿Confirmar Cambio?</h3>
                <p className="text-kalian-cream/60 text-xs italic">Se actualizará el horario en la base de datos.</p>
              </div>

              <div className="bg-black/40 p-5 rounded-2xl border border-kalian-gold/10 space-y-4">
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest">Nueva Fecha</p>
                  <p className="text-sm font-bold text-kalian-cream">{pendingChange.newDate}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest">Nuevo Horario</p>
                  <p className="text-sm font-bold text-kalian-cream">{pendingChange.newStart} - {pendingChange.newEnd}</p>
                </div>
              </div>

              <div className="grid gap-3">
                <button 
                  onClick={() => confirmPendingChange('single')}
                  className="w-full bg-kalian-gold text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all shadow-lg"
                >
                  Confirmar Solo Esta Clase
                </button>
                {pendingChange.esRecurrente && pendingChange.type === 'sesion' && (
                  <button 
                    onClick={() => confirmPendingChange('series')}
                    className="w-full bg-kalian-cream text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all"
                  >
                    Confirmar en toda la serie
                  </button>
                )}
                <button 
                  onClick={cancelPendingChange}
                  className="w-full bg-red-500/10 text-red-500 py-3 rounded-xl font-black uppercase text-[9px] tracking-widest border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                >
                  Cancelar y Revertir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .fc {
          --fc-border-color: rgba(212, 175, 55, 0.1);
          --fc-today-bg-color: rgba(212, 175, 55, 0.05);
          --fc-button-bg-color: rgba(212, 175, 55, 0.1);
          --fc-button-border-color: rgba(212, 175, 55, 0.2);
          --fc-button-hover-bg-color: rgba(212, 175, 55, 0.3);
          --fc-button-active-bg-color: rgba(212, 175, 55, 0.4);
          color: #fefce8;
          font-family: 'Inter', sans-serif;
        }
        .fc-theme-standard td, .fc-theme-standard th {
          border-color: rgba(212, 175, 55, 0.1);
        }
        .fc-timegrid-axis-cushion, .fc-timegrid-slot-label-cushion {
          font-size: 9px;
          font-weight: 800;
          color: rgba(212, 175, 55, 0.7) !important;
          text-transform: uppercase;
        }
        .fc-all-day-label {
          font-size: 8px;
          font-weight: 900;
          color: #d4af37;
          text-transform: uppercase;
        }
        .fc-toolbar-title {
          font-family: 'Kalian Poster', sans-serif;
          text-transform: uppercase;
          font-style: italic;
          color: #d4af37;
        }
        .fc-col-header-cell {
          padding: 10px 0;
          background: rgba(0,0,0,0.2);
        }
        .fc-col-header-cell-cushion {
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #d4af37;
        }
        .fc-timegrid-slot-label-cushion {
          font-size: 9px;
          font-weight: 800;
          color: rgba(212, 175, 55, 0.5);
        }
        .fc-event {
          border-radius: 8px;
          padding: 2px 5px;
          font-size: 10px;
          font-weight: 700;
          border: none !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
      `}</style>
    </div>
  );
};

// COMPONENTE MODAL INDEPENDIENTE
const EventModal = ({ event, onClose, userRole, userUID, cursos, checkConflictos }: any) => {
  // Extraemos datos frescos directamente del objeto event de FullCalendar
  const { type, courseId, courseName, profesorNombre, sala, path, esRecurrente, profesorId } = event.extendedProps;
  
  const fecha = event.startStr.split('T')[0];
  const hora_inicio = event.startStr.includes('T') ? event.startStr.split('T')[1].substring(0, 5) : "00:00";
  const hora_fin = event.endStr?.includes('T') ? event.endStr.split('T')[1].substring(0, 5) : "23:59";

  // Determinar color de la sala
  const roomColor = sala === 'Estudio' ? '#f59e0b' : (sala === 'Local Pequeño' ? '#10b981' : '#3b82f6');

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ sala, hora_inicio, hora_fin, fecha });
  const [loading, setLoading] = useState(false);

  const isEditable = userRole === 'admin' || (userRole === 'profesor' && profesorId === userUID);

  const handleSave = async (scope: 'single' | 'series') => {
    setLoading(true);
    try {
      // Validar conflictos
      const hayConflicto = await checkConflictos(form.hora_inicio, form.hora_fin, form.sala, event.id, form.fecha);
      if (hayConflicto) {
        alert("⚠️ CONFLICTO: Ya hay una actividad en este horario/sala.");
        setLoading(false);
        return;
      }

      if (scope === 'single') {
        await updateDoc(doc(db, path), {
          sala: form.sala,
          hora_inicio: form.hora_inicio,
          hora_fin: form.hora_fin,
          fecha: form.fecha
        });
      } else {
        // EDITAR SERIE
        const batch = writeBatch(db);
        const cursoRef = doc(db, "cursos", courseId);
        
        // 1. Actualizar el curso padre
        batch.update(cursoRef, {
          sala: form.sala,
          horaInicio: form.hora_inicio,
          horaFin: form.hora_fin
        });

        // 2. Regenerar sesiones futuras
        const qSesionesFuturas = query(
          collection(db, "cursos", courseId, "sesiones"),
          where("fecha", ">=", form.fecha)
        );
        const snap = await getDocs(qSesionesFuturas);
        snap.docs.forEach(d => {
          batch.update(d.ref, {
            sala: form.sala,
            hora_inicio: form.hora_inicio,
            hora_fin: form.hora_fin
          });
        });

        await batch.commit();
      }
      
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Estás seguro de eliminar esta sesión?")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, path));
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="bg-kalian-dark w-full max-w-md rounded-[2.5rem] border border-kalian-gold/20 shadow-2xl overflow-hidden relative"
      >
        <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: roomColor }}></div>
        <div className="p-6 bg-kalian-gold/10 border-b border-kalian-gold/10 flex justify-between items-center">
          <h3 className="text-xl kalian-poster-text text-kalian-gold uppercase italic">
            {type === 'sesion' ? 'Detalle de Clase' : 'Detalle de Evento'}
          </h3>
          <button onClick={onClose} className="text-kalian-gold/40 hover:text-white transition-colors"><X /></button>
        </div>

        <div className="p-8 space-y-6">
          {type === 'sesion' ? (
            <>
              <div className="space-y-1">
                <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest">Curso</p>
                <p className="text-xl font-black text-kalian-cream uppercase italic">{courseName}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest">Profesor</p>
                  <p className="text-sm font-bold text-kalian-gold">{profesorNombre}</p>
                </div>
                {esRecurrente && (
                  <span className="bg-kalian-gold/10 text-kalian-gold px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-kalian-gold/20">Recurrente 🔁</span>
                )}
              </div>

              {editMode ? (
                <div className="space-y-4 bg-black/20 p-6 rounded-3xl border border-kalian-gold/10">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2">Inicio</label>
                      <input type="time" className="w-full bg-black/40 border border-kalian-gold/20 rounded-xl p-3 text-xs text-kalian-cream" value={form.hora_inicio} onChange={e => setForm({...form, hora_inicio: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2">Fin</label>
                      <input type="time" className="w-full bg-black/40 border border-kalian-gold/20 rounded-xl p-3 text-xs text-kalian-cream" value={form.hora_fin} onChange={e => setForm({...form, hora_fin: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2">Sala</label>
                    <select className="w-full bg-black/40 border border-kalian-gold/20 rounded-xl p-3 text-xs text-kalian-cream outline-none focus:border-kalian-gold transition-colors" value={form.sala} onChange={e => setForm({...form, sala: e.target.value})}>
                      <option value="SALA GRANDE">SALA GRANDE</option>
                      <option value="Estudio">Estudio</option>
                      <option value="Local Pequeño">Local Pequeño</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6 bg-black/20 p-6 rounded-3xl border border-kalian-gold/10">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest flex items-center gap-1"><Clock size={10} /> Horario</p>
                    <p className="text-sm font-black text-kalian-cream">{hora_inicio} - {hora_fin}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest flex items-center gap-1"><MapPin size={10} /> Fecha</p>
                    <p className="text-sm font-black text-kalian-cream uppercase">{fecha}</p>
                  </div>
                  <div className="col-span-2 space-y-1 pt-2 border-t border-white/5">
                    <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest flex items-center gap-1"><MapPin size={10} /> Sala</p>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: roomColor }}></div>
                      <p className="text-sm font-black text-kalian-cream uppercase">{sala}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-kalian-gold/10 flex flex-col gap-3">
                {isEditable && !editMode && (
                  <button onClick={() => setEditMode(true)} className="w-full bg-kalian-gold text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all">Editar Sesión</button>
                )}
                
                {editMode && (
                  <div className="space-y-3">
                    <button onClick={() => handleSave('single')} disabled={loading} className="w-full bg-emerald-500 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2">
                      <Save size={14} /> {loading ? 'Guardando...' : 'Guardar solo esta clase'}
                    </button>
                    {esRecurrente && (
                      <button onClick={() => handleSave('series')} disabled={loading} className="w-full bg-kalian-gold text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2">
                        <Save size={14} /> {loading ? 'Guardando...' : 'Guardar en toda la serie'}
                      </button>
                    )}
                    <button onClick={() => setEditMode(false)} className="w-full bg-black/40 text-kalian-gold/60 py-3 rounded-xl font-black uppercase text-[9px] tracking-widest">Cancelar</button>
                  </div>
                )}

                {isEditable && !editMode && (
                  <button onClick={handleDelete} className="w-full bg-red-500/10 text-red-500 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-500/20 flex items-center justify-center gap-2">
                    <Trash2 size={14} /> Eliminar Clase
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-kalian-cream/60 text-sm italic">Los detalles de los eventos se gestionan desde el panel de eventos.</p>
              <button onClick={onClose} className="w-full bg-kalian-gold text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest">Cerrar</button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default KalianCalendar;
