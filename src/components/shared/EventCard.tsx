import React from 'react';
import { motion } from 'motion/react';
import { DocumentData } from 'firebase/firestore';

interface EventCardProps {
  event: DocumentData;
  isSocio?: boolean;
  onClick: (event: DocumentData) => void;
  onViewPoster?: (url: string) => void;
  isReservaAbierta?: boolean;
  mensajeApertura?: string;
}

const EventCard: React.FC<EventCardProps> = ({ 
  event, 
  isSocio = false, 
  onClick, 
  onViewPoster,
  isReservaAbierta = true,
  mensajeApertura
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ y: -10, scale: 1.02 }}
      className="bg-black/40 border border-kalian-gold/10 rounded-[2.5rem] overflow-hidden hover:border-kalian-gold/40 transition-all group cursor-pointer relative flex flex-col h-full shadow-2xl hover:shadow-kalian-gold/10"
      onClick={() => onClick(event)}
    >
      {/* IMAGEN DEL EVENTO */}
      <div className="h-64 relative overflow-hidden bg-kalian-gold/5 border-b border-kalian-gold/10 flex-shrink-0">
        {event.imagenUrl ? (
          <img 
            src={event.imagenUrl} 
            alt={event.titulo} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-10">
            <span className="text-8xl kalian-poster-text text-kalian-gold">{event.titulo?.charAt(0)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
        <div className="absolute bottom-4 left-6 right-6 flex justify-between items-end">
          {event.tiene_descuento && (
            <span className="bg-kalian-gold text-black text-[9px] font-black uppercase px-4 py-1.5 rounded-full tracking-widest shadow-lg">Descuento Soci@s</span>
          )}
          <span className="text-kalian-gold kalian-poster-text text-4xl drop-shadow-lg ml-auto">{event.precio_estandar}€</span>
        </div>
      </div>
      
      <div className="p-8 space-y-6 flex-grow flex flex-col justify-between relative z-10">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors leading-none uppercase italic">{event.titulo}</h3>
            <div className="w-12 h-1 bg-kalian-gold/30 group-hover:w-full transition-all duration-500"></div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">Sala</p>
              <div className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: (event.sala || 'SALA GRANDE') === 'Estudio' ? '#f59e0b' : ((event.sala || 'SALA GRANDE') === 'Local Pequeño' ? '#10b981' : '#3b82f6') }}
                ></div>
                <p className="font-bold text-kalian-cream/80 uppercase text-[10px] tracking-widest">{event.sala || 'SALA GRANDE'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">Fecha y Hora</p>
            <p className="font-bold text-kalian-cream/80 uppercase text-sm tracking-widest">
              {event.fecha ? new Date(event.fecha).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Fecha pendiente'}
            </p>
          </div>
        </div>
        
        <div className="flex flex-col gap-3 mt-4">
          {event.imagenUrl && onViewPoster && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onViewPoster(event.imagenUrl);
              }}
              className="w-full bg-kalian-gold/10 text-kalian-gold border border-kalian-gold/20 p-4 rounded-2xl kalian-poster-text text-sm tracking-widest hover:bg-kalian-gold/20 transition-all"
            >
              Ver Cartel
            </button>
          )}
          
          {isReservaAbierta ? (
            <button className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/10">
              Reservar Plaza
            </button>
          ) : (
            <div className="w-full bg-slate-800/50 text-slate-500 p-5 rounded-2xl kalian-poster-text text-lg tracking-widest text-center border border-white/5">
              PRÓXIMAMENTE
              {mensajeApertura && (
                <p className="text-[10px] font-black uppercase tracking-widest mt-1">{mensajeApertura}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default EventCard;
