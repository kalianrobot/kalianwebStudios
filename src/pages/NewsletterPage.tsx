import React from 'react';
import { Link } from 'react-router-dom';
import NewsletterForm from '../components/public/NewsletterForm';
import { useLanguage } from '../context/LanguageContext';

const NewsletterPage = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl mb-6">
        <Link
          to="/programacion"
          className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span>
          {t('newsletter.backToProgram')}
        </Link>
      </div>
      <div className="w-full max-w-2xl">
        <NewsletterForm />
      </div>
      <p className="mt-8 text-slate-600 text-[10px] font-black uppercase tracking-widest">
        {t('newsletter.privateAccess')}
      </p>
    </div>
  );
};

export default NewsletterPage;
