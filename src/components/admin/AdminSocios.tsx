import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, DocumentData } from 'firebase/firestore';
import { Link } from 'react-router-dom';

const AdminSocios = () => {
  const [socios, setSocios] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const hoy = new Date().toISOString().split('T')[0];

  const fetchSocios = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "socios"));
      setSocios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSocios(); }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-900">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <Link to="/admin" className="text-indigo-600 font-bold text-xs uppercase tracking-widest">← Volver</Link>
          <div className="flex justify-between items-center mt-2">
            <h1 className="text-3xl font-black italic uppercase text-slate-900">Socios Kalian</h1>
            <button onClick={fetchSocios} className="text-xs font-bold uppercase bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors">🔄 Refrescar</button>
          </div>
        </header>

        {loading ? (
          <div className="text-center py-20 font-bold text-slate-400 uppercase tracking-widest animate-pulse">Cargando Socios...</div>
        ) : (
          <div className="grid gap-4">
            {socios.length === 0 && <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-200 text-slate-400 font-bold uppercase">No hay socios registrados</div>}
            {socios.map(s => {
              const exp = s.expiraciones || {};
              const activas = Object.keys(exp).filter(cat => exp[cat] >= hoy);
              
              return (
                <div key={s.id} className="bg-white p-6 rounded-[2.5rem] flex justify-between items-center shadow-sm border border-slate-200 group hover:border-indigo-200 transition-all">
                  <div>
                    <p className="font-black text-slate-800 uppercase leading-none mb-1 text-lg">{s.nombre || 'Sin nombre'}</p>
                    <p className="text-[10px] text-slate-400 font-mono font-bold tracking-widest">{s.dni || s.id}</p>
                    <p className="text-[9px] text-slate-300 italic mt-1">{s.email}</p>
                    {s.cursos && s.cursos.length > 0 && (
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {s.cursos.map((cId: string) => (
                          <span key={cId} className="text-[7px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">{cId}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {activas.map(cat => (
                      <div key={cat} className="flex flex-col items-end">
                        <span className="px-3 py-1 bg-emerald-500 text-white text-[9px] font-black uppercase rounded-lg shadow-sm">{cat}</span>
                        <span className="text-[7px] font-bold text-slate-300 mt-1 uppercase">Hasta {exp[cat]}</span>
                      </div>
                    ))}
                    {activas.length === 0 && <span className="px-4 py-1 bg-slate-100 text-slate-400 font-black text-[9px] uppercase rounded-lg border border-slate-200">Inactivo</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSocios;
