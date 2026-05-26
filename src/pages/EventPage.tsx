import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, DocumentData } from 'firebase/firestore';
import ReservaForm from '../components/public/ReservaForm';
import KalianHeader from '../components/shared/KalianHeader';
import { useLanguage } from '../context/LanguageContext';

const EventPage = () => {
  const { id } = useParams();
  const { t } = useLanguage();
  const [event, setEvent] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchEvent = async () => {
      if (!id) return;
      try {
        const snap = await getDoc(doc(db, "eventos", id));
        if (snap.exists()) {
          setEvent({ id: snap.id, ...snap.data() });
        } else {
          setError(t('event.notExists'));
        }
      } catch (err) {
        console.error(err);
        setError(t('event.loadError'));
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-kalian-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-kalian-gold"></div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-kalian-dark text-kalian-cream flex flex-col items-center justify-center p-10 text-center">
        <h1 className="text-4xl kalian-poster-text text-kalian-gold mb-4 uppercase italic">{error || t('event.notFound')}</h1>
        <Link to="/programacion" className="bg-kalian-gold text-black px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest mt-8">{t('event.backToProgram')}</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kalian-dark text-kalian-cream font-sans pb-20">
      <KalianHeader showPanelButton={false} />

      <div className="max-w-xl mx-auto px-6 pt-20">
        <ReservaForm item={event} alCerrar={() => window.history.back()} />
      </div>
    </div>
  );
};

export default EventPage;
