import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, DocumentData } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

const GaleriaPublica = () => {
  const [exposiciones, setExposiciones] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expoSeleccionada, setExpoSeleccionada] = useState<DocumentData | null>(null);

  useEffect(() => {
    const fetchExposiciones = async () => {
      try {
        const snap = await getDocs(query(collection(db, "exposiciones"), orderBy("fechaInicio", "desc")));
        setExposiciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchExposiciones();
  }, []);

  const activas = exposiciones.filter(e => e.es_activa);
  const pasadas = exposiciones.filter(e => !e.es_activa);

  return (
    <div className="min-h-screen bg-kalian-dark text-kalian-cream font-sans pb-24">
      {/* HERO */}
      <div className="relative h-[60vh] flex flex-col items-center justify-center overflow-hidden border-b border-kalian-gold/10">
        <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/gallery/1920/1080?blur=10')] bg-cover bg-center opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-kalian-dark via-transparent to-kalian-dark/80"></div>
        
        <motion.div 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative z-10 text-center px-6"
        >
          <span className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.8em] mb-6 block animate-pulse">EXPOSICIONES & ARTE</span>
          <h1 className="text-7xl md:text-9xl kalian-poster-text text-kalian-gold leading-none tracking-tighter uppercase italic drop-shadow-2xl">
            KALIAN <span className="text-kalian-cream">GALLERY</span>
          </h1>
          <p className="max-w-2xl mx-auto mt-8 text-sm md:text-base text-kalian-cream/60 font-medium leading-relaxed tracking-wide">
            Un espacio dedicado a la expresión visual, donde artistas locales y residentes comparten su visión. 
            Desde fotografía hasta arte digital, la galería de Kalian es un lienzo vivo en constante cambio.
          </p>
        </motion.div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-24">
        {/* EXPOSICIONES ACTUALES */}
        <section className="mb-32">
          <div className="flex items-center gap-6 mb-16">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold uppercase italic tracking-tight">Exposiciones Actuales</h2>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-kalian-gold/40 to-transparent"></div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-12 h-12 border-4 border-kalian-gold/20 border-t-kalian-gold rounded-full animate-spin"></div>
            </div>
          ) : activas.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-12">
              {activas.map((expo, idx) => (
                <motion.div 
                  key={expo.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  onClick={() => setExpoSeleccionada(expo)}
                  className="group cursor-pointer"
                >
                  <div className="relative aspect-[3/4] rounded-[2.5rem] overflow-hidden border border-kalian-gold/10 shadow-2xl transition-all duration-700 group-hover:border-kalian-gold/40 group-hover:-translate-y-4">
                    {expo.imagenUrl ? (
                      <img 
                        src={expo.imagenUrl} 
                        alt={expo.titulo} 
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-kalian-gold/5 flex items-center justify-center text-8xl kalian-poster-text text-kalian-gold/10 uppercase italic">
                        {expo.titulo.charAt(0)}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>
                    
                    <div className="absolute bottom-10 left-10 right-10">
                      <span className="text-[9px] font-black text-kalian-gold uppercase tracking-[0.4em] mb-3 block">
                        {new Date(expo.fechaInicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <h3 className="text-3xl kalian-poster-text text-kalian-gold uppercase italic leading-none mb-2">{expo.titulo}</h3>
                      <p className="text-[10px] font-black text-kalian-cream/60 uppercase tracking-widest mb-6">Autor/a: {expo.autor}</p>
                      
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpoSeleccionada(expo);
                        }}
                        className="w-full py-4 bg-kalian-gold text-black rounded-xl font-black uppercase text-[10px] tracking-[0.3em] hover:bg-white transition-all"
                      >
                        Ver cartel
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-kalian-gold/5 border border-kalian-gold/10 p-20 rounded-[3rem] text-center">
              <p className="text-kalian-gold/40 font-black uppercase tracking-[0.4em] text-xs italic">Próximamente nuevas exposiciones...</p>
            </div>
          )}
        </section>

        {/* ARCHIVO / PASADAS */}
        {pasadas.length > 0 && (
          <section>
            <div className="flex items-center gap-6 mb-16">
              <h2 className="text-4xl kalian-poster-text text-kalian-gold/40 uppercase italic tracking-tight">Archivo de la Galería</h2>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-kalian-gold/20 to-transparent"></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {pasadas.map(expo => (
                <div 
                  key={expo.id} 
                  onClick={() => setExpoSeleccionada(expo)}
                  className="group cursor-pointer opacity-50 hover:opacity-100 transition-all"
                >
                  <div className="aspect-[3/4] rounded-2xl overflow-hidden border border-kalian-gold/10 mb-4 grayscale group-hover:grayscale-0 transition-all duration-500">
                    <img src={expo.imagenUrl} alt={expo.titulo} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <h4 className="text-[10px] kalian-poster-text text-kalian-gold uppercase italic truncate">{expo.titulo}</h4>
                  <p className="text-[8px] font-black text-kalian-cream/40 uppercase tracking-widest mb-2">{expo.autor}</p>
                  <p className="text-[7px] font-black text-kalian-gold/30 uppercase tracking-widest mb-3">{expo.fechaInicio}</p>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpoSeleccionada(expo);
                    }}
                    className="w-full py-2 bg-kalian-gold/10 text-kalian-gold border border-kalian-gold/20 rounded-lg font-black uppercase text-[7px] tracking-widest hover:bg-kalian-gold hover:text-black transition-all"
                  >
                    Ver cartel
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* MODAL DETALLE */}
      <AnimatePresence>
        {expoSeleccionada && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-kalian-dark/95 backdrop-blur-xl z-[100] flex items-center justify-center p-6 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              className="w-full max-w-5xl bg-black border border-kalian-gold/20 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col md:flex-row relative my-auto"
            >
              <button 
                onClick={() => setExpoSeleccionada(null)}
                className="absolute top-8 right-8 w-12 h-12 bg-black/40 backdrop-blur-md text-kalian-gold rounded-full flex items-center justify-center font-black text-2xl hover:bg-kalian-gold hover:text-black transition-all z-20"
              >✕</button>

              <div className="w-full md:w-1/2 h-[50vh] md:h-auto bg-kalian-gold/5">
                <img 
                  src={expoSeleccionada.imagenUrl} 
                  alt={expoSeleccionada.titulo} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="w-full md:w-1/2 p-12 md:p-16 flex flex-col justify-center space-y-8">
                <div>
                  <span className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.5em] mb-6 block">
                    {expoSeleccionada.es_activa ? 'Exposición Actual' : 'Archivo Galería'}
                  </span>
                  <h2 className="text-5xl md:text-6xl kalian-poster-text text-kalian-gold uppercase italic leading-none tracking-tighter mb-4">
                    {expoSeleccionada.titulo}
                  </h2>
                  <p className="text-xl font-black text-kalian-cream uppercase tracking-widest italic">
                    {expoSeleccionada.autor}
                  </p>
                </div>

                <div className="h-[1px] w-20 bg-kalian-gold/30"></div>

                <div className="space-y-6">
                  <h4 className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">Sobre la exposición</h4>
                  <p className="text-sm md:text-base text-kalian-cream/70 font-medium leading-relaxed whitespace-pre-line">
                    {expoSeleccionada.descripcion}
                  </p>
                </div>

                <div className="pt-8">
                  <p className="text-[9px] font-black text-kalian-gold/20 uppercase tracking-[0.4em]">
                    Inaugurada el {new Date(expoSeleccionada.fechaInicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GaleriaPublica;
