import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const AdminLogin = () => {
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const { loginAdmin, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (role === 'admin') {
      navigate('/admin');
    }
  }, [role, navigate]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginAdmin(pass)) {
      navigate('/admin');
    } else {
      setError('Clave incorrecta');
      setPass('');
    }
  };

  return (
    <div className="fixed inset-0 bg-kalian-dark flex flex-col items-center justify-center p-6 z-[999] relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-kalian-gold)_0%,_transparent_70%)]"></div>
      </div>

      <div className="w-full max-w-md bg-black border border-kalian-gold/20 p-12 rounded-[3rem] shadow-2xl relative z-10">
        <div className="flex justify-center mb-10">
          <div className="w-20 h-20 bg-kalian-gold/10 border border-kalian-gold/20 rounded-3xl flex items-center justify-center text-4xl">
            🔒
          </div>
        </div>
        
        <h2 className="text-4xl kalian-poster-text mb-10 text-center text-kalian-gold tracking-tight">ACCESO <span className="text-kalian-cream">STAFF</span></h2>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
            <p className="text-red-500 text-center font-black uppercase text-[10px] tracking-widest">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.4em] ml-4">Contraseña de Acceso</p>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full p-6 bg-kalian-gold/5 rounded-2xl text-center text-2xl kalian-poster-text border border-kalian-gold/10 focus:border-kalian-gold focus:bg-kalian-gold/10 outline-none text-kalian-gold transition-all placeholder:text-kalian-gold/20"
              autoFocus
              value={pass}
              onChange={e => setPass(e.target.value)}
            />
          </div>
          
          <button className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20">
            ENTRAR AL PANEL
          </button>
        </form>

        <button 
          onClick={() => navigate('/')}
          className="w-full mt-10 text-[9px] font-black uppercase text-kalian-gold/30 hover:text-kalian-gold transition-all tracking-[0.3em]"
        >
          ← VOLVER A LA WEB
        </button>
      </div>
    </div>
  );
};

export default AdminLogin;
