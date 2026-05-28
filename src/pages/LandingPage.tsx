import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { KalianLogo } from '../components/public/KalianLogo';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const FALLBACK_HERO = "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=1920";

const LandingPage = () => {
  const { user, role, isAdmin, isTeacher, socioData, logoutSocio } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [inactivoMsg, setInactivoMsg] = useState<string | null>(null);
  const [heroUrl, setHeroUrl] = useState<string>(FALLBACK_HERO);

  useEffect(() => {
    getDoc(doc(db, "config", "main")).then(snap => {
      if (snap.exists() && snap.data().heroImageUrl) {
        setHeroUrl(snap.data().heroImageUrl);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (location.state?.msg) {
      setInactivoMsg(location.state.msg);
      // Limpiar el estado para que no vuelva a salir al recargar
      window.history.replaceState({}, document.title);
      
      const timer = setTimeout(() => setInactivoMsg(null), 15000);
      return () => clearTimeout(timer);
    }
  }, [location]);

  const getDashboardPath = () => {
    if (role === 'admin') return '/staff';
    if (role === 'teacher') return '/profesor';
    return '/home';
  };

  const getRoleName = () => {
    if (role === 'admin') return t('landing.roleAdmin');
    if (role === 'teacher') return t('landing.roleTeacher');
    return t('landing.roleMember');
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-kalian-dark">
      {/* Background Hero Image */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroUrl}
          alt="Hero"
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

        {inactivoMsg && (
          <div className="relative bg-amber-500/20 border border-amber-500/50 text-amber-200 p-6 rounded-2xl mb-8 animate-in fade-in zoom-in duration-300 max-w-2xl mx-auto">
            <button 
              onClick={() => setInactivoMsg(null)}
              className="absolute top-2 right-2 p-2 text-amber-500/50 hover:text-white transition-colors"
            >
              ✕
            </button>
            <p className="text-sm font-bold uppercase tracking-widest mb-4">{inactivoMsg}</p>
            <div className="pt-2 border-t border-amber-500/30">
              <Link 
                to="/programacion" 
                className="text-xs font-black uppercase tracking-[0.3em] text-kalian-gold hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <span>{t('landing.publicAccess')}</span>
                <span className="text-lg">→</span>
              </Link>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h1 className="text-7xl md:text-9xl kalian-poster-text text-kalian-gold tracking-[-0.05em]">
            KALIAN <span className="text-kalian-cream opacity-90">HKG</span>
          </h1>
          <p className="text-kalian-cream/60 text-sm md:text-lg font-bold tracking-[0.6em] uppercase italic">
            {t('landing.subtitle')}
          </p>
        </div>

        {user ? (
          <div className="pt-12 space-y-8 animate-in fade-in zoom-in duration-700">
            <div className="space-y-2">
              <p className="text-kalian-gold/60 text-[10px] font-black uppercase tracking-[0.4em]">{t('landing.sessionAs')}</p>
              <p className="text-kalian-cream text-2xl kalian-poster-text tracking-widest">
                {isAdmin && `${t('landing.roleAdmin')} `}
                {isTeacher && `${t('landing.roleTeacher')} `}
                {socioData && t('landing.roleMember')}
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
                    {t('landing.adminPanel')}
                  </button>
                )}
                {isTeacher && (
                  <button 
                    onClick={() => navigate('/profesor')}
                    className="bg-emerald-600 text-white px-8 py-4 rounded-2xl kalian-poster-text text-lg tracking-[0.2em] hover:bg-white hover:text-emerald-600 transition-all shadow-2xl shadow-emerald-600/20"
                  >
                    {t('landing.teacherPanel')}
                  </button>
                )}
                {socioData && (
                  <button 
                    onClick={() => navigate('/home')}
                    className="bg-kalian-gold text-black px-8 py-4 rounded-2xl kalian-poster-text text-lg tracking-[0.2em] hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20"
                  >
                    {t('landing.memberPanel')}
                  </button>
                )}
              </div>
              
              <button 
                onClick={() => logoutSocio()}
                className="mt-4 text-kalian-cream/40 hover:text-red-400 text-[10px] font-black uppercase tracking-[0.3em] transition-colors border-b border-transparent hover:border-red-400/40 pb-1"
              >
                {t('landing.logoutSwitch')}
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
                {t('landing.memberAccess')}
              </span>
              <div className="w-8 group-hover:w-24 h-[2px] bg-kalian-gold transition-all duration-700 ease-in-out"></div>
            </Link>

            <div className="hidden md:block w-[1px] h-8 bg-kalian-gold/20"></div>

            <Link 
              to="/profesor/login" 
              className="group flex flex-col items-center gap-3"
            >
              <span className="text-kalian-cream/50 group-hover:text-kalian-cream font-black uppercase tracking-[0.4em] text-[10px] transition-all duration-500">
                {t('landing.teachers')}
              </span>
              <div className="w-8 group-hover:w-24 h-[2px] bg-kalian-cream/30 transition-all duration-700 ease-in-out"></div>
            </Link>

            <div className="hidden md:block w-[1px] h-8 bg-kalian-gold/20"></div>

            <Link 
              to="/staff/login" 
              className="group flex flex-col items-center gap-3"
            >
              <span className="text-kalian-cream/50 group-hover:text-kalian-cream font-black uppercase tracking-[0.4em] text-[10px] transition-all duration-500">
                {t('landing.staff')}
              </span>
              <div className="w-8 group-hover:w-24 h-[2px] bg-kalian-cream/30 transition-all duration-700 ease-in-out"></div>
            </Link>
          </div>
        )}
      </div>

      {/* Footer (Minimalist) */}
      <div className="absolute bottom-10 left-0 right-0 text-center">
        <Link
          to="/donaciones"
          className="inline-block mb-6 text-kalian-gold/70 hover:text-kalian-gold font-black uppercase tracking-[0.4em] text-[10px] border-b border-kalian-gold/30 hover:border-kalian-gold pb-1 transition-all"
        >
          {t('donations.cta')}
        </Link>
        <div className="flex justify-center gap-4 mb-4 opacity-20">
          <div className="w-12 h-[1px] bg-kalian-gold"></div>
          <div className="w-12 h-[1px] bg-kalian-gold"></div>
          <div className="w-12 h-[1px] bg-kalian-gold"></div>
        </div>
        <p className="text-kalian-gold/20 text-[9px] font-black uppercase tracking-[1em]">
          {t('landing.culturalAssociation')}
        </p>
      </div>
    </div>
  );
};

export default LandingPage;
