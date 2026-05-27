import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, DocumentData } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { formatDate } from '../i18n/dateFormat';

const GaleriaPublica = () => {
  const navigate = useNavigate();
  const { t, tField, language } = useLanguage();
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

  const hoy = new Date().toISOString().split('T')[0];

  const actual = exposiciones.find(e => 
    e.fechaInicio <= hoy && (e.fechaFin ? e.fechaFin >= hoy : true)
  );

  const proximas = exposiciones
    .filter(e => e.fechaInicio > hoy)
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));

  const historico = exposiciones.filter(e => 
    e.fechaFin ? e.fechaFin < hoy : false
  );

  return (
    <div className="min-h-screen bg-kalian-dark text-kalian-cream font-sans pb-24">
      {/* HERO */}
      <div className="relative h-[20vh] min-h-[180px] flex flex-col items-center justify-center overflow-hidden border-b border-kalian-gold/10">
        <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/gallery/1920/1080?blur=10')] bg-cover bg-center opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-kalian-dark via-transparent to-kalian-dark/80"></div>

        {/* BOTÓN VOLVER A HOME */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-6 left-6 z-20 flex items-center gap-3 text-kalian-gold font-black uppercase text-[10px] tracking-[0.4em] hover:text-white transition-all group"
        >
          <span className="text-xl group-hover:-translate-x-2 transition-transform">←</span> {t('btn.back')}
        </button>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative z-10 text-center px-6"
        >
          <span className="text-[9px] font-black text-kalian-gold uppercase tracking-[0.8em] mb-2 block animate-pulse">{t('gallery.subtitle')}</span>
          <h1 className="text-4xl md:text-5xl kalian-poster-text text-kalian-gold leading-none tracking-tighter uppercase italic drop-shadow-2xl">
            KALIAN <span className="text-kalian-cream">GALLERY</span>
          </h1>
          <p className="max-w-xl mx-auto mt-2 text-xs md:text-sm text-kalian-cream/60 font-medium leading-snug tracking-wide">
            {t('gallery.description')}
          </p>
        </motion.div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-12">
        {/* EXPOSICIÓN ACTUAL */}
        <section className="mb-32">
          <div className="flex items-center gap-6 mb-16">
            <h2 className="text-4xl kalian-poster-text text-kalian-gold uppercase italic tracking-tight">{t('gallery.currentExpo')}</h2>
            <div className="h-[1px] flex-1 bg-gradient-to-r from-kalian-gold/40 to-transparent"></div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-12 h-12 border-4 border-kalian-gold/20 border-t-kalian-gold rounded-full animate-spin"></div>
            </div>
          ) : actual ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setExpoSeleccionada(actual)}
              className="relative group cursor-pointer max-w-5xl mx-auto"
            >
              <div className="relative aspect-[21/9] rounded-[3rem] overflow-hidden border border-kalian-gold/20 shadow-2xl transition-all duration-700 group-hover:border-kalian-gold/50">
                {actual.imagenUrl ? (
                  <img
                    src={actual.imagenUrl}
                    alt={tField(actual, 'titulo')}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-kalian-gold/5 flex items-center justify-center text-8xl kalian-poster-text text-kalian-gold/10 uppercase italic">
                    {tField(actual, 'titulo').charAt(0)}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity"></div>
                
                <div className="absolute bottom-12 left-12 right-12 flex flex-col md:flex-row justify-between items-end gap-8">
                  <div className="space-y-4">
                    <span className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.6em] block">
                      {t('gallery.ongoing')} • {formatDate(actual.fechaInicio, language, { day: 'numeric', month: 'short' })} AL {formatDate(actual.fechaFin, language, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <h3 className="text-5xl md:text-7xl kalian-poster-text text-kalian-gold uppercase italic leading-none tracking-tighter">{tField(actual, 'titulo')}</h3>
                    <p className="text-xl font-black text-kalian-cream/80 uppercase tracking-widest">{t('gallery.author')} {tField(actual, 'autor')}</p>
                  </div>

                  <button
                    className="px-12 py-5 bg-kalian-gold text-black rounded-2xl font-black uppercase text-xs tracking-[0.4em] hover:bg-white transition-all shadow-xl shadow-kalian-gold/20"
                  >
                    {t('gallery.viewExpo')}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="bg-kalian-gold/5 border border-kalian-gold/10 p-20 rounded-[3rem] text-center">
              <p className="text-kalian-gold/40 font-black uppercase tracking-[0.4em] text-xs italic">{t('home.noExpoSoon')}…</p>
            </div>
          )}
        </section>

        {/* PRÓXIMAS EXPOSICIONES */}
        {proximas.length > 0 && (
          <section className="mb-32">
            <div className="flex items-center gap-6 mb-16">
              <h2 className="text-4xl kalian-poster-text text-kalian-gold uppercase italic tracking-tight">{t('gallery.upcoming')}</h2>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-kalian-gold/40 to-transparent"></div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-12">
              {proximas.map((expo, idx) => (
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
                        alt={tField(expo, 'titulo')}
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-kalian-gold/5 flex items-center justify-center text-8xl kalian-poster-text text-kalian-gold/10 uppercase italic">
                        {tField(expo, 'titulo').charAt(0)}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>
                    
                    <div className="absolute bottom-10 left-10 right-10">
                      <span className="text-[9px] font-black text-kalian-gold uppercase tracking-[0.4em] mb-3 block">
                        {t('gallery.comingSoon')} • {formatDate(expo.fechaInicio, language, { day: 'numeric', month: 'short' })}
                      </span>
                      <h3 className="text-3xl kalian-poster-text text-kalian-gold uppercase italic leading-none mb-2">{tField(expo, 'titulo')}</h3>
                      <p className="text-[10px] font-black text-kalian-cream/60 uppercase tracking-widest mb-6">{t('gallery.author')} {tField(expo, 'autor')}</p>

                      <button
                        className="w-full py-4 bg-kalian-gold/10 text-kalian-gold border border-kalian-gold/20 rounded-xl font-black uppercase text-[10px] tracking-[0.3em] hover:bg-kalian-gold hover:text-black transition-all"
                      >
                        {t('gallery.viewDetails')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* ARCHIVO / PASADAS */}
        {historico.length > 0 && (
          <section>
            <div className="flex items-center gap-6 mb-16">
              <h2 className="text-4xl kalian-poster-text text-kalian-gold/40 uppercase italic tracking-tight">{t('gallery.archive')}</h2>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-kalian-gold/20 to-transparent"></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {historico.map(expo => (
                <div 
                  key={expo.id} 
                  onClick={() => setExpoSeleccionada(expo)}
                  className="group cursor-pointer opacity-50 hover:opacity-100 transition-all"
                >
                  <div className="aspect-[3/4] rounded-2xl overflow-hidden border border-kalian-gold/10 mb-4 grayscale group-hover:grayscale-0 transition-all duration-500">
                    <img src={expo.imagenUrl} alt={tField(expo, 'titulo')} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <h4 className="text-[10px] kalian-poster-text text-kalian-gold uppercase italic truncate">{tField(expo, 'titulo')}</h4>
                  <p className="text-[8px] font-black text-kalian-cream/40 uppercase tracking-widest mb-2">{tField(expo, 'autor')}</p>
                  <p className="text-[7px] font-black text-kalian-gold/30 uppercase tracking-widest mb-3">{expo.fechaInicio} - {expo.fechaFin}</p>
                  <button
                    className="w-full py-2 bg-kalian-gold/10 text-kalian-gold border border-kalian-gold/20 rounded-lg font-black uppercase text-[7px] tracking-widest hover:bg-kalian-gold hover:text-black transition-all"
                  >
                    {t('event.viewPoster')}
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
              {/* BOTÓN VOLVER (MODAL) */}
              <button
                onClick={() => setExpoSeleccionada(null)}
                className="absolute top-8 left-8 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-md text-kalian-gold px-4 py-2 rounded-full font-black uppercase text-[8px] tracking-[0.3em] hover:bg-kalian-gold hover:text-black transition-all"
              >
                {t('gallery.back')}
              </button>

              <button 
                onClick={() => setExpoSeleccionada(null)}
                className="absolute top-8 right-8 w-12 h-12 bg-black/40 backdrop-blur-md text-kalian-gold rounded-full flex items-center justify-center font-black text-2xl hover:bg-kalian-gold hover:text-black transition-all z-20"
              >✕</button>

              <div className="w-full md:w-1/2 h-[50vh] md:h-auto bg-kalian-gold/5">
                <img
                  src={expoSeleccionada.imagenUrl}
                  alt={tField(expoSeleccionada, 'titulo')}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="w-full md:w-1/2 p-12 md:p-16 flex flex-col justify-center space-y-8">
                <div>
                  <span className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.5em] mb-6 block">
                    {expoSeleccionada.es_activa ? t('gallery.currentExpoLabel') : t('gallery.archiveLabel')}
                  </span>
                  <h2 className="text-5xl md:text-6xl kalian-poster-text text-kalian-gold uppercase italic leading-none tracking-tighter mb-4">
                    {tField(expoSeleccionada, 'titulo')}
                  </h2>
                  <p className="text-xl font-black text-kalian-cream uppercase tracking-widest italic">
                    {tField(expoSeleccionada, 'autor')}
                  </p>
                </div>

                <div className="h-[1px] w-20 bg-kalian-gold/30"></div>

                <div className="space-y-6">
                  <h4 className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em]">{t('gallery.about')}</h4>
                  <p className="text-sm md:text-base text-kalian-cream/70 font-medium leading-relaxed whitespace-pre-line">
                    {tField(expoSeleccionada, 'descripcion')}
                  </p>
                </div>

                <div className="pt-8">
                  <p className="text-[9px] font-black text-kalian-gold/20 uppercase tracking-[0.4em]">
                    {formatDate(expoSeleccionada.fechaInicio, language, { day: 'numeric', month: 'long', year: 'numeric' })} — {formatDate(expoSeleccionada.fechaFin, language, { day: 'numeric', month: 'long', year: 'numeric' })}
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
