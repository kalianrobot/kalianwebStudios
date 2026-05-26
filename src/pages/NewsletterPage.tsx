import React from 'react';
import NewsletterForm from '../components/public/NewsletterForm';
import { useLanguage } from '../context/LanguageContext';

const NewsletterPage = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
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
