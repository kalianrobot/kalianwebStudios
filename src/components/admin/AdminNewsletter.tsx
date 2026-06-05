import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy, doc, deleteDoc, DocumentData } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Trash2, Download, Mail } from 'lucide-react';

const AdminNewsletter = () => {
  const [subs, setSubs] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'musica' | 'danza'>('todos');
  const [mostrarBajas, setMostrarBajas] = useState(false);

  const fetchSubs = async () => {
    setLoading(true);
    setMsg('');
    try {
      const snap = await getDocs(query(collection(db, "newsletter_subscribers"), orderBy("fecha", "desc")));
      setSubs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err: any) {
      console.error("AdminNewsletter: Error en fetchSubs:", err);
      setMsg("❌ Error de carga: " + (err.message || "Permiso denegado"));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSubs();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Eliminar este suscriptor de la newsletter? Esta acción no se puede deshacer.")) return;
    try {
      await deleteDoc(doc(db, "newsletter_subscribers", id));
      setMsg("✅ Suscriptor eliminado");
      fetchSubs();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar");
    }
  };

  const formatFecha = (fecha: any): string => {
    const d = fecha?.toDate?.();
    return d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  };

  const filtrados = subs.filter(s => {
    const esBaja = (s.estado || 'activo') === 'baja';
    if (!mostrarBajas && esBaja) return false;
    if (filtro !== 'todos' && (s.interes || '').toLowerCase() !== filtro) return false;
    return true;
  });

  const totalBajas = subs.filter(s => (s.estado || 'activo') === 'baja').length;

  const exportCSV = () => {
    const escape = (v: any) => {
      const str = String(v ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    // Solo exportamos activos para no enviar newsletter a quien se dio de baja
    const exportables = filtrados.filter(s => (s.estado || 'activo') === 'activo');
    const header = ['Nombre', 'Email', 'Interes', 'Fecha'];
    const rows = exportables.map(s => [
      escape(s.nombre),
      escape(s.email),
      escape(s.interes),
      escape(formatFecha(s.fecha)),
    ].join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `newsletter_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <Link to="/staff" className="text-kalian-gold/40 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">← Volver al Panel</Link>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight">NEWS<span className="text-kalian-cream">LETTER</span></h1>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-kalian-gold/40 mt-2">
              {subs.length} {subs.length === 1 ? 'Suscriptor' : 'Suscriptores'}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={exportCSV} disabled={filtrados.length === 0} className="flex items-center gap-2 p-4 bg-kalian-gold/10 text-kalian-gold rounded-2xl border border-kalian-gold/20 hover:bg-kalian-gold/20 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
              <Download size={16} /> Exportar CSV
            </button>
            <button onClick={fetchSubs} className="p-4 bg-kalian-gold/10 text-kalian-gold rounded-2xl border border-kalian-gold/20 hover:bg-kalian-gold/20 transition-all">🔄</button>
          </div>
        </header>

        {msg && <div className="bg-kalian-gold text-black p-5 rounded-3xl mb-12 kalian-poster-text text-xl text-center shadow-2xl">{msg}</div>}

        {/* Filtro por interés + bajas */}
        <div className="flex gap-2 mb-8 flex-wrap items-center">
          {(['todos', 'musica', 'danza'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                filtro === f ? 'bg-kalian-gold text-black border-kalian-gold' : 'bg-transparent text-kalian-cream/50 border-kalian-gold/20 hover:border-kalian-gold/50'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'musica' ? 'Música' : 'Danza'}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-3 px-5 py-3 rounded-full border border-red-500/20 bg-red-500/5 cursor-pointer select-none text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10 transition-all">
            <input type="checkbox" checked={mostrarBajas} onChange={e => setMostrarBajas(e.target.checked)} className="accent-red-500" />
            Mostrar bajas {totalBajas > 0 && `(${totalBajas})`}
          </label>
        </div>

        <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] overflow-hidden shadow-2xl">
          <div className="p-8 border-b border-kalian-gold/10 bg-black/20">
            <div className="grid grid-cols-12 gap-4 text-[10px] font-black uppercase tracking-widest text-kalian-gold/60">
              <div className="col-span-4">Nombre</div>
              <div className="col-span-4">Email</div>
              <div className="col-span-2 text-center">Interés</div>
              <div className="col-span-2 text-right">Fecha / Acción</div>
            </div>
          </div>

          <div className="divide-y divide-kalian-gold/5">
            {loading ? (
              <div className="p-20 text-center kalian-poster-text text-3xl text-kalian-gold/20 animate-pulse">Cargando suscriptores...</div>
            ) : filtrados.length === 0 ? (
              <div className="p-20 text-center kalian-poster-text text-3xl text-kalian-gold/20 flex flex-col items-center gap-4">
                <Mail size={48} className="text-kalian-gold/20" />
                Sin suscriptores
              </div>
            ) : filtrados.map(s => {
              const esBaja = (s.estado || 'activo') === 'baja';
              return (
              <div key={s.id} className={`p-8 grid grid-cols-12 gap-4 items-center group transition-all ${esBaja ? 'bg-red-500/5 opacity-70' : 'hover:bg-white/5'}`}>
                <div className="col-span-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-lg kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors">{s.nombre || 'Sin nombre'}</p>
                    {esBaja && (
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[9px] font-black uppercase tracking-widest" title={s.motivo || 'baja'}>
                        BAJA{s.motivo ? ` · ${s.motivo}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-span-4">
                  <p className="text-[11px] font-bold text-kalian-cream/60 break-all">{s.email}</p>
                </div>
                <div className="col-span-2 flex justify-center">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                    (s.interes || '').toLowerCase() === 'musica' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-pink-500/10 text-pink-400 border-pink-500/20'
                  }`}>
                    {s.interes || '—'}
                  </span>
                </div>
                <div className="col-span-2 flex justify-end items-center gap-3">
                  <span className="text-[10px] font-mono text-kalian-cream/30">{formatFecha(s.fecha)}</span>
                  <button
                    onClick={() => handleDelete(s.id)}
                    title="Eliminar suscriptor"
                    className="p-2.5 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 bg-kalian-gold/5 border border-kalian-gold/10 p-8 rounded-[2.5rem]">
          <h3 className="text-xl kalian-poster-text text-kalian-gold mb-4 uppercase">¿Cómo enviar la newsletter?</h3>
          <p className="text-sm text-kalian-cream/60 leading-relaxed">
            Sincronizada con <span className="text-kalian-gold">Brevo</span> en ambas direcciones: las altas y bajas vía Brevo (unsubscribe, spam, hard bounce) se reflejan aquí automáticamente. Si borras un suscriptor desde esta página, también se elimina de Brevo. Las redacciones de campañas se hacen en el panel de Brevo.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminNewsletter;
