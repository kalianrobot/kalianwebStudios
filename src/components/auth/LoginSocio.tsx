import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';

const LoginSocio = () => {
  const [esRegistro, setEsRegistro] = useState(false);
  const [form, setForm] = useState({ nombre: '', email: '', password: '', dni: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate('/home');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo('');
    setCargando(true);

    try {
      await signInWithEmailAndPassword(auth, form.email, form.password);

      const destino = sessionStorage.getItem('url_retorno');
      if (destino) {
        sessionStorage.removeItem('url_retorno');
        navigate(destino);
      } else {
        navigate('/home');
      }
    } catch (err: any) { 
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("❌ Credenciales incorrectas. Revisa tu email y contraseña.");
      } else if (err.code === 'auth/invalid-email') {
        setError("❌ El formato del email no es válido.");
      } else {
        setError("❌ Error en el acceso: " + err.message);
      }
    }
    setCargando(false);
  };

  const resetPassword = async () => {
    if (!form.email) {
      setError("⚠️ Introduce tu email para enviarte el enlace de recuperación.");
      return;
    }
    setError(''); setInfo('');
    setCargando(true);
    try {
      await sendPasswordResetEmail(auth, form.email);
      setInfo("✅ Se ha enviado un email para restablecer tu contraseña. Revisa tu bandeja de entrada.");
    } catch (err: any) {
      console.error(err);
      setError("❌ Error al enviar el email: " + err.message);
    }
    setCargando(false);
  };

  return (
    <div className="min-h-screen bg-kalian-dark flex items-center justify-center p-6 font-sans relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-kalian-gold)_0%,_transparent_70%)]"></div>
      </div>

      <div className="bg-black border border-kalian-gold/20 p-12 rounded-[3.5rem] w-full max-w-md shadow-2xl text-kalian-cream relative z-10">
        <Link to="/" className="text-kalian-gold/70 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">← Volver al Inicio</Link>
        <h2 className="text-6xl kalian-poster-text text-kalian-gold mt-6 mb-10 leading-none whitespace-pre-line tracking-tight">
          {"ÁREA\nSOCI@S"}
        </h2>

        {auth.currentUser && (
          <div className="mb-10 p-8 bg-kalian-gold/5 border border-kalian-gold/20 rounded-3xl text-center">
            <p className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.4em] mb-6">Ya has iniciado sesión</p>
            <button 
              onClick={() => navigate('/home')}
              className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest shadow-2xl shadow-kalian-gold/20 hover:bg-white transition-all"
            >
              IR AL CATÁLOGO →
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 text-red-500 p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest mb-8 border border-red-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
            {error}
          </div>
        )}
        
        {info && (
          <div className="bg-kalian-gold/10 text-kalian-gold p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest mb-8 border border-kalian-gold/20 animate-in fade-in slide-in-from-top-2 duration-300">
            {info}
          </div>
        )}

        <form onSubmit={manejarSubmit} className="space-y-6">
          <div className="space-y-2">
            <p className="text-[9px] font-black text-kalian-gold/70 uppercase tracking-[0.4em] ml-4">Email</p>
            <input 
              type="email" 
              placeholder="tu@email.com" 
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold focus:bg-kalian-gold/10 text-kalian-gold transition-all placeholder:text-kalian-gold/20 font-bold" 
              value={form.email} 
              onChange={e => setForm({...form, email: e.target.value})} 
              required 
            />
          </div>

          <div className="space-y-2">
            <p className="text-[9px] font-black text-kalian-gold/70 uppercase tracking-[0.4em] ml-4">Contraseña</p>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold focus:bg-kalian-gold/10 text-kalian-gold transition-all placeholder:text-kalian-gold/20 font-bold" 
              value={form.password} 
              onChange={e => setForm({...form, password: e.target.value})} 
              required 
            />
          </div>
          
          <button 
            disabled={cargando} 
            className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest shadow-2xl shadow-kalian-gold/20 hover:bg-white transition-all disabled:opacity-50 mt-4"
          >
            {cargando ? 'PROCESANDO...' : 'ENTRAR'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button 
            onClick={resetPassword}
            disabled={cargando}
            className="text-kalian-gold/70 font-black text-[9px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors border-b border-transparent hover:border-kalian-gold/40 pb-1"
          >
            ¿Has olvidado tu contraseña?
          </button>
        </div>

        <p className="mt-12 text-kalian-gold/60 font-black text-[9px] uppercase tracking-[0.3em] text-center leading-relaxed max-w-[280px] mx-auto">
          El alta de soci@s se realiza automáticamente al inscribirse en un curso o local.
        </p>
      </div>
    </div>
  );
};

export default LoginSocio;
