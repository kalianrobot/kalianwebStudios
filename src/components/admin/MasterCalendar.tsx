import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, DocumentData } from 'firebase/firestore';

const MasterCalendar = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [filtro, setFiltro] = useState<'todos' | 'eventos' | 'cursos'>('todos');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const qE = query(collection(db, "eventos"), orderBy("fecha", "asc"));
      const qC = query(collection(db, "cursos"), orderBy("fechaInicio", "asc"));
      
      const [snapE, snapC] = await Promise.all([getDocs(qE), getDocs(qC)]);
      
      const calendarEvents: any[] = [];

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
          extendedProps: { type: 'evento' }
        });
      });

      // Cursos
      snapC.docs.forEach(doc => {
        const data = doc.data();
        calendarEvents.push({
          id: doc.id,
          title: `[CURSO] ${data.titulo}`,
          start: data.fechaInicio,
          end: data.fechaFin,
          backgroundColor: '#3b82f6',
          borderColor: '#2563eb',
          textColor: '#ffffff',
          className: 'event-curso',
          extendedProps: { type: 'curso' }
        });
      });

      setEvents(calendarEvents);
    };

    fetchData();
  }, []);

  const handleEventClick = (info: any) => {
    const { type } = info.event.extendedProps;
    if (type === 'evento') {
      navigate(`/staff/eventos?edit=${info.event.id}`);
    } else if (type === 'curso') {
      navigate(`/staff/cursos?edit=${info.event.id}`);
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
              onClick={() => setFiltro('cursos')}
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtro === 'cursos' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/60 hover:text-kalian-gold'}`}
            >
              Cursos
            </button>
          </div>

          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-kalian-cream/60">Cursos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-kalian-cream/60">Eventos Públicos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-kalian-cream/60">Eventos Privados</span>
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
            if (filtro === 'cursos') return ev.extendedProps.type === 'curso';
            return true;
          })}
          eventClick={handleEventClick}
          eventDisplay="block"
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
        .fc .fc-event {
          border-radius: 0.5rem;
          padding: 4px 8px;
          font-size: 0.7rem;
          font-weight: 800;
          cursor: pointer;
          border: none !important;
          color: white !important;
          margin: 1px 0;
        }
        .event-public { background-color: #10b981 !important; }
        .event-private { background-color: #f97316 !important; }
        .event-curso { background-color: #3b82f6 !important; }
        
        .fc .fc-daygrid-event-dot {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default MasterCalendar;
