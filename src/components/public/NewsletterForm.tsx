import React, { useState } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from '../../context/LanguageContext';
import { subscribeNewsletter } from '../../lib/brevoService';
import NewsletterLegalModal from './NewsletterLegalModal';

const isDev = import.meta.env.DEV;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POLITICA_VERSION = '2026-06-08-v2';

const NewsletterForm = () => {
  const { t } = useLanguage();
  const [form, setForm] = useState({ nombre: '', email: '' });
  const [aceptado, setAceptado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState(false);
  const [error, setError] = useState('');
  const [showLegal, setShowLegal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aceptado) return;

    const nombre = form.nombre.trim();
    const email = form.email.trim().toLowerCase();
    if (nombre.length === 0 || nombre.length > 100) {
      setError(t('newsletter.invalidName'));
      return;
    }
    if (!EMAIL_RE.test(email) || email.length > 100) {
      setError(t('newsletter.invalidEmail'));
      return;
    }

    setCargando(true);
    setError('');

    try {
      // 1. Obtener IP con timeout para evitar bloqueos
      let ip = 'unknown';
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const ipRes = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timeoutId);
        const ipData = await ipRes.json();
        ip = ipData.ip;
      } catch (e) {
        if (isDev) console.warn("No se pudo obtener la IP:", e);
      }

      // 2. Guardar en Firestore. Estado intermedio 'pendiente_confirmacion':
      // la suscripción solo se promueve a 'activo' tras el doble opt-in de Brevo,
      // que se refleja por la reconciliación semanal (reconciliarNewsletterBrevo).
      await addDoc(collection(db, "newsletter_subscribers"), {
        nombre,
        email,
        fecha: serverTimestamp(),
        ip,
        acepto_terminos: true,
        politica_version: POLITICA_VERSION,
        estado: 'pendiente_confirmacion'
      });

      // 3. Alta en Brevo via Cloud Function (la API key vive solo en el servidor).
      // Si Brevo falla, el doc queda en pendiente_confirmacion y la reconciliación
      // semanal lo recogerá; mostramos éxito al usuario igualmente porque el
      // consentimiento ya está registrado en Firestore.
      try {
        await subscribeNewsletter(nombre, email);
      } catch (e) {
        if (isDev) console.warn("Brevo subscribe falló, se recuperará por reconciliación", e);
      }

      setExito(true);
      setForm({ nombre: '', email: '' });
    } catch (err: any) {
      if (isDev) console.error("Error en suscripción:", err);
      setError(t('newsletter.submitError'));
    } finally {
      setCargando(false);
    }
  };

  if (exito) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-[2.5rem] text-center animate-in fade-in zoom-in duration-500">
        <div className="text-4xl mb-4">🎉</div>
        <h3 className="text-2xl font-black uppercase italic text-emerald-500 mb-2">{t('newsletter.successTitle')}</h3>
        <p className="text-slate-400 font-bold">{t('newsletter.successMessage')}</p>
        <button
          onClick={() => setExito(false)}
          className="mt-6 text-[10px] font-black uppercase text-slate-500 hover:text-white transition-colors tracking-widest"
        >
          {t('newsletter.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-white/10 p-8 md:p-12 rounded-[3rem] shadow-2xl max-w-xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-black uppercase italic leading-none text-white">{t('newsletter.title')}<br/><span className="text-indigo-500">{t('newsletter.titleHighlight')}</span></h2>
        <p className="text-slate-400 font-bold mt-2 text-sm uppercase tracking-tighter">{t('newsletter.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-slate-200 ml-4 tracking-widest">{t('newsletter.fullName')}</label>
          <input
            type="text"
            placeholder={t('newsletter.namePlaceholder')}
            className="w-full p-5 bg-white/10 border border-white/20 rounded-2xl outline-none focus:ring-2 ring-indigo-500 text-white font-bold transition-all placeholder:text-white/40"
            value={form.nombre}
            onChange={e => setForm({...form, nombre: e.target.value})}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-slate-200 ml-4 tracking-widest">{t('newsletter.email')}</label>
          <input
            type="email"
            placeholder="tu@email.com"
            className="w-full p-5 bg-white/10 border border-white/20 rounded-2xl outline-none focus:ring-2 ring-indigo-500 text-white font-bold transition-all placeholder:text-white/40"
            value={form.email}
            onChange={e => setForm({...form, email: e.target.value})}
            required
          />
        </div>

        <div className="pt-4">
          <label className="flex gap-4 cursor-pointer group">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={aceptado}
                onChange={e => setAceptado(e.target.checked)}
              />
              <div className="w-6 h-6 border-2 border-white/20 rounded-lg peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all flex items-center justify-center">
                <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 font-bold leading-tight select-none">
              {t('newsletter.acceptTerms')}{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setShowLegal(true); }}
                className="text-indigo-400 underline hover:text-white transition-colors"
              >
                {t('newsletter.privacyPolicy')}
              </button>.
            </span>
          </label>
        </div>

        {error && <p className="text-red-400 text-[10px] font-black uppercase tracking-widest text-center animate-pulse">{error}</p>}

        <button
          disabled={!aceptado || cargando}
          className={`w-full p-6 rounded-[2rem] font-black uppercase tracking-widest text-sm transition-all shadow-2xl ${
            aceptado && !cargando
            ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'
            : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          {cargando ? t('newsletter.processing') : t('newsletter.subscribe')}
        </button>

        <div className="text-center space-y-1 pt-4 border-t border-white/5">
          <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">{t('newsletter.dataProtectionTitle')}</p>
          <p className="text-[8px] text-slate-600 font-bold leading-relaxed">
            {t('newsletter.dataProtectionText')}
          </p>
        </div>
      </form>

      <NewsletterLegalModal isOpen={showLegal} onClose={() => setShowLegal(false)} />
    </div>
  );
};

export default NewsletterForm;
