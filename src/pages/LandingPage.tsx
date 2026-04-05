import React from 'react';
import { Link } from 'react-router-dom';
import { KalianLogo } from '../components/public/KalianLogo';

const LandingPage = () => {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-kalian-dark">
      {/* Background Image (Sofa) */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=1920" 
          alt="Kalian Sofa" 
          className="w-full h-full object-cover brightness-[0.25] grayscale-[0.5]"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center space-y-12 px-6 max-w-4xl">
        {/* Official Logo */}
        <div className="flex justify-center mb-8">
          <KalianLogo size="lg" />
        </div>

        <div className="space-y-2">
          <h1 className="text-7xl md:text-9xl kalian-poster-text text-kalian-gold tracking-[-0.05em]">
            KALIAN <span className="text-kalian-cream opacity-90">HKG</span>
          </h1>
          <p className="text-kalian-cream/60 text-sm md:text-lg font-bold tracking-[0.6em] uppercase italic">
            Hiri Kultur Gunea
          </p>
        </div>

        {/* Enlaces Discretos */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-20 pt-12">
          <Link 
            to="/login" 
            className="group flex flex-col items-center gap-3"
          >
            <span className="text-kalian-cream/50 group-hover:text-kalian-gold font-black uppercase tracking-[0.4em] text-[10px] transition-all duration-500">
              Acceso Socios
            </span>
            <div className="w-8 group-hover:w-24 h-[2px] bg-kalian-gold transition-all duration-700 ease-in-out"></div>
          </Link>

          <div className="hidden md:block w-[1px] h-8 bg-kalian-gold/20"></div>

          <Link 
            to="/login-admin" 
            className="group flex flex-col items-center gap-3"
          >
            <span className="text-kalian-cream/50 group-hover:text-kalian-cream font-black uppercase tracking-[0.4em] text-[10px] transition-all duration-500">
              Staff
            </span>
            <div className="w-8 group-hover:w-24 h-[2px] bg-kalian-cream/30 transition-all duration-700 ease-in-out"></div>
          </Link>
        </div>
      </div>

      {/* Footer (Minimalist) */}
      <div className="absolute bottom-10 left-0 right-0 text-center">
        <div className="flex justify-center gap-4 mb-4 opacity-20">
          <div className="w-12 h-[1px] bg-kalian-gold"></div>
          <div className="w-12 h-[1px] bg-kalian-gold"></div>
          <div className="w-12 h-[1px] bg-kalian-gold"></div>
        </div>
        <p className="text-kalian-gold/20 text-[9px] font-black uppercase tracking-[1em]">
          ASOCIACIÓN CULTURAL
        </p>
      </div>
    </div>
  );
};

export default LandingPage;
