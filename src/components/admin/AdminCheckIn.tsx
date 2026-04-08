import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, updateDoc, DocumentData, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

const AdminCheckIn = () => {
  const [ticketID, setTicketID] = useState('');
  const [reserva, setReserva] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buscarReserva = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ticketID) return;

    setLoading(true);
    setError('');
    setReserva(null);

    try {
      const q = query(collection(db, "reservas"), where("ticketID", "==", ticketID.toUpperCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setError('Reserva no encontrada');
      } else {
        setReserva({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    } catch (err) {
      setError('Error al buscar');
    }
    setLoading(false);
  };

  const actualizarSlot = async (index: number, nuevoEstado: string, esSocio: boolean = false) => {
    if (!reserva) return;

    const nuevosSlots = [...reserva.slots];
    nuevosSlots[index] = { 
      ...nuevosSlots[index], 
      estado: nuevoEstado,
      esSocio: esSocio,
      precio: esSocio ? 0 : nuevosSlots[index].precio
    };

    const totalPendiente = nuevosSlots.reduce((acc, s) => acc + (s.estado === 'pendiente' ? s.precio : 0), 0);

    try {
      await updateDoc(doc(db, "reservas", reserva.id), {
        slots: nuevosSlots,
        totalPendiente: totalPendiente
      });
      setReserva({ ...reserva, slots: nuevosSlots, totalPendiente: totalPendiente });
    } catch (err) {
      alert("Error al actualizar");
    }
  };

  const validarSocioExtra = async (index: number) => {
    const dni = prompt("Introduce el DNI del acompañante para validar su carnet de soci@s:");
    if (!dni) return;

    try {
      const socioRef = doc(db, "socios", dni.toUpperCase());
      const socioSnap = await getDoc(socioRef);
      
      if (socioSnap.exists()) {
        const data = socioSnap.data();
        const hoy = new Date().toISOString().split('T')[0];
        const exp = data.expiraciones?.[reserva?.categoria] || '';
        
        if (exp >= hoy) {
          actualizarSlot(index, 'validado_socio', true);
        } else {
          alert("Socio inactivo en esta categoría");
        }
      } else {
        alert("DNI no registrado como soci@s");
      }
    } catch (err) {
      alert("Error en la validación");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6 font-sans text-white">
      <div className="max-w-xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <Link to="/staff" className="text-slate-500 font-bold text-xs uppercase tracking-widest">← Panel</Link>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">Control de <span className="text-indigo-500">Acceso</span></h1>
        </header>

        {/* BUSCADOR */}
        <form onSubmit={buscarReserva} className="mb-10 flex gap-2">
          <input 
            type="text" 
            placeholder="ID TICKET (ej: 4X9B2Z)" 
            className="flex-1 p-6 bg-white/5 border border-white/10 rounded-3xl text-center text-3xl font-black uppercase outline-none focus:border-indigo-500 transition-all"
            value={ticketID}
            onChange={e => setTicketID(e.target.value)}
            autoFocus
          />
          <button className="bg-indigo-600 p-6 rounded-3xl font-black uppercase text-xs hover:bg-indigo-500 transition-all">Buscar</button>
        </form>

        {loading && <div className="text-center animate-pulse italic text-slate-500">Buscando reserva...</div>}
        {error && <div className="bg-red-500/20 text-red-400 p-6 rounded-3xl text-center font-bold mb-6 border border-red-500/30">{error}</div>}

        {reserva && (
          <div className="space-y-8 animate-in fade-in zoom-in duration-300">
            {/* INFO EVENTO */}
            <div className="bg-white/5 p-8 rounded-[3rem] border border-white/10">
              <span className="text-[9px] font-black uppercase bg-indigo-500 text-white px-3 py-1 rounded-full mb-3 inline-block">{reserva.categoria}</span>
              <h2 className="text-3xl font-black italic uppercase leading-none">{reserva.eventoTitulo}</h2>
              <div className="mt-6 flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Pendiente</p>
                  <p className="text-5xl font-black italic text-indigo-400">{reserva.totalPendiente}€</p>
                </div>
                <p className="text-[10px] font-mono text-slate-600">REF: {reserva.ticketID}</p>
              </div>
            </div>

            {/* BARAJA DE SLOTS */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] ml-6">Slots de Acceso</h3>
              {reserva.slots.map((s: any, idx: number) => (
                <div 
                  key={idx} 
                  className={`relative p-6 rounded-[2.5rem] border-2 transition-all duration-500 flex justify-between items-center ${
                    s.estado === 'pendiente' ? 'bg-white/5 border-white/10' : 
                    s.estado === 'pagado_efectivo' ? 'bg-emerald-500/10 border-emerald-500/30' : 
                    'bg-indigo-500/10 border-indigo-500/30'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${
                      s.estado === 'pendiente' ? 'bg-slate-800 text-slate-500' : 
                      s.estado === 'pagado_efectivo' ? 'bg-emerald-500 text-white' : 
                      'bg-indigo-500 text-white'
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-black uppercase text-lg leading-none">
                        {s.tipo === 'titular' ? (s.nombre || 'TITULAR') : 'ACOMPAÑANTE'}
                      </p>
                      <p className={`text-[9px] font-bold uppercase mt-1 tracking-widest ${
                        s.estado === 'pendiente' ? 'text-yellow-500' : 
                        s.estado === 'pagado_efectivo' ? 'text-emerald-400' : 
                        'text-indigo-400'
                      }`}>
                        {s.estado.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {s.estado === 'pendiente' && (
                      <>
                        <button 
                          onClick={() => actualizarSlot(idx, 'pagado_efectivo')}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-2xl font-black uppercase text-[10px] transition-all"
                        >Cobrar {s.precio}€</button>
                        {s.tipo === 'acompañante' && (
                          <button 
                            onClick={() => validarSocioExtra(idx)}
                            className="bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-2xl font-black uppercase text-[10px] transition-all"
                          >Validar Socio</button>
                        )}
                      </>
                    )}
                    {(s.estado === 'pagado_efectivo' || s.estado === 'validado_socio') && (
                      <div className="flex items-center gap-2 text-emerald-400 font-black italic uppercase text-xs">
                        <span>✓ ACCESO OK</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminCheckIn;
