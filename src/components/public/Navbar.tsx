import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { KalianLogo } from './KalianLogo';

const Navbar = () => {
  const { user, isAdmin, isTeacher, socioData, logoutSocio } = useAuth();
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
    <nav className="flex justify-between items-center p-6 bg-kalian-dark text-kalian-cream border-b border-kalian-gold/10 shadow-2xl sticky top-0 z-50">
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
      
      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-8">
            {/* Links contextuales según el área actual */}
            {isSocioArea && (
              <>
                <Link to="/home" className={`text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.3em] ${location.pathname === '/home' ? 'text-kalian-gold' : ''}`}>Catálogo</Link>
                <Link to="/perfil" className={`text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.3em] ${location.pathname === '/perfil' ? 'text-kalian-gold' : ''}`}>Mi Panel</Link>
              </>
            )}
            
            {isAdminArea && (
              <Link to="/staff" className={`text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.3em] ${location.pathname === '/staff' ? 'text-kalian-gold' : ''}`}>Panel Admin</Link>
            )}

            {isTeacherArea && (
              <Link to="/profesor" className={`text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.3em] ${location.pathname === '/profesor' ? 'text-kalian-gold' : ''}`}>Panel Profesor</Link>
            )}

            <div className="h-4 w-[1px] bg-kalian-gold/20"></div>

            {hasMultipleRoles && (
              <Link 
                to="/" 
                className="text-[10px] font-black uppercase text-kalian-gold/40 hover:text-kalian-gold transition-colors tracking-[0.3em]"
              >
                Cambiar Rol
              </Link>
            )}

            <button 
              onClick={handleLogout}
              className="bg-kalian-gold/10 hover:bg-red-500/20 text-kalian-gold hover:text-red-400 text-[10px] font-black uppercase px-4 py-2 rounded-full border border-kalian-gold/20 transition-all"
            >
              Salir
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.3em]">Acceso Socios</Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
