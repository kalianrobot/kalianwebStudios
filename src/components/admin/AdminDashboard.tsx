import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

const AdminDashboard = () => {
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    const fetchPendientes = async () => {
      const q = query(collection(db, "solicitudes_cursos"), where("estado", "==", "pendiente"));
      const snap = await getDocs(q);
      setPendientes(snap.size);
    };
    fetchPendientes();
  }, []);

  const menus = [
    { t: 'Check-In', icon: '⚡', color: 'border-indigo-600', path: '/staff/checkin' },
    { t: 'Eventos', icon: '🎸', color: 'border-slate-600', path: '/staff/eventos' },
    { t: 'Cursos', icon: '💃', color: 'border-emerald-500', path: '/staff/cursos' },
    { t: 'Soci@s', icon: '👥', color: 'border-blue-500', path: '/staff/socios' },
    { t: 'Profesores', icon: '👨‍🏫', color: 'border-indigo-500', path: '/staff/profesores' },
    { t: 'Locales', icon: '🏠', color: 'border-amber-500', path: '/staff/locales' },
    { t: 'Solicitudes', icon: '📩', color: 'border-emerald-500', path: '/staff/solicitudes', badge: pendientes }
  ];

  return (
    <div className="min-h-screen bg-kalian-dark flex flex-col items-center justify-center p-6 text-kalian-cream font-sans relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-kalian-gold)_0%,_transparent_70%)]"></div>
      </div>

      <h1 className="text-6xl md:text-8xl kalian-poster-text text-kalian-gold tracking-[-0.05em] mb-20 text-center leading-none relative z-10">
        KALIAN <span className="text-kalian-cream">STAFF</span><br/>
        <span className="text-[10px] font-black tracking-[0.8em] text-kalian-gold/30 uppercase italic block mt-4">Módulo de Control v3.0</span>
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6 w-full max-w-7xl relative z-10">
        {menus.map(m => (
          <Link 
            key={m.path} 
            to={m.path} 
            className="bg-black/40 p-8 rounded-[2.5rem] border border-kalian-gold/10 flex flex-col items-center hover:border-kalian-gold/40 hover:-translate-y-3 transition-all duration-500 group shadow-2xl relative"
          >
            {m.badge > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs font-black animate-pulse shadow-lg shadow-red-500/20 z-20">
                {m.badge}
              </span>
            )}
            <span className="text-5xl mb-6 group-hover:scale-125 transition-transform duration-500 drop-shadow-2xl">{m.icon}</span>
            <h2 className="text-sm kalian-poster-text text-kalian-gold group-hover:text-kalian-cream transition-colors text-center">{m.t}</h2>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
