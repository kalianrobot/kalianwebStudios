import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Link } from 'react-router-dom';
import { Database, Download, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const AdminConfig = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState({
    siteName: 'KALIAN HKG',
    slogan: 'KALIAN HIRI KULTUR GUNEA',
    logoUrl: '',
    heroImageUrl: '',
    galleryImageUrl: '',
    hubImageUrl: '',
    titleColor: '#c5a059',
    donacionesActivo: false,
    donacionesIban: '',
    donacionesBeneficiario: '',
    donacionesBic: '',
    donacionesConcepto: 'Donación Kalian',
    donacionesBtcActivo: false,
    donacionesBtcAddress: '',
    donacionesLnActivo: false,
    donacionesLnAddress: '',
    donacionesUsdcActivo: false,
    donacionesUsdcAddress: '',
    donacionesUsdcRed: 'Polygon',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!user) return;
    const fetchConfigData = async () => {
      try {
        const docRef = doc(db, "config", "site");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setConfig(snap.data() as any);
        }
      } catch (err) {
        console.error("AdminConfig: Error fetching config:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfigData();
  }, [user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: keyof typeof config) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check for storage initialization
    if (!storage || !(storage as any).app?.options?.storageBucket) {
      console.error("Firebase Storage check failed: No storageBucket in config.");
      alert("⚠️ Error de Configuración: No se ha detectado el bucket de almacenamiento. Por favor, reporta este error.");
      return;
    }

    setSaving(true);
    try {
      const storageRef = ref(storage, `config/${String(field)}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setConfig(prev => ({ ...prev, [field]: url }));
      setMsg(`✅ Imagen cargada para ${String(field)}`);
      setTimeout(() => setMsg(''), 3000);
    } catch (err: any) {
      console.error("Storage Error:", err);
      if (err.message?.includes('insufficient permissions')) {
        alert("❌ Error de Permisos: No tienes autorización para subir archivos a esta carpeta.");
      } else {
        alert("Error al subir imagen: " + (err.message || "Error desconocido"));
      }
    }
    setSaving(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "config", "site"), config);
      setMsg("✅ Configuración guardada correctamente");
      setTimeout(() => setMsg(''), 3000);
    } catch (err: any) {
      console.error("Save Config Error:", err);
      if (err.message?.includes('insufficient permissions')) {
        alert("❌ Error de Permisos: No tienes autorización para guardar la configuración (Base de Datos).");
      } else if (err.code === 'failed-precondition' || err.message?.includes('blocked')) {
        alert("⚠️ Error: La petición parece estar bloqueada por el navegador (ej: AdBlocker). Prueba a desactivarlo.");
      } else {
        alert("Error al guardar: " + (err.message || "Error desconocido"));
      }
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
                  {config.hubImageUrl ? <img src={config.hubImageUrl} className="w-full h-full object-contain" /> : '🏢'}
                </div>
                <input type="file" onChange={e => handleUpload(e, 'hubImageUrl')} className="text-xs text-kalian-gold/40" />
              </div>
            </div>
          </div>

          {/* DONACIONES */}
          <div className="pt-8 border-t border-kalian-gold/10 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl kalian-poster-text text-kalian-gold italic uppercase">Donaciones (IBAN)</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.2em]">Mostrar en la web</span>
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-kalian-gold cursor-pointer"
                  checked={!!config.donacionesActivo}
                  onChange={e => setConfig({ ...config, donacionesActivo: e.target.checked })}
                />
              </label>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4 md:col-span-2">
                <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">IBAN</p>
                <input
                  type="text"
                  placeholder="ES00 0000 0000 0000 0000 0000"
                  className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold font-mono"
                  value={config.donacionesIban || ''}
                  onChange={e => setConfig({ ...config, donacionesIban: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-4">
                <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Beneficiario</p>
                <input
                  type="text"
                  placeholder="Asociación Kalian"
                  className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold"
                  value={config.donacionesBeneficiario || ''}
                  onChange={e => setConfig({ ...config, donacionesBeneficiario: e.target.value })}
                />
              </div>
              <div className="space-y-4">
                <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">BIC / SWIFT (opcional)</p>
                <input
                  type="text"
                  className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold font-mono"
                  value={config.donacionesBic || ''}
                  onChange={e => setConfig({ ...config, donacionesBic: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-4 md:col-span-2">
                <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Concepto de la transferencia</p>
                <input
                  type="text"
                  className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 outline-none focus:border-kalian-gold"
                  value={config.donacionesConcepto || ''}
                  onChange={e => setConfig({ ...config, donacionesConcepto: e.target.value })}
                />
              </div>
            </div>

            {/* BITCOIN */}
            <div className="p-6 bg-orange-500/10 border border-orange-500/20 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg kalian-poster-text text-orange-400 italic uppercase">Bitcoin (BTC)</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="text-[10px] font-black text-orange-400/60 uppercase tracking-[0.2em]">Mostrar</span>
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-orange-500 cursor-pointer"
                    checked={!!config.donacionesBtcActivo}
                    onChange={e => setConfig({ ...config, donacionesBtcActivo: e.target.checked })}
                  />
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-orange-400/60 uppercase tracking-[0.3em] ml-1">Dirección BTC</p>
                <input
                  type="text"
                  placeholder="bc1q..."
                  className="w-full p-4 bg-black/30 rounded-xl border border-orange-500/20 outline-none focus:border-orange-400 font-mono text-sm"
                  value={config.donacionesBtcAddress || ''}
                  onChange={e => setConfig({ ...config, donacionesBtcAddress: e.target.value.trim() })}
                />
              </div>
            </div>

            {/* LIGHTNING NETWORK */}
            <div className="p-6 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg kalian-poster-text text-yellow-400 italic uppercase">Lightning Network</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="text-[10px] font-black text-yellow-400/60 uppercase tracking-[0.2em]">Mostrar</span>
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-yellow-500 cursor-pointer"
                    checked={!!config.donacionesLnActivo}
                    onChange={e => setConfig({ ...config, donacionesLnActivo: e.target.checked })}
                  />
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-yellow-400/60 uppercase tracking-[0.3em] ml-1">Lightning Address</p>
                <input
                  type="text"
                  placeholder="usuario@getalby.com"
                  className="w-full p-4 bg-black/30 rounded-xl border border-yellow-500/20 outline-none focus:border-yellow-400 font-mono text-sm"
                  value={config.donacionesLnAddress || ''}
                  onChange={e => setConfig({ ...config, donacionesLnAddress: e.target.value.trim().toLowerCase() })}
                />
                <p className="text-[9px] text-yellow-400/40 ml-1 italic">Puedes usar cualquier Lightning Address (Alby, Phoenix, Strike, etc.)</p>
              </div>
            </div>

            {/* USDC */}
            <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg kalian-poster-text text-blue-400 italic uppercase">USDC</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <span className="text-[10px] font-black text-blue-400/60 uppercase tracking-[0.2em]">Mostrar</span>
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-blue-500 cursor-pointer"
                    checked={!!config.donacionesUsdcActivo}
                    onChange={e => setConfig({ ...config, donacionesUsdcActivo: e.target.checked })}
                  />
                </label>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <p className="text-[10px] font-black text-blue-400/60 uppercase tracking-[0.3em] ml-1">Dirección USDC</p>
                  <input
                    type="text"
                    placeholder="0x... o dirección Solana"
                    className="w-full p-4 bg-black/30 rounded-xl border border-blue-500/20 outline-none focus:border-blue-400 font-mono text-sm"
                    value={config.donacionesUsdcAddress || ''}
                    onChange={e => setConfig({ ...config, donacionesUsdcAddress: e.target.value.trim() })}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-blue-400/60 uppercase tracking-[0.3em] ml-1">Red</p>
                  <select
                    className="w-full p-4 bg-black/30 rounded-xl border border-blue-500/20 outline-none focus:border-blue-400 text-sm"
                    value={config.donacionesUsdcRed || 'Polygon'}
                    onChange={e => setConfig({ ...config, donacionesUsdcRed: e.target.value })}
                  >
                    <option value="Solana">Solana</option>
                    <option value="Polygon">Polygon</option>
                    <option value="BSC">BSC</option>
                  </select>
                </div>
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
