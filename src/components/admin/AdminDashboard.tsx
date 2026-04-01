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
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans">
      <h1 className="text-5xl font-black italic uppercase tracking-tighter mb-16 text-center leading-none">
        Kalian Staff<br/><span className="text-xs font-normal tracking-[0.5em] opacity-40 italic">Módulo de Control v3.0</span>
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-7xl">
        {menus.map(m => (
          <Link key={m.path} to={m.path} className={`bg-white p-10 rounded-[3rem] shadow-2xl border-b-[12px] ${m.color} flex flex-col items-center hover:-translate-y-3 transition-all duration-300 group`}>
            <span className="text-6xl mb-4 group-hover:scale-125 transition-transform">{m.icon}</span>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter italic">{m.t}</h2>
          </Link>
        ))}
      </div>

      <button onClick={handleLogout} className="mt-20 text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em] hover:text-red-500 transition-colors">Finalizar Sesión Admin</button>
    </div>
  );
};

export default AdminDashboard;
