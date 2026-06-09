import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

type Accion = 'confirmado' | 'baja' | 'no-reconfirmado';

const ACCIONES_VALIDAS: Accion[] = ['confirmado', 'baja', 'no-reconfirmado'];

const NewsletterEstadoPage = () => {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  const raw = (params.get('accion') || '').toLowerCase();
  const accion = (ACCIONES_VALIDAS as string[]).includes(raw) ? (raw as Accion) : null;

  const key = accion
    ? accion === 'no-reconfirmado' ? 'noReconfirmado' : accion
    : 'fallback';

  const title = t(`newsletterEstado.${key}.title`);
  const body = t(`newsletterEstado.${key}.body`);
  const cta = accion ? t(`newsletterEstado.${key}.cta`) : t('newsletterEstado.fallback.cta');

  const accent = accion === 'baja' || accion === 'no-reconfirmado' ? 'text-rose-400' : 'text-indigo-500';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl bg-slate-900 border border-white/10 p-8 md:p-12 rounded-[3rem] shadow-2xl text-center">
        <h1 className={`text-3xl md:text-4xl font-black uppercase italic leading-none text-white mb-6`}>
          <span className={accent}>{title}</span>
        </h1>
        <p className="text-slate-300 font-bold text-sm leading-relaxed mb-10 whitespace-pre-line">
          {body}
        </p>
        <Link
          to="/"
          className="inline-block px-8 py-5 rounded-[2rem] bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-2xl"
        >
          {cta}
        </Link>
      </div>
      <p className="mt-8 text-slate-600 text-[10px] font-black uppercase tracking-widest">
        {t('newsletter.privateAccess')}
      </p>
    </div>
  );
};

export default NewsletterEstadoPage;
