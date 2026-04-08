import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KalianLogo } from '../components/public/KalianLogo';
import { useAuth } from '../context/AuthContext';

const LandingPage = () => {
  const { user, role, isAdmin, isTeacher, socioData, logoutSocio } = useAuth();
  const navigate = useNavigate();

  const getDashboardPath = () => {
    if (role === 'admin') return '/staff';
    if (role === 'teacher') return '/profesor';
    return '/home';
  };

  const getRoleName = () => {
    if (role === 'admin') return 'ADMINISTRADOR';
    if (role === 'teacher') return 'PROFESOR';
    return 'SOCIO';
  };

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

        {user ? (
          <div className="pt-12 space-y-8 animate-in fade-in zoom-in duration-700">
            <div className="space-y-2">
              <p className="text-kalian-gold/60 text-[10px] font-black uppercase tracking-[0.4em]">Sesión iniciada como</p>
              <p className="text-kalian-cream text-2xl kalian-poster-text tracking-widest">
                {isAdmin && 'ADMINISTRADOR '}
                {isTeacher && 'PROFESOR '}
                {socioData && 'SOCI@S'}
              </p>
              <p className="text-kalian-gold/30 text-[9px] font-mono">{user.email}</p>
            </div>
            
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="flex flex-wrap justify-center gap-4">
                {isAdmin && (
                  <button 
                    onClick={() => navigate('/staff')}
                    className="bg-indigo-600 text-white px-8 py-4 rounded-2xl kalian-poster-text text-lg tracking-[0.2em] hover:bg-white hover:text-indigo-600 transition-all shadow-2xl shadow-indigo-600/20"
                  >
                    PANEL ADMIN →
                  </button>
                )}
                {isTeacher && (
                  <button 
                    onClick={() => navigate('/profesor')}
                    className="bg-emerald-600 text-white px-8 py-4 rounded-2xl kalian-poster-text text-lg tracking-[0.2em] hover:bg-white hover:text-emerald-600 transition-all shadow-2xl shadow-emerald-600/20"
                  >
                    PANEL PROFESOR →
                  </button>
                )}
                {socioData && (
                  <button 
                    onClick={() => navigate('/home')}
                    className="bg-kalian-gold text-black px-8 py-4 rounded-2xl kalian-poster-text text-lg tracking-[0.2em] hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20"
                  >
                    PANEL SOCI@S →
                  </button>
                )}
              </div>
              
              <button 
                onClick={() => logoutSocio()}
                className="mt-4 text-kalian-cream/40 hover:text-red-400 text-[10px] font-black uppercase tracking-[0.3em] transition-colors border-b border-transparent hover:border-red-400/40 pb-1"
              >
                Cerrar Sesión / Cambiar Cuenta
              </button>
            </div>
          </div>
        ) : (
          /* Enlaces Discretos */
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 pt-12">
            <Link 
              to="/login" 
              className="group flex flex-col items-center gap-3"
            >
              <span className="text-kalian-cream/50 group-hover:text-kalian-gold font-black uppercase tracking-[0.4em] text-[10px] transition-all duration-500">
                Acceso Soci@s
              </span>
              <div className="w-8 group-hover:w-24 h-[2px] bg-kalian-gold transition-all duration-700 ease-in-out"></div>
            </Link>

            <div className="hidden md:block w-[1px] h-8 bg-kalian-gold/20"></div>

            <Link 
              to="/profesor/login" 
              className="group flex flex-col items-center gap-3"
            >
              <span className="text-kalian-cream/50 group-hover:text-kalian-cream font-black uppercase tracking-[0.4em] text-[10px] transition-all duration-500">
                Profesores
              </span>
              <div className="w-8 group-hover:w-24 h-[2px] bg-kalian-cream/30 transition-all duration-700 ease-in-out"></div>
            </Link>

            <div className="hidden md:block w-[1px] h-8 bg-kalian-gold/20"></div>

            <Link 
              to="/staff/login" 
              className="group flex flex-col items-center gap-3"
            >
              <span className="text-kalian-cream/50 group-hover:text-kalian-cream font-black uppercase tracking-[0.4em] text-[10px] transition-all duration-500">
                Staff
              </span>
              <div className="w-8 group-hover:w-24 h-[2px] bg-kalian-cream/30 transition-all duration-700 ease-in-out"></div>
            </Link>
          </div>
        )}
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
