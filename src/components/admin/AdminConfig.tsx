import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Link } from 'react-router-dom';

const AdminConfig = () => {
  const [config, setConfig] = useState({
    siteName: 'KALIAN HKG',
    slogan: 'KALIAN HIRI KULTUR GUNEA',
    logoUrl: '',
    heroImageUrl: '',
    galleryImageUrl: '',
    hubImageUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const fetchConfig = async () => {
      const docRef = doc(db, "config", "site");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setConfig(snap.data() as any);
      }
      setLoading(false);
    };
    fetchConfig();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: keyof typeof config) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSaving(true);
    try {
      const storageRef = ref(storage, `config/${String(field)}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setConfig(prev => ({ ...prev, [field]: url }));
      setMsg(`✅ Imagen cargada para ${String(field)}`);
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al subir imagen");
    }
    setSaving(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "config", "site"), config);
      setMsg("✅ Configuración guardada correctamente");
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al guardar");
    }
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen bg-kalian-dark flex items-center justify-center text-kalian-gold">Cargando...</div>;

  return (
    <div className="min-h-screen bg-kalian-dark text-kalian-cream p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-5xl kalian-poster-text text-kalian-gold italic uppercase tracking-tighter">Identidad Visual</h1>
          <Link to="/staff" className="text-xs font-black uppercase tracking-widest text-kalian-gold/40 hover:text-kalian-gold transition-colors">← Volver</Link>
        </div>

        {msg && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-4 rounded-xl mb-8 text-center font-black uppercase text-xs tracking-widest">{msg}</div>}

        <div className="bg-black/40 p-10 rounded-[3rem] border border-kalian-gold/10 space-y-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Nombre del Sitio</p>
              <input 
                type="text" 
                className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold"
                value={config.siteName}
                onChange={e => setConfig({...config, siteName: e.target.value})}
              />
            </div>
            <div className="space-y-4">
              <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Eslogan (Mayúsculas)</p>
              <input 
                type="text" 
                className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold"
                value={config.slogan}
                onChange={e => setConfig({...config, slogan: e.target.value.toUpperCase()})}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Logo Principal</p>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white/5 rounded-xl border border-kalian-gold/10 flex items-center justify-center overflow-hidden">
                  {config.logoUrl ? <img src={config.logoUrl} className="w-full h-full object-contain p-2" /> : 'NO LOGO'}
                </div>
                <input type="file" onChange={e => handleUpload(e, 'logoUrl')} className="text-xs text-kalian-gold/40" />
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Imagen Portada (Hero)</p>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white/5 rounded-xl border border-kalian-gold/10 flex items-center justify-center overflow-hidden">
                  {config.heroImageUrl ? <img src={config.heroImageUrl} className="w-full h-full object-cover" /> : 'NO IMAGE'}
                </div>
                <input type="file" onChange={e => handleUpload(e, 'heroImageUrl')} className="text-xs text-kalian-gold/40" />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Imagen Sección Galería</p>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white/5 rounded-xl border border-kalian-gold/10 flex items-center justify-center overflow-hidden">
                  {config.galleryImageUrl ? <img src={config.galleryImageUrl} className="w-full h-full object-cover" /> : '🖼️'}
                </div>
                <input type="file" onChange={e => handleUpload(e, 'galleryImageUrl')} className="text-xs text-kalian-gold/40" />
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Imagen Sección Hub</p>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white/5 rounded-xl border border-kalian-gold/10 flex items-center justify-center overflow-hidden">
                  {config.hubImageUrl ? <img src={config.hubImageUrl} className="w-full h-full object-cover" /> : '🏢'}
                </div>
                <input type="file" onChange={e => handleUpload(e, 'hubImageUrl')} className="text-xs text-kalian-gold/40" />
              </div>
            </div>
          </div>

          <button 
            onClick={saveConfig}
            disabled={saving}
            className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20 disabled:opacity-50"
          >
            {saving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminConfig;
