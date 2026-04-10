import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collectionGroup, getDocs, DocumentData } from 'firebase/firestore';

const AdminReservas = () => {
  const [reservas, setReservas] = useState<DocumentData[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      const res: DocumentData[] = [];
      const [snapA, snapI] = await Promise.all([getDocs(collectionGroup(db, 'asistentes')), getDocs(collectionGroup(db, 'inscritos'))]);
      snapA.forEach(d => res.push({ id: d.id, ...d.data(), tipo: 'Evento' }));
      snapI.forEach(d => res.push({ id: d.id, ...d.data(), tipo: 'Curso' }));
      setReservas(res.sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
    };
    fetchAll();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-black italic uppercase mb-8">Lista de Asistentes</h1>
        <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-white text-[10px] uppercase">
              <tr><th className="p-4">Persona</th><th className="p-4">Tipo</th><th className="p-4">Pago</th></tr>
            </thead>
            <tbody className="divide-y">
              {reservas.map(r => (
                <tr key={r.id} className="text-sm">
                  <td className="p-4 text-slate-900"><b>{r.nombre}</b><br/><span className="text-[10px] text-slate-500">{r.dni}</span></td>
                  <td className="p-4"><span className="px-2 py-1 bg-slate-100 rounded text-[9px] font-black uppercase text-slate-700">{r.tipo}</span></td>
                  <td className="p-4 font-bold text-slate-900">{r.totalPagado}€</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminReservas;
