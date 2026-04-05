import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { KalianLogo } from './KalianLogo';

const Navbar = () => {
  const { socioData, logoutSocio } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logoutSocio().then(() => {
      navigate('/');
    });
  };

  return (
    <nav className="flex justify-between items-center p-6 bg-kalian-dark text-kalian-cream border-b border-kalian-gold/10 shadow-2xl sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-3 group">
          <KalianLogo size="sm" showText={true} />
        </Link>
      </div>
      
      <div className="flex items-center gap-4">
        {socioData ? (
          <div className="flex items-center gap-8">
            <Link to="/home" className="text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.3em]">Catálogo</Link>
            <Link to="/perfil" className="text-[10px] font-black uppercase hover:text-kalian-gold transition-colors tracking-[0.3em]">Mi Perfil</Link>
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
