import React from 'react';
import NewsletterForm from '../components/public/NewsletterForm';

const NewsletterPage = () => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <NewsletterForm />
      </div>
      <p className="mt-8 text-slate-600 text-[10px] font-black uppercase tracking-widest">
        Acceso Privado - Kalian HKG
      </p>
    </div>
  );
};

export default NewsletterPage;
