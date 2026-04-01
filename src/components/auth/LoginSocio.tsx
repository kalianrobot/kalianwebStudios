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
        navigate('/perfil');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setInfo('');
    setCargando(true);

    try {
      const u = await signInWithEmailAndPassword(auth, form.email, form.password);

      if (u.user.emailVerified) {
        const destino = sessionStorage.getItem('url_retorno');
        if (destino) {
          sessionStorage.removeItem('url_retorno');
          navigate(destino);
        } else {
          navigate('/perfil');
        }
      } else {
        setError("⚠️ Por favor, verifica tu email antes de entrar. Revisa tu bandeja de entrada.");
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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
      <div className="bg-white p-12 rounded-[3.5rem] w-full max-w-md shadow-2xl text-slate-900">
        <Link to="/" className="text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-indigo-600">← Volver al Inicio</Link>
        <h2 className="text-4xl font-black italic uppercase tracking-tighter mt-4 mb-8 leading-none whitespace-pre-line">
          {"Área\nSocios"}
        </h2>

        {auth.currentUser && (
          <div className="mb-8 p-6 bg-indigo-50 border border-indigo-100 rounded-3xl text-center">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-4">Ya has iniciado sesión</p>
            <button 
              onClick={() => navigate('/perfil')}
              className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-indigo-700 transition-all"
            >
              Ir a mi Panel →
            </button>
          </div>
        )}

        {error && <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold mb-6 border border-red-100">{error}</div>}
        {info && <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-xs font-bold mb-6 border border-emerald-100">{info}</div>}

        <form onSubmit={manejarSubmit} className="space-y-4">
          <input type="email" placeholder="Email" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-200 focus:ring-2 ring-indigo-500" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
          <input type="password" placeholder="Contraseña" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-200 focus:ring-2 ring-indigo-500" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          
          <button disabled={cargando} className="w-full bg-slate-900 text-white p-5 rounded-[2rem] font-black uppercase tracking-widest shadow-xl hover:bg-indigo-600 transition-all disabled:opacity-50">
            {cargando ? 'Procesando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={resetPassword}
            disabled={cargando}
            className="text-indigo-600 font-bold text-[10px] uppercase tracking-widest hover:underline"
          >
            ¿Has olvidado tu contraseña?
          </button>
        </div>

        <p className="mt-10 text-slate-400 font-bold text-[10px] uppercase tracking-widest text-center leading-relaxed">
          El alta de socio se realiza automáticamente al inscribirse en un curso o local.
        </p>
      </div>
    </div>
  );
};

export default LoginSocio;
