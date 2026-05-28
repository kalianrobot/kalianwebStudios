import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { doc, getDoc, setDoc, getDocs, collection, writeBatch, query, where, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Link } from 'react-router-dom';
import { Database, Download, ShieldCheck, RefreshCw, Wand2 } from 'lucide-react';
import { fetchConfig, updateConfig, subscribeToConfig } from '../../lib/configService';
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
    donacionesUsdcActivo: false,
    donacionesUsdcAddress: '',
    donacionesUsdcRed: 'Polygon',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [mantenimientoLoading, setMantenimientoLoading] = useState(false);
  const [mantenimientoLog, setMantenimientoLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setMantenimientoLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20));
  };

  const testConexion = async () => {
    setMantenimientoLoading(true);
    setMantenimientoLog([]); // Limpiar al empezar
    addLog("Iniciando prueba de conexión...");
    try {
      const snap = await getDocs(query(collection(db, "socios"), where("email", "==", "test@test.com")));
      addLog("✅ Conexión establecida correctamente.");
      setMsg("✅ Conexión con base de datos OK");
    } catch (err) {
      console.error(err);
      addLog("❌ Error de conexión: " + (err instanceof Error ? err.message : "Desconocido"));
    }
    setMantenimientoLoading(false);
  };

  const normalizarSocios = async () => {
    if (!window.confirm("¿Deseas normalizar la colección de Soci@s?")) return;
    setMantenimientoLoading(true);
    addLog("--- INICIANDO NORMALIZACIÓN DE SOCIOS ---");
    
    try {
      addLog("Solicitando documentos a Firestore...");
      const snap = await getDocs(collection(db, "socios"));
      addLog(`Documentos recibidos: ${snap.size}`);
      
      if (snap.empty) {
        addLog("ℹ️ No hay socios en la colección.");
        setMantenimientoLoading(false);
        return;
      }

      let batch = writeBatch(db);
      let count = 0;
      let totalProcessed = 0;
      let batchCount = 0;

      for (const d of snap.docs) {
        const data = d.data();
        const updates: any = {};
        
        if (data.deletedAt === undefined) updates.deletedAt = null;
        if (!data.estado) updates.estado = 'activo';
        if (!data.status) updates.status = 'activo';
        if (data.email && data.email !== data.email.toLowerCase()) {
          updates.email = data.email.toLowerCase();
        }

        if (Object.keys(updates).length > 0) {
          batch.update(d.ref, { ...updates, updatedAt: serverTimestamp() });
          count++;
          batchCount++;
        }
        
        totalProcessed++;

        if (batchCount === 450) {
          addLog(`Guardando lote de 450 cambios... (${totalProcessed}/${snap.size})`);
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        addLog(`Guardando último lote de ${batchCount} cambios...`);
        await batch.commit();
      }

      addLog(`✅ PROCESO FINALIZADO.`);
      addLog(`Resumen: ${count} socios actualizados de ${snap.size} analizados.`);
      setMsg(`✅ Éxito: ${count} socios normalizados.`);
    } catch (err) {
      console.error("Error en normalizarSocios:", err);
      addLog("❌ ERROR CRÍTICO: " + (err instanceof Error ? err.message : "Error desconocido"));
    }
    setMantenimientoLoading(false);
  };

  // Nombres oficiales de academias para normalización
  const ACADEMIAS_OFICIALES: Record<string, string> = {
    'musica': 'Music is Cool',
    'baile': 'Club de Baile',
    'academia': 'Kalian Academy',
    'music': 'Music is Cool',
    'dance': 'Club de Baile'
  };

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

  const normalizarFinanzas = async () => {
    if (!window.confirm("¿Deseas normalizar la colección de Finanzas? Se corregirán nombres de categorías y se vincularán IDs de cursos migrados.")) return;
    setMantenimientoLoading(true);
    setMantenimientoLog([]);
    addLog("Iniciando normalización de Finanzas...");

    try {
      addLog("Obteniendo mapa de cursos migrados...");
      const cursosSnap = await getDocs(collection(db, "cursos"));
      const mapMigracion: Record<string, string> = {};
      cursosSnap.docs.forEach(d => {
        const c = d.data();
        if (c.migradoDesde) {
          mapMigracion[c.migradoDesde] = d.id;
        }
      });
      addLog(`Mapa de migración listo (${Object.keys(mapMigracion).length} cursos).`);

      const finanzasSnap = await getDocs(collection(db, "finanzas"));
      addLog(`Analizando ${finanzasSnap.size} transacciones...`);
      
      let batch = writeBatch(db);
      let count = 0;
      let totalProcessed = 0;
      let batchCount = 0;

      for (const d of finanzasSnap.docs) {
        const data = d.data();
        const updates: any = {};

        const catLower = (data.categoria || '').toLowerCase();
        if (ACADEMIAS_OFICIALES[catLower] && data.categoria !== ACADEMIAS_OFICIALES[catLower]) {
          updates.categoria = ACADEMIAS_OFICIALES[catLower];
        }

        if (data.cursoId && mapMigracion[data.cursoId]) {
          updates.cursoId = mapMigracion[data.cursoId];
        }

        if (Object.keys(updates).length > 0) {
          batch.update(d.ref, { ...updates, updatedAt: serverTimestamp() });
          count++;
          batchCount++;
        }

        totalProcessed++;

        if (batchCount === 450) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
          addLog(`Lote intermedio procesado... (${totalProcessed}/${finanzasSnap.size})`);
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      if (count > 0) {
        setMsg(`✅ Finanzas normalizadas: ${count} registros actualizados.`);
        addLog(`Éxito: ${count} transacciones corregidas de ${finanzasSnap.size} analizadas.`);
      } else {
        setMsg("ℹ️ No se requirieron cambios en finanzas.");
        addLog("Todas las transacciones ya estaban correctas.");
      }
    } catch (err) {
      console.error(err);
      addLog("❌ ERROR: " + (err instanceof Error ? err.message : "Error desconocido"));
      alert("Error al normalizar finanzas");
    }
    setMantenimientoLoading(false);
  };

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

          {/* Registro de Actividad siempre visible si hay logs */}
          {mantenimientoLog.length > 0 && (
            <div className="bg-black/60 rounded-2xl border border-kalian-gold/20 p-6 font-mono text-[10px] space-y-2 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <p className="text-kalian-gold uppercase tracking-widest flex items-center gap-2 font-black">
                  <RefreshCw size={10} className={mantenimientoLoading ? 'animate-spin' : ''} />
                  Consola de Mantenimiento
                </p>
                <button 
                  onClick={() => setMantenimientoLog([])}
                  className="text-[8px] text-kalian-gold/40 hover:text-kalian-gold uppercase tracking-widest transition-colors"
                >
                  Cerrar Consola
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                {mantenimientoLog.map((log, i) => (
                  <div key={i} className={log.includes('❌') ? 'text-red-400' : log.includes('✅') || log.includes('Éxito') ? 'text-emerald-400' : 'text-kalian-cream/80'}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

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

          <div className="pt-8 border-t border-white/10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-kalian-gold">Herramientas de Normalización</h3>
              <button 
                onClick={testConexion}
                disabled={mantenimientoLoading}
                className="text-[8px] font-black uppercase tracking-widest text-kalian-gold/40 hover:text-kalian-gold transition-colors flex items-center gap-2"
              >
                <ShieldCheck size={10} />
                Verificar Conexión
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={normalizarSocios}
                disabled={mantenimientoLoading}
                className="flex items-center gap-4 p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl hover:bg-indigo-500/20 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                  <RefreshCw size={24} className={mantenimientoLoading ? 'animate-spin' : ''} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Normalizar Soci@s</p>
                  <p className="text-[9px] text-indigo-300/60 mt-1">Limpia emails y rellena campos faltantes.</p>
                </div>
              </button>

              <button
                onClick={normalizarFinanzas}
                disabled={mantenimientoLoading}
                className="flex items-center gap-4 p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl hover:bg-amber-500/20 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  <Wand2 size={24} className={mantenimientoLoading ? 'animate-spin' : ''} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Normalizar Finanzas</p>
                  <p className="text-[9px] text-amber-300/60 mt-1">Corrige categorías y vincula cursos migrados.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminConfig;
