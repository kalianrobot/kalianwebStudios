import React, { useState, useEffect, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { db } from '../../firebase';
import { 
  collection, 
  getDocs, 
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
  const [filter, setFilter] = useState<'all' | 'mine' | 'events'>('all');
  
  // Estado para el Modal (separado para evitar re-renders del calendario)
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState<{ date: string } | null>(null);
  
  // Datos auxiliares
  const [cursos, setCursos] = useState<any[]>([]);
  const [profesores, setProfesores] = useState<any[]>([]);

  const userUID = user?.uid;
  const userRole = isAdmin ? 'admin' : isTeacher ? 'profesor' : 'socio';

  // 1. CARGA ÚNICA DE DATOS
  useEffect(() => {
    setLoading(true);
    
    // Suscripción en tiempo real para Eventos, Cursos y Sesiones
    const qEventos = query(collection(db, "eventos"), orderBy("fecha", "asc"));
    const qCursos = query(collection(db, "cursos"), orderBy("fechaInicio", "asc"));
    const qSesiones = collectionGroup(db, "sesiones");
    const qProfesores = query(collection(db, "socios"), where("rol", "==", "profesor"));

    const unsubEventos = onSnapshot(qEventos, (snapE) => {
      const snapCursos = getDocs(qCursos);
      const snapSesiones = getDocs(qSesiones);
      const snapProf = getDocs(qProfesores);

      Promise.all([snapCursos, snapSesiones, snapProf]).then(([sC, sS, sP]) => {
        const profMap: any = {};
        const profList: any[] = [];
        sP.docs.forEach(d => {
          profMap[d.id] = d.data().nombre;
          profList.push({ id: d.id, ...d.data() });
        });
        setProfesores(profList);

        const cursosData = sC.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setCursos(cursosData);
        const courseMap: Record<string, any> = Object.fromEntries(cursosData.map(c => [c.id, c]));

        const allEvents: any[] = [];

        // Procesar Eventos Públicos/Privados
        snapE.docs.forEach(doc => {
          const data = doc.data();
          const isEditable = userRole === 'admin';
          const start = data.fecha;
          // Si no hay hora_fin, le damos 1 hora de duración para que sea visible en la parrilla si tiene hora de inicio
          const end = data.hora_fin 
            ? `${data.fecha.substring(0, 11)}${data.hora_fin}` 
            : (data.fecha.includes('T') ? undefined : undefined);

          allEvents.push({
            id: doc.id,
            title: `[EVENTO] ${data.titulo}`,
            start,
            end,
            allDay: !data.fecha.includes('T'), // Si no tiene 'T', es todo el día
            backgroundColor: data.es_publico !== false ? '#10b981' : '#f59e0b',
            borderColor: 'transparent',
            textColor: '#ffffff',
            editable: isEditable,
            extendedProps: { 
              type: 'evento', 
              data,
              path: doc.ref.path,
              hora_inicio: start.includes('T') ? start.split('T')[1]?.substring(0, 5) : "00:00",
              hora_fin: data.hora_fin || "23:59"
            }
          });
        });

        // Procesar Sesiones (Clases)
        sS.docs.forEach(doc => {
          const data = doc.data();
          const courseId = doc.ref.parent.parent?.id;
          const curso = courseId ? courseMap[courseId] : null;
          
          if (!curso) return;

          const isOwner = curso.profesorId === userUID;
          const isEditable = userRole === 'admin' || (userRole === 'profesor' && isOwner);

          allEvents.push({
            id: doc.id,
            title: `${data.esRecurrente ? '🔁 ' : ''}${curso.titulo}`,
            start: `${data.fecha}T${data.hora_inicio}`,
            end: `${data.fecha}T${data.hora_fin}`,
            backgroundColor: isEditable ? '#3b82f6' : '#94a3b8', // Azul si editable, gris si no
            borderColor: 'transparent',
            textColor: '#ffffff',
            editable: isEditable,
            className: isEditable ? 'cursor-pointer shadow-lg' : 'opacity-60 grayscale-[0.5] cursor-not-allowed',
            extendedProps: {
              type: 'sesion',
              courseId,
              courseName: curso.titulo,
              profesorId: curso.profesorId,
              profesorNombre: profMap[curso.profesorId] || 'Sin asignar',
              sala: data.sala || 'Principal',
              fecha: data.fecha,
              hora_inicio: data.hora_inicio,
              hora_fin: data.hora_fin,
              path: doc.ref.path,
              esRecurrente: data.esRecurrente
            }
          });
        });

        setEvents(allEvents);
        setLoading(false);
      });
    });

    return () => unsubEventos();
  }, [userUID, userRole]);

  // 3. LÓGICA DE COLISIÓN CORREGIDA
  const checkConflictos = useCallback(async (newStart: string, newEnd: string, sala: string, excludeId: string, fecha: string) => {
    // Obtenemos todas las sesiones y eventos para ese día
    // Para eventos, como la fecha incluye hora, traemos los del día
    const qE = query(collection(db, "eventos"), where("fecha", ">=", fecha), where("fecha", "<=", fecha + "T23:59"));
    const qS = query(collectionGroup(db, "sesiones"), where("fecha", "==", fecha));
    
    const [snapE, snapS] = await Promise.all([getDocs(qE), getDocs(qS)]);
    
    const conflictoEvento = snapE.docs.some(doc => {
      if (doc.id === excludeId) return false;
      const ev = doc.data();
      const evStart = ev.fecha.split('T')[1]?.substring(0, 5) || "00:00";
      const evEnd = ev.hora_fin || "23:59";
      // Los eventos bloquean la sala si hay solape
      return (newStart < evEnd) && (newEnd > evStart);
    });
    
    const conflictoSesion = snapS.docs.some(doc => {
      if (doc.id === excludeId) return false;
      const s = doc.data();
      if (s.sala !== sala) return false;

      // Fórmula: (nuevaInicio < eventoExistenteFin) && (nuevaFin > eventoExistenteInicio)
      return (newStart < s.hora_fin) && (newEnd > s.hora_inicio);
    });

    return conflictoEvento || conflictoSesion;
  }, []);

  // Handlers del Calendario
  const handleEventClick = (info: any) => {
    setSelectedEvent(info.event);
  };

  const handleEventDrop = async (info: any) => {
    const { event, oldEvent } = info;
    const { type, path, sala, profesorId } = event.extendedProps;

    // Permisos
    const isEditable = userRole === 'admin' || (userRole === 'profesor' && profesorId === userUID);
    if (!isEditable) {
      alert("No tienes permiso para mover esta sesión.");
      info.revert();
      return;
    }

    const newDate = event.startStr.split('T')[0];
    const newStart = event.startStr.split('T')[1]?.substring(0, 5) || "00:00";
    const newEnd = event.endStr?.split('T')[1]?.substring(0, 5) || newStart;

    const hayConflicto = await checkConflictos(newStart, newEnd, sala, event.id, newDate);
    if (hayConflicto) {
      alert("⚠️ CONFLICTO: Ya hay una actividad programada en este horario/sala.");
      info.revert();
      return;
    }

    try {
      if (type === 'sesion') {
        // Preguntar si editar solo esta o la serie
        if (event.extendedProps.esRecurrente) {
          const choice = window.confirm("¿Deseas mover SOLO esta clase? (Aceptar para solo esta, Cancelar para volver)");
          if (!choice) {
            info.revert();
            return;
          }
        }
        
        await updateDoc(doc(db, path), {
          fecha: newDate,
          hora_inicio: newStart,
          hora_fin: newEnd
        });
      } else {
        await updateDoc(doc(db, path), {
          fecha: newDate
        });
      }
    } catch (err) {
      console.error(err);
      info.revert();
    }
  };

  // Filtrado de eventos
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (filter === 'all') return true;
      if (filter === 'mine') return ev.extendedProps.profesorId === userUID;
      if (filter === 'events') return ev.extendedProps.type === 'evento';
      return true;
    });
  }, [events, filter, userUID]);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-black/20 p-4 rounded-3xl border border-kalian-gold/10">
        <div className="flex items-center gap-2">
          <Calendar className="text-kalian-gold w-5 h-5" />
          <h2 className="text-xl kalian-poster-text text-kalian-gold uppercase italic">Calendario Kalian</h2>
        </div>
        
        <div className="flex bg-kalian-gold/5 p-1 rounded-xl border border-kalian-gold/10">
          <button 
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'all' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
          >
            Mostrar Todo
          </button>
          <button 
            onClick={() => setFilter('mine')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'mine' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
          >
            Solo Mis Clases
          </button>
          <button 
            onClick={() => setFilter('events')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'events' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
          >
            Solo Eventos
          </button>
        </div>
      </div>

      {/* Calendario */}
      <div className="bg-black/40 p-6 rounded-[2.5rem] border border-kalian-gold/10 shadow-2xl relative">
        {loading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center rounded-[2.5rem]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-kalian-gold"></div>
          </div>
        )}
        
        <div className="calendar-wrapper">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={filteredEvents}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            eventResize={handleEventDrop}
            editable={true}
            selectable={true}
            locale="es"
            firstDay={1}
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            scrollTime="09:00:00"
            allDaySlot={true}
            allDayText="Todo el día"
            height="auto"
            nowIndicator={true}
            expandRows={true}
            handleWindowResize={true}
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
  const { type, courseId, courseName, profesorNombre, sala, fecha, hora_inicio, hora_fin, path, esRecurrente, profesorId } = event.extendedProps;
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
        className="bg-kalian-dark w-full max-w-md rounded-[2.5rem] border border-kalian-gold/20 shadow-2xl overflow-hidden"
      >
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
                    <select className="w-full bg-black/40 border border-kalian-gold/20 rounded-xl p-3 text-xs text-kalian-cream" value={form.sala} onChange={e => setForm({...form, sala: e.target.value})}>
                      <option value="Sala Grande">Sala Grande</option>
                      <option value="Sala Pequeña">Sala Pequeña</option>
                      <option value="Estudio">Estudio</option>
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
                    <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest flex items-center gap-1"><MapPin size={10} /> Sala</p>
                    <p className="text-sm font-black text-kalian-cream uppercase">{sala}</p>
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
