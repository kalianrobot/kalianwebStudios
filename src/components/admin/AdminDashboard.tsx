import { Link, useNavigate } from 'react-router-dom';

interface AdminDashboardProps {
  logout: () => void;
}

const AdminDashboard = ({ logout }: AdminDashboardProps) => {
  const navigate = useNavigate();
  const menus = [
    { t: 'Check-In', icon: '⚡', color: 'border-indigo-600', path: '/admin/checkin' },
    { t: 'Eventos', icon: '🎸', color: 'border-slate-600', path: '/admin/eventos' },
    { t: 'Cursos', icon: '💃', color: 'border-emerald-500', path: '/admin/cursos' },
    { t: 'Socios', icon: '👥', color: 'border-blue-500', path: '/admin/socios' },
    { t: 'Locales', icon: '🏠', color: 'border-amber-500', path: '/admin/locales' }
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-kalian-dark flex flex-col items-center justify-center p-6 text-kalian-cream font-sans relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-kalian-gold)_0%,_transparent_70%)]"></div>
      </div>

      <h1 className="text-6xl md:text-8xl kalian-poster-text text-kalian-gold tracking-[-0.05em] mb-20 text-center leading-none relative z-10">
        KALIAN <span className="text-kalian-cream">STAFF</span><br/>
        <span className="text-[10px] font-black tracking-[0.8em] text-kalian-gold/30 uppercase italic block mt-4">Módulo de Control v3.0</span>
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-8 w-full max-w-7xl relative z-10">
        {menus.map(m => (
          <Link 
            key={m.path} 
            to={m.path} 
            className="bg-black/40 p-10 rounded-[3rem] border border-kalian-gold/10 flex flex-col items-center hover:border-kalian-gold/40 hover:-translate-y-3 transition-all duration-500 group shadow-2xl"
          >
            <span className="text-6xl mb-6 group-hover:scale-125 transition-transform duration-500 drop-shadow-2xl">{m.icon}</span>
            <h2 className="text-xl kalian-poster-text text-kalian-gold group-hover:text-kalian-cream transition-colors">{m.t}</h2>
          </Link>
        ))}
      </div>

      <button 
        onClick={handleLogout} 
        className="mt-24 text-kalian-gold/30 font-black uppercase text-[10px] tracking-[0.5em] hover:text-kalian-gold transition-all border-b border-transparent hover:border-kalian-gold/30 pb-1 relative z-10"
      >
        Finalizar Sesión Admin
      </button>
    </div>
  );
};

export default AdminDashboard;
