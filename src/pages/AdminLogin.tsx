import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginAdmin, role, user } = useAuth();
  const navigate = useNavigate();

  // Email de administrador por defecto (se puede usar si se desea, o cualquier otro con permisos)
  const SUGGESTED_EMAIL = "kalianrobot@gmail.com";

  useEffect(() => {
    const isMaster = user?.email?.toLowerCase() === SUGGESTED_EMAIL;
    const hasAdminAccess = role === 'admin' || isMaster;

    console.log("AdminLogin: Access check:", { role, user: user?.email, isMaster, hasAdminAccess });
    
    if (hasAdminAccess) {
      console.log("AdminLogin: Navegando a /staff");
      navigate('/staff');
    } else if (role === 'portero') {
      console.log("AdminLogin: Navegando a /control-acceso");
      navigate('/control-acceso');
    } else if (user && !hasAdminAccess && role !== 'portero') {
      setError('⚠️ No tienes permisos de Staff.');
    }
  }, [role, navigate, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      console.log("AdminLogin: Iniciando sesión...");
      await loginAdmin(email, pass);
      console.log("AdminLogin: loginAdmin finalizado exitosamente");
      // No navegamos manualmente, dejamos que el useEffect de role lo haga
    } catch (err: any) {
      console.error("Error de login admin:", err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Email o clave incorrecta');
      } else if (err.code === 'auth/user-not-found') {
        setError('El usuario no existe en el sistema');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos fallidos. Inténtalo más tarde.');
      } else {
        setError('Error de conexión: ' + (err.message || 'Desconocido'));
      }
      setPass('');
    } finally {
      setLoading(false);
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
            <p className="text-[9px] font-black text-kalian-gold/70 uppercase tracking-[0.4em] ml-4">Email de Staff</p>
            <input
              type="email"
              placeholder={SUGGESTED_EMAIL}
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl text-center text-xl font-bold border border-kalian-gold/10 focus:border-kalian-gold focus:bg-kalian-gold/10 outline-none text-kalian-gold transition-all"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-[9px] font-black text-kalian-gold/70 uppercase tracking-[0.4em] ml-4">Contraseña</p>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl text-center text-2xl kalian-poster-text border border-kalian-gold/10 focus:border-kalian-gold focus:bg-kalian-gold/10 outline-none text-kalian-gold transition-all"
              required
              value={pass}
              onChange={e => setPass(e.target.value)}
            />
          </div>
          
          <button 
            disabled={loading}
            className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20 disabled:opacity-50"
          >
            {loading ? 'VERIFICANDO...' : 'ENTRAR AL PANEL'}
          </button>
        </form>

        <button 
          onClick={() => navigate('/')}
          className="w-full mt-10 text-[9px] font-black uppercase text-kalian-gold/60 hover:text-kalian-gold transition-all tracking-[0.3em]"
        >
          ← VOLVER A LA WEB
        </button>
      </div>
    </div>
  );
};

export default AdminLogin;
