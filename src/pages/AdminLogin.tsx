import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const AdminLogin = () => {
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const { loginAdmin } = useAuth();
  const navigate = useNavigate();

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
    <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 z-[999]">
      <div className="w-full max-w-sm bg-white p-10 rounded-[3rem] shadow-2xl">
        <h2 className="text-2xl font-black mb-6 text-center text-slate-800 uppercase italic tracking-tighter">Acceso Staff</h2>
        {error && <p className="text-red-500 text-center mb-4 font-bold">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            placeholder="Contraseña"
            className="w-full p-5 bg-slate-100 rounded-2xl text-center text-xl font-bold border-2 border-slate-200 focus:border-indigo-500 outline-none text-slate-900"
            autoFocus
            value={pass}
            onChange={e => setPass(e.target.value)}
          />
          <button className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all">Entrar</button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
