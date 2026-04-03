import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const TeacherLogin = () => {
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const { loginTeacher } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginTeacher(pass)) {
      navigate('/teacher');
    } else {
      setError('Contraseña incorrecta');
    }
  };

  return (
    <div className="min-h-screen bg-kalian-dark flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-black/40 p-12 rounded-[3rem] border border-kalian-gold/20 shadow-2xl">
        <h1 className="text-5xl kalian-poster-text text-kalian-gold text-center mb-8 uppercase italic leading-none">ACCESO <span className="text-kalian-cream">PROFESORES</span></h1>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-kalian-gold/40 ml-4 tracking-widest">Contraseña de Acceso</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-gold text-center text-2xl"
              value={pass}
              onChange={e => setPass(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-red-500 text-center font-bold text-xs uppercase tracking-widest animate-pulse">{error}</p>}

          <button className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20 active:scale-95 uppercase">Entrar al Panel</button>
        </form>
      </div>
    </div>
  );
};

export default TeacherLogin;
