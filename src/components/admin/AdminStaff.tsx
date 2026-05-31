import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

const AdminStaff = () => {
  const [msg, setMsg] = useState('');
  const [doorPass, setDoorPass] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const loadDoorPass = async () => {
    try {
      const configSnap = await getDoc(doc(db, "configuracion", "seguridad"));
      if (configSnap.exists()) {
        setDoorPass(configSnap.data().clave_puerta || '');
      }
    } catch (err: any) {
      console.error("AdminStaff: Error cargando clave de puerta:", err);
      setMsg("❌ Error de carga: " + (err.message || "Permiso denegado"));
    }
  };

  const handleSaveDoorPass = async () => {
    if (!doorPass) return;
    setSavingPass(true);
    try {
      await setDoc(doc(db, "configuracion", "seguridad"), {
        clave_puerta: doorPass
      }, { merge: true });
      setMsg("✅ Clave de puerta actualizada");
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al guardar la clave");
    }
    setSavingPass(false);
  };

  useEffect(() => {
    loadDoorPass();
  }, []);

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <Link to="/staff" className="text-kalian-gold/40 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">← Volver al Panel</Link>
          <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight">GESTIÓN <span className="text-kalian-cream">STAFF</span></h1>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-kalian-gold/40 mt-2">Acceso de Puerta</p>
        </header>

        {msg && <div className="bg-kalian-gold text-black p-5 rounded-3xl mb-12 kalian-poster-text text-xl text-center shadow-2xl animate-bounce">{msg}</div>}

        <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] overflow-hidden shadow-2xl mb-12">
          <div className="p-8 border-b border-kalian-gold/10 bg-black/20">
            <h2 className="text-2xl kalian-poster-text text-kalian-gold uppercase">Acceso Rápido Puerta (/puerta)</h2>
            <p className="text-[9px] font-bold text-kalian-cream/40 uppercase tracking-widest mt-1">Configura la clave compartida para el staff de puerta</p>
          </div>
          <div className="p-8 flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-1 space-y-2">
              <p className="text-[9px] font-black text-kalian-gold/60 uppercase tracking-[0.3em] ml-4">Clave Maestra de Puerta</p>
              <input
                type="text"
                value={doorPass}
                onChange={(e) => setDoorPass(e.target.value)}
                placeholder="Ej: KALIAN2024"
                className="w-full p-5 bg-white/5 rounded-2xl border border-white/10 text-kalian-gold font-black tracking-widest outline-none focus:border-kalian-gold transition-all"
              />
            </div>
            <button
              onClick={handleSaveDoorPass}
              disabled={savingPass}
              className="bg-kalian-gold text-black px-10 py-5 rounded-2xl kalian-poster-text text-xl hover:bg-white transition-all shadow-xl shadow-kalian-gold/20 disabled:opacity-50"
            >
              {savingPass ? 'GUARDANDO...' : 'GUARDAR CLAVE'}
            </button>
          </div>
        </div>

        <div className="bg-kalian-gold/5 border border-kalian-gold/10 p-8 rounded-[2.5rem]">
          <h3 className="text-xl kalian-poster-text text-kalian-gold mb-4 uppercase">¿Cómo funciona?</h3>
          <p className="text-sm text-kalian-cream/60 leading-relaxed">
            Los roles de staff (administradores y profesores) se gestionan desde el panel de <span className="text-kalian-gold">Profesores</span>.
            El acceso a la puerta (<span className="text-kalian-gold">/puerta</span>) se hace con la clave maestra configurada arriba — no es necesario dar de alta usuarios para esto.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminStaff;
