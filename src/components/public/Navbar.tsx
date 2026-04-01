import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const Navbar = () => {
  const { socioData, logoutSocio } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logoutSocio().then(() => {
      navigate('/');
    });
  };

  return (
    <nav className="flex justify-between items-center p-6 bg-slate-900 text-white shadow-2xl">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-2xl font-black italic tracking-tighter">KALIAN</Link>
        <Link to="/login-admin" className="text-[9px] font-bold uppercase text-slate-600 hover:text-indigo-400 transition-colors tracking-[0.3em]">Staff</Link>
      </div>
      
      <div className="flex items-center gap-4">
        {socioData ? (
          <div className="flex items-center gap-4">
            <Link to="/perfil" className="text-xs font-bold uppercase hover:text-indigo-400 transition-colors">
              👋 Hola, <span className="text-white">{socioData.nombre}</span>
            </Link>
            <button 
              onClick={handleLogout}
              className="bg-white/10 hover:bg-red-500/20 text-[10px] font-black uppercase px-3 py-2 rounded-lg transition-all"
            >
              Salir
            </button>
          </div>
        ) : (
          <Link to="/login" className="bg-indigo-600 px-6 py-2 rounded-xl text-[10px] font-black uppercase">
            Área Socios
          </Link>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
