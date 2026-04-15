import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Link } from 'react-router-dom';
import { Database, Download, ShieldCheck } from 'lucide-react';

const AdminConfig = () => {
  const [config, setConfig] = useState({
    siteName: 'KALIAN HKG',
    slogan: 'KALIAN HIRI KULTUR GUNEA',
    logoUrl: '',
    heroImageUrl: '',
    galleryImageUrl: '',
    hubImageUrl: '',
    titleColor: '#c5a059',
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

  const exportCollection = async (collName: string) => {
    setSaving(true);
    try {
      const snap = await getDocs(collection(db, collName));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_${collName}_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      setMsg(`✅ Backup de ${collName} completado`);
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert(`Error al exportar ${collName}`);
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
            <div className="space-y-4">
              <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Color de Títulos</p>
              <div className="flex items-center gap-4">
                <input 
                  type="color" 
                  className="w-12 h-12 bg-transparent border-none cursor-pointer"
                  value={config.titleColor || '#c5a059'}
                  onChange={e => setConfig({...config, titleColor: e.target.value})}
                />
                <input 
                  type="text" 
                  className="flex-1 p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold font-mono text-xs"
                  value={config.titleColor || '#c5a059'}
                  onChange={e => setConfig({...config, titleColor: e.target.value})}
                />
              </div>
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

        {/* SECCIÓN DE BACKUPS Y SEGURIDAD */}
        <div className="mt-12 bg-black/40 p-10 rounded-[3rem] border border-red-500/20 space-y-8">
          <div className="flex items-center gap-4 mb-4">
            <ShieldCheck className="text-red-500" size={32} />
            <h2 className="text-3xl kalian-poster-text text-red-500 italic uppercase">Seguridad y Backups</h2>
          </div>

          <p className="text-xs font-bold text-kalian-cream/60 leading-relaxed italic">
            "Realiza copias de seguridad periódicas de los datos críticos de la asociación. Los archivos se descargarán en formato JSON para su posterior recuperación si fuera necesario."
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { id: 'socios', label: 'Soci@s', icon: <Database size={16} /> },
              { id: 'finanzas', label: 'Finanzas', icon: <Database size={16} /> },
              { id: 'cursos', label: 'Cursos', icon: <Database size={16} /> }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => exportCollection(item.id)}
                disabled={saving}
                className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl hover:border-kalian-gold/40 transition-all group"
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                </div>
                <Download size={16} className="text-kalian-gold group-hover:scale-125 transition-transform" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminConfig;
