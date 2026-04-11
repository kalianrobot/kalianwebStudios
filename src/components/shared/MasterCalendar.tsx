import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, DocumentData, collectionGroup, where, writeBatch, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

interface MasterCalendarProps {
  teacherMode?: boolean;
}

const MasterCalendar = ({ teacherMode = false }: MasterCalendarProps) => {
  const [events, setEvents] = useState<any[]>([]);
  const [filtro, setFiltro] = useState<'todos' | 'eventos' | 'sesiones'>('todos');
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [showAddModal, setShowAddModal] = useState<{ date: string } | null>(null);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [nuevaSesion, setNuevaSesion] = useState({ cursoId: '', hora_inicio: '18:00', hora_fin: '19:30', sala: 'Sala Grande', esRecurrente: false, diasSemana: [] as number[] });
  const [conflictos, setConflictos] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchData = async () => {
    const qE = query(collection(db, "eventos"), orderBy("fecha", "asc"));
    const qC = teacherMode && user 
      ? query(collection(db, "cursos"), where("profesorId", "==", user.uid))
      : query(collection(db, "cursos"), orderBy("fechaInicio", "asc"));
    const qS = collectionGroup(db, "sesiones");
    const qP = query(collection(db, "socios"), where("rol", "==", "profesor"));
    
    const [snapE, snapC, snapS, snapP] = await Promise.all([
      getDocs(qE), 
      getDocs(qC),
      getDocs(qS),
      getDocs(qP)
    ]);
    
    const profMap: { [key: string]: string } = {};
    snapP.docs.forEach(d => { profMap[d.id] = d.data().nombre; });

    const fetchedCursos = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
    setCursos(fetchedCursos);

    const calendarEvents: any[] = [];
    const courseMap: { [key: string]: any } = {};

    fetchedCursos.forEach((c: any) => {
      courseMap[c.id] = c;
      calendarEvents.push({
        id: c.id,
        title: `[CURSO] ${c.titulo}`,
        start: c.fechaInicio,
        end: c.fechaFin,
        backgroundColor: '#3b82f6',
        borderColor: '#2563eb',
        textColor: '#ffffff',
        className: 'event-curso-range',
        display: 'background',
        extendedProps: { type: 'curso' }
      });
    });

      // Eventos
      snapE.docs.forEach(doc => {
        const data = doc.data();
        const isPublic = data.es_publico !== false;
        calendarEvents.push({
          id: doc.id,
          title: `[EVENTO] ${data.titulo}`,
          start: data.fecha,
          backgroundColor: isPublic ? '#10b981' : '#f97316',
          borderColor: isPublic ? '#059669' : '#ea580c',
          textColor: '#ffffff',
          className: isPublic ? 'event-public' : 'event-private',
          editable: true,
          extendedProps: { type: 'evento', path: doc.ref.path }
        });
      });

      // Sesiones de Cursos
      snapS.docs.forEach(doc => {
        const data = doc.data();
        const courseId = doc.ref.parent.parent?.id;
        const curso = courseId ? courseMap[courseId] : null;
        const courseName = curso ? curso.titulo : 'Curso desconocido';
        const profesorNombre = curso ? profMap[curso.profesorId] || 'Profesor desconocido' : 'Profesor desconocido';
        
        calendarEvents.push({
          id: doc.id,
          title: `${data.esRecurrente ? '🔁 ' : ''}Clase: ${courseName}`,
          start: `${data.fecha}T${data.hora_inicio}`,
          end: `${data.fecha}T${data.hora_fin}`,
          backgroundColor: '#3b82f6',
          borderColor: '#2563eb',
          textColor: '#ffffff',
          className: 'event-sesion',
          editable: true,
          extendedProps: { 
            type: 'sesion',
            courseId,
            courseName,
            profesorNombre,
            profesorId: curso?.profesorId,
            sala: data.sala || 'Sala Grande',
            fecha: data.fecha,
            hora_inicio: data.hora_inicio,
            hora_fin: data.hora_fin,
            path: doc.ref.path
          }
        });
      });

      setEvents(calendarEvents);
    };

  useEffect(() => {
    fetchData();
  }, [user, teacherMode]);

  const handleDateClick = (info: any) => {
    setNuevaSesion(prev => ({ ...prev, cursoId: cursos[0]?.id || '' }));
    setShowAddModal({ date: info.dateStr });
  };

  const guardarSesionRapida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaSesion.cursoId || !showAddModal) return;
    setConflictos([]);

    try {
      const curso = cursos.find(c => c.id === nuevaSesion.cursoId);
      if (!curso) return;

      const sesionesAGuardar: any[] = [];
      const fechasAComprobar: string[] = [];

      if (nuevaSesion.esRecurrente && nuevaSesion.diasSemana.length > 0) {
        const end = new Date(curso.fechaFin);
        
        nuevaSesion.diasSemana.forEach(targetDay => {
          let current = new Date(showAddModal.date);
          const targetDayJs = targetDay === 7 ? 0 : targetDay;

          while (current.getDay() !== targetDayJs) {
            current.setDate(current.getDate() + 1);
          }

          while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            fechasAComprobar.push(dateStr);
            sesionesAGuardar.push({
              fecha: dateStr,
              hora_inicio: nuevaSesion.hora_inicio,
              hora_fin: nuevaSesion.hora_fin,
              sala: nuevaSesion.sala,
              esRecurrente: true
            });
            current.setDate(current.getDate() + 7);
          }
        });
      } else {
        fechasAComprobar.push(showAddModal.date);
        sesionesAGuardar.push({
          fecha: showAddModal.date,
          hora_inicio: nuevaSesion.hora_inicio,
          hora_fin: nuevaSesion.hora_fin,
          sala: nuevaSesion.sala,
          esRecurrente: false
        });
      }

      // Validación
      const conflicts: string[] = [];
      const snapE = await getDocs(query(collection(db, "eventos"), where("fecha", ">=", fechasAComprobar[0])));
      const eventosExistentes = snapE.docs.map(d => d.data());
      const snapS = await getDocs(collectionGroup(db, "sesiones"));
      const sesionesExistentes = snapS.docs.map(d => d.data());

      for (const f of fechasAComprobar) {
        const hasEvento = eventosExistentes.some(ev => ev.fecha.startsWith(f));
        const hasSesion = sesionesExistentes.some((s: any) => 
          s.fecha === f && s.sala === nuevaSesion.sala && 
          ((nuevaSesion.hora_inicio >= s.hora_inicio && nuevaSesion.hora_inicio < s.hora_fin) ||
           (nuevaSesion.hora_fin > s.hora_inicio && nuevaSesion.hora_fin <= s.hora_fin))
        );
        if (hasEvento || hasSesion) conflicts.push(f);
      }

      if (conflicts.length > 0) {
        setConflictos(conflicts);
        return;
      }

      const batch = writeBatch(db);
      sesionesAGuardar.forEach(s => {
        const sesionId = `${s.fecha}_${s.hora_inicio.replace(':', '')}`;
        const ref = doc(db, "cursos", nuevaSesion.cursoId, "sesiones", sesionId);
        batch.set(ref, s);
      });

      await batch.commit();
      setMsg(`✅ ${sesionesAGuardar.length} sesiones añadidas`);
      setShowAddModal(null);
      fetchData();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al guardar");
    }
  };

  const handleEventClick = (info: any) => {
    const { type } = info.event.extendedProps;
    if (type === 'evento') {
      navigate(`/staff/eventos?edit=${info.event.id}`);
    } else if (type === 'curso') {
      navigate(`/staff/cursos?edit=${info.event.id}`);
    } else if (type === 'sesion') {
      setSelectedSession({
        id: info.event.id,
        ...info.event.extendedProps
      });
    }
  };

  const handleEventDrop = async (info: any) => {
    const { type, path, courseName, profesorId } = info.event.extendedProps;
    if (!path) {
      info.revert();
      return;
    }

    if (!window.confirm(`¿Seguro que quieres mover este elemento a ${info.event.start.toLocaleString()}?`)) {
      info.revert();
      return;
    }

    try {
      const newDate = info.event.start.toISOString().split('T')[0];
      const updates: any = { fecha: newDate };

      let newStart = '';
      let newEnd = '';

      if (info.event.start) {
        newStart = info.event.start.toTimeString().split(' ')[0].substring(0, 5);
        if (type === 'sesion' || type === 'evento') {
          updates.hora_inicio = newStart;
        }
      }

      if (info.event.end) {
        newEnd = info.event.end.toTimeString().split(' ')[0].substring(0, 5);
        if (type === 'sesion' || type === 'evento') {
          updates.hora_fin = newEnd;
        }
      }

      await updateDoc(doc(db, path), updates);

      // Refrescar eventos localmente
      setEvents(prev => prev.map(ev => {
        if (ev.extendedProps.path === path) {
          return {
            ...ev,
            start: info.event.start,
            end: info.event.end
          };
        }
        return ev;
      }));

      // Notificar al profesor si el cambio lo hace otra persona
      if (profesorId && user?.uid !== profesorId) {
        await addDoc(collection(db, "notificaciones"), {
          userId: profesorId,
          titulo: "Cambio en horario de clase",
          mensaje: `La sesión del curso "${courseName}" ha sido movida al ${newDate} a las ${newStart} por la administración.`,
          fecha: serverTimestamp(),
          leida: false,
          tipo: 'calendario'
        });
      }

      setMsg("✅ Sesión actualizada y profesor notificado");
      setTimeout(() => setMsg(''), 3000);
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Error al actualizar la sesión");
      info.revert();
    }
  };

  return (
    <div className="bg-black/40 p-8 rounded-[2.5rem] border border-kalian-gold/10 shadow-2xl text-kalian-cream">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
        <h2 className="text-3xl kalian-poster-text text-kalian-gold uppercase italic">Calendario <span className="text-kalian-cream">Maestro</span></h2>
        
        <div className="flex flex-wrap items-center gap-6">
          {/* Selector de Filtro */}
          <div className="flex bg-kalian-gold/5 p-1 rounded-2xl border border-kalian-gold/10">
            <button 
              onClick={() => setFiltro('todos')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtro === 'todos' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
            >
              Todos
            </button>
            <button 
              onClick={() => setFiltro('eventos')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtro === 'eventos' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
            >
              Eventos
            </button>
            <button 
              onClick={() => setFiltro('sesiones')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtro === 'sesiones' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
            >
              Sesiones/Clases
            </button>
          </div>

          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-kalian-cream/60">Sesiones (Clases)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-kalian-cream/60">Eventos Públicos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-kalian-cream/60">Eventos Privados</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500/30"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-kalian-cream/60">Rango de Curso</span>
            </div>
          </div>
        </div>
      </div>

      <div className="calendar-container">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          }}
          events={events.filter(ev => {
            if (filtro === 'todos') return true;
            if (filtro === 'eventos') return ev.extendedProps.type === 'evento';
            if (filtro === 'sesiones') return ev.extendedProps.type === 'sesion';
            return true;
          })}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventDrop}
          editable={true}
          eventStartEditable={true}
          eventDurationEditable={true}
          eventOverlap={true}
          eventConstraint={null}
          dragRevertDuration={0}
          eventDragMinDistance={5}
          selectable={true}
          unselectAuto={false}
          dragScroll={true}
          longPressDelay={0}
          eventLongPressDelay={0}
          selectLongPressDelay={0}
          locale="es"
          firstDay={1}
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día'
          }}
          height="auto"
        />
      </div>

      {msg && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-2xl animate-bounce">
          {msg}
        </div>
      )}

      {/* MODAL DETALLE SESIÓN */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-kalian-dark w-full max-w-lg rounded-[3rem] border border-kalian-gold/20 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 bg-black/40 border-b border-kalian-gold/10 flex justify-between items-center">
              <div>
                <h3 className="text-2xl kalian-poster-text text-kalian-gold uppercase italic">Detalle de Clase</h3>
                <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-widest mt-1">{selectedSession.fecha}</p>
              </div>
              <button onClick={() => setSelectedSession(null)} className="text-kalian-gold/40 hover:text-white text-3xl transition-colors">×</button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest">Curso</p>
                <p className="text-xl font-black text-kalian-cream uppercase italic">{selectedSession.courseName}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest">Profesor</p>
                <p className="text-lg font-bold text-kalian-gold">{selectedSession.profesorNombre}</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest">Horario</p>
                  <p className="text-sm font-black text-kalian-cream">{selectedSession.hora_inicio} - {selectedSession.hora_fin}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest">Sala</p>
                  <p className="text-sm font-black text-kalian-cream uppercase">{selectedSession.sala}</p>
                </div>
              </div>

              <div className="pt-6 border-t border-kalian-gold/10 flex gap-4">
                <button 
                  onClick={() => {
                    navigate(`/staff/cursos?edit=${selectedSession.courseId}`);
                    setSelectedSession(null);
                  }}
                  className="flex-1 bg-kalian-gold text-black py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all"
                >
                  Ver Curso
                </button>
                <button 
                  onClick={() => setSelectedSession(null)}
                  className="flex-1 bg-kalian-gold/10 text-kalian-gold py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-kalian-gold/20 transition-all border border-kalian-gold/20"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RÁPIDO AÑADIR SESIÓN */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-kalian-dark w-full max-w-lg rounded-[3rem] border border-kalian-gold/20 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 bg-black/40 border-b border-kalian-gold/10 flex justify-between items-center">
              <div>
                <h3 className="text-2xl kalian-poster-text text-kalian-gold uppercase italic">Añadir Sesión</h3>
                <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-widest mt-1">{showAddModal.date}</p>
              </div>
              <button onClick={() => setShowAddModal(null)} className="text-kalian-gold/40 hover:text-white text-3xl transition-colors">×</button>
            </div>

            <form onSubmit={guardarSesionRapida} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2 tracking-widest">Seleccionar Curso</label>
                <select 
                  className="w-full p-4 bg-black/40 rounded-xl text-xs border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold/50 transition-all uppercase font-black"
                  value={nuevaSesion.cursoId}
                  onChange={e => setNuevaSesion({...nuevaSesion, cursoId: e.target.value})}
                  required
                >
                  <option value="">-- Selecciona un curso --</option>
                  {cursos.map(c => (
                    <option key={c.id} value={c.id}>{c.titulo}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2 tracking-widest">Hora Inicio</label>
                  <input 
                    type="time" 
                    className="w-full p-4 bg-black/40 rounded-xl text-xs border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold/50 transition-all"
                    value={nuevaSesion.hora_inicio}
                    onChange={e => setNuevaSesion({...nuevaSesion, hora_inicio: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2 tracking-widest">Hora Fin</label>
                  <input 
                    type="time" 
                    className="w-full p-4 bg-black/40 rounded-xl text-xs border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold/50 transition-all"
                    value={nuevaSesion.hora_fin}
                    onChange={e => setNuevaSesion({...nuevaSesion, hora_fin: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2 tracking-widest">Sala</label>
                <select 
                  className="w-full p-4 bg-black/40 rounded-xl text-xs border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold/50 transition-all uppercase font-black"
                  value={nuevaSesion.sala}
                  onChange={e => setNuevaSesion({...nuevaSesion, sala: e.target.value})}
                >
                  <option value="Sala Grande">Sala Grande</option>
                  <option value="Sala Pequeña">Sala Pequeña</option>
                  <option value="Estudio">Estudio</option>
                </select>
              </div>

              <div className="flex items-center gap-4 bg-black/40 p-5 rounded-2xl border border-kalian-gold/10 group cursor-pointer" onClick={() => setNuevaSesion({...nuevaSesion, esRecurrente: !nuevaSesion.esRecurrente})}>
                <input 
                  type="checkbox" 
                  className="w-5 h-5 accent-kalian-gold"
                  checked={nuevaSesion.esRecurrente}
                  onChange={e => setNuevaSesion({...nuevaSesion, esRecurrente: e.target.checked})}
                />
                <label className="text-[10px] font-black uppercase text-kalian-gold/60 cursor-pointer tracking-widest">
                  ¿Es una clase recurrente?
                </label>
              </div>

              {nuevaSesion.esRecurrente && (
                <div className="space-y-4 bg-kalian-gold/5 p-6 rounded-[2rem] border border-kalian-gold/10 animate-in fade-in zoom-in-95 duration-300">
                  <p className="text-[9px] font-black text-kalian-gold/60 uppercase tracking-[0.2em] mb-4">Selecciona los días de repetición:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 1, label: 'L' },
                      { id: 2, label: 'M' },
                      { id: 3, label: 'X' },
                      { id: 4, label: 'J' },
                      { id: 5, label: 'V' },
                      { id: 6, label: 'S' },
                      { id: 7, label: 'D' }
                    ].map(day => (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => {
                          const current = [...nuevaSesion.diasSemana];
                          if (current.includes(day.id)) {
                            setNuevaSesion({ ...nuevaSesion, diasSemana: current.filter(d => d !== day.id) });
                          } else {
                            setNuevaSesion({ ...nuevaSesion, diasSemana: [...current, day.id].sort() });
                          }
                        }}
                        className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all border ${
                          nuevaSesion.diasSemana.includes(day.id) 
                            ? 'bg-kalian-gold border-kalian-gold text-black shadow-lg shadow-kalian-gold/20' 
                            : 'bg-black/40 border-kalian-gold/10 text-kalian-gold/40 hover:border-kalian-gold/30'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[8px] font-black text-kalian-gold/40 uppercase tracking-[0.2em] leading-relaxed mt-4">
                    🔄 Repetirá semanalmente hasta el fin del curso
                  </p>
                </div>
              )}

              {conflictos.length > 0 && (
                <div className="bg-red-500/10 p-5 rounded-2xl border border-red-500/20 animate-in shake-1 duration-500">
                  <p className="text-[9px] font-black text-red-500 uppercase mb-3 tracking-widest">⚠️ Conflictos detectados en:</p>
                  <div className="flex flex-wrap gap-2">
                    {conflictos.map(f => (
                      <span key={f} className="bg-red-500/20 text-red-200 px-3 py-1.5 rounded-lg text-[8px] font-mono border border-red-500/30">{f}</span>
                    ))}
                  </div>
                  <p className="text-[8px] text-red-500/60 mt-3 italic">No se puede guardar si hay choques de horario o sala.</p>
                </div>
              )}

              <button className="w-full bg-kalian-gold text-black p-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] shadow-2xl shadow-kalian-gold/20 hover:bg-white transition-all">
                Guardar Sesión
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .fc {
          --fc-border-color: rgba(212, 175, 55, 0.1);
          --fc-button-bg-color: rgba(212, 175, 55, 0.1);
          --fc-button-border-color: rgba(212, 175, 55, 0.2);
          --fc-button-hover-bg-color: rgba(212, 175, 55, 0.3);
          --fc-button-active-bg-color: rgba(212, 175, 55, 0.4);
          --fc-today-bg-color: rgba(212, 175, 55, 0.05);
          font-family: inherit;
        }
        .fc .fc-toolbar-title {
          font-family: 'Kalian Poster', sans-serif;
          text-transform: uppercase;
          font-style: italic;
          color: var(--color-kalian-gold);
          font-size: 1.5rem;
        }
        .fc .fc-button {
          font-size: 0.7rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border-radius: 0.75rem;
          padding: 0.5rem 1rem;
        }
        .fc .fc-col-header-cell-cushion {
          font-size: 0.7rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: rgba(255, 255, 255, 0.4);
          padding: 1rem 0;
        }
        .fc .fc-daygrid-day-number {
          font-size: 0.8rem;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.6);
          padding: 0.5rem;
        }
        .fc-event {
          cursor: grab !important;
          border-radius: 0.5rem;
          padding: 4px 8px;
          font-size: 0.7rem;
          font-weight: 800;
          color: white !important;
          margin: 1px 0;
          border: none !important;
        }
        .fc-event:active {
          cursor: grabbing !important;
        }
        .event-public { background-color: #10b981 !important; z-index: 10 !important; }
        .event-private { background-color: #f97316 !important; z-index: 10 !important; }
        .event-curso-range { opacity: 0.3; pointer-events: none !important; z-index: 1 !important; }
        .event-sesion { background-color: #3b82f6 !important; border-left: 4px solid #1d4ed8 !important; z-index: 20 !important; }
        
        .fc .fc-daygrid-event-dot {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default MasterCalendar;
