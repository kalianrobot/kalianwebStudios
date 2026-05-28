import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { KalianLogo } from './KalianLogo';

const Navbar = () => {
  const { user, isAdmin, isTeacher, socioData, logoutSocio } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logoutSocio().then(() => {
      navigate('/');
    });
  };

  const isSocioArea = location.pathname.startsWith('/home') || location.pathname.startsWith('/perfil');
  const isAdminArea = location.pathname.startsWith('/staff');
  const isTeacherArea = location.pathname.startsWith('/profesor');

  const hasMultipleRoles = [isAdmin, isTeacher, !!socioData].filter(Boolean).length > 1;

  return (
    <nav className="flex flex-wrap gap-y-2 justify-between items-center p-3 md:p-6 bg-kalian-dark text-kalian-cream border-b border-kalian-gold/10 shadow-2xl sticky top-0 z-50">
      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3 group cursor-default">
            <KalianLogo size="sm" showText={true} />
          </div>
        ) : (
          <Link to="/" className="flex items-center gap-3 group">
            <KalianLogo size="sm" showText={true} />
          </Link>
        )}
      </div>
      
      <div className="flex flex-wrap items-center gap-2 md:gap-6">
        {/* Selector de Idioma */}
        <div className="flex items-center bg-black/40 rounded-full border border-kalian-gold/10 p-1">
          <button 
            onClick={() => setLanguage('es')}
            className={`px-3 py-1 text-[9px] font-black rounded-full transition-all ${language === 'es' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/40 hover:text-kalian-gold'}`}
          >ES</button>
          <button 
            onClick={() => setLanguage('eu')}
            className={`px-3 py-1 text-[9px] font-black rounded-full transition-all ${language === 'eu' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/40 hover:text-kalian-gold'}`}
          >EU</button>
        </div>

        {user ? (
          <div className="flex flex-wrap items-center gap-2 md:gap-6 lg:gap-8">
            {/* Links contextuales según el área actual */}
            {!isAdminArea && (
              <Link to="/galeria" className={`text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.1em] md:tracking-[0.3em] ${location.pathname === '/galeria' ? 'text-kalian-gold' : ''}`}>{t('nav.gallery')}</Link>
            )}
            
            {isSocioArea && (
              <>
                <Link to="/home" className={`text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.1em] md:tracking-[0.3em] ${location.pathname === '/home' ? 'text-kalian-gold' : ''}`}>{t('nav.catalog')}</Link>
                <Link to="/perfil" className={`text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.1em] md:tracking-[0.3em] ${location.pathname === '/perfil' ? 'text-kalian-gold' : ''}`}>{t('nav.panel')}</Link>
              </>
            )}
            
            {isAdminArea && (
              <Link to="/staff" className={`text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.1em] md:tracking-[0.3em] ${location.pathname === '/staff' ? 'text-kalian-gold' : ''}`}>{t('nav.admin')}</Link>
            )}

            {isTeacherArea && (
              <Link to="/profesor" className={`text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.1em] md:tracking-[0.3em] ${location.pathname === '/profesor' ? 'text-kalian-gold' : ''}`}>{t('nav.teacher')}</Link>
            )}

            <div className="hidden md:block h-4 w-[1px] bg-kalian-gold/20"></div>

            {hasMultipleRoles && (
              <Link 
                to="/" 
                className="text-[10px] font-black uppercase text-kalian-gold/40 hover:text-kalian-gold transition-colors tracking-[0.1em] md:tracking-[0.3em]"
              >
                {t('nav.changeRole')}
              </Link>
            )}

            <button 
              onClick={handleLogout}
              className="bg-kalian-gold/10 hover:bg-red-500/20 text-kalian-gold hover:text-red-400 text-[10px] font-black uppercase px-4 py-2 rounded-full border border-kalian-gold/20 transition-all"
            >
              {t('nav.logout')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link to="/galeria" className="text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.1em] md:tracking-[0.3em]">{t('nav.gallery')}</Link>
            <Link to="/login" className="text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.1em] md:tracking-[0.3em]">{t('nav.login')}</Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
