import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import ControlAcceso from './ControlAcceso';
import { ShieldCheck, Lock } from 'lucide-react';

const PuertaAccess = () => {
  const [password, setPassword] = useState('');
  const [isValidated, setIsValidated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = sessionStorage.getItem('kalian_puerta_token');
    if (token === 'true') {
      setIsValidated(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const configRef = doc(db, "configuracion", "seguridad");
      const configSnap = await getDoc(configRef);

      if (configSnap.exists()) {
        const { clave_puerta } = configSnap.data();
        if (password === clave_puerta) {
          sessionStorage.setItem('kalian_puerta_token', 'true');
          setIsValidated(true);
        } else {
          setError('Contraseña incorrecta');
        }
      } else {
        // Si no existe el documento, por seguridad no dejamos pasar
        // pero avisamos que falta configuración
        setError('Error de configuración: Clave no establecida en el sistema');
      }
    } catch (err) {
      console.error(err);
      setError('Error al conectar con el servidor');
    }
    setLoading(false);
  };

  if (isValidated) {
    return <ControlAcceso isPuertaMode={true} />;
  }

  return (
    <div className="min-h-screen bg-kalian-dark flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-black/40 border border-kalian-gold/20 rounded-[3rem] p-10 shadow-2xl text-center">
        <div className="w-20 h-20 bg-kalian-gold/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-kalian-gold/20">
          <Lock className="text-kalian-gold" size={32} />
        </div>
        
        <h1 className="text-4xl kalian-poster-text text-kalian-gold mb-2">ACCESO <span className="text-kalian-cream">PUERTA</span></h1>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-kalian-gold/40 mb-10">Control de Entradas Simplificado</p>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2 text-left">
            <p className="text-[9px] font-black text-kalian-gold/60 uppercase tracking-[0.3em] ml-4">Contraseña de Acceso</p>
            <input 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-5 bg-white/5 rounded-2xl border border-white/10 text-kalian-cream text-center text-2xl tracking-[0.5em] focus:border-kalian-gold outline-none transition-all"
              required
            />
          </div>

          {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest animate-pulse">{error}</p>}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/10"
          >
            {loading ? 'VERIFICANDO...' : 'ENTRAR AL CONTROL'}
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-white/5">
          <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest leading-relaxed">
            Esta página es para uso exclusivo del personal de puerta.<br/>
            Si no tienes la clave, contacta con administración.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PuertaAccess;
