import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, updateDoc, DocumentData, getDoc, setDoc, increment, orderBy, addDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';

const AdminCheckIn = () => {
  const [eventos, setEventos] = useState<DocumentData[]>([]);
  const [eventoId, setEventoId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [reserva, setReserva] = useState<DocumentData | null>(null);
  const [socioEncontrado, setSocioEncontrado] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (mostrarScanner) {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => {
          setBusqueda(decodedText);
          setMostrarScanner(false);
          setTimeout(() => {
            const form = document.getElementById('search-form') as HTMLFormElement;
            form?.requestSubmit();
          }, 100);
        },
        (errorMessage) => {
          // ignore errors
        }
      ).catch((err) => {
        console.error("Error starting scanner", err);
        // If environment fails, try any camera
        html5QrCode.start(
          { facingMode: "user" },
          config,
          (decodedText) => {
            setBusqueda(decodedText);
            setMostrarScanner(false);
            setTimeout(() => {
              const form = document.getElementById('search-form') as HTMLFormElement;
              form?.requestSubmit();
            }, 100);
          },
          () => {}
        ).catch(e => console.error("Final scanner error", e));
      });

      return () => {
        if (scannerRef.current) {
          const scanner = scannerRef.current;
          if (scanner.isScanning) {
            scanner.stop().then(() => {
              scanner.clear();
            }).catch(err => console.error("Error stopping scanner", err));
          } else {
            scanner.clear();
          }
        }
      };
    }
  }, [mostrarScanner]);

  useEffect(() => {
    const fetchEventos = async () => {
      const snap = await getDocs(query(collection(db, "eventos"), orderBy("fecha", "desc")));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEventos(list);
      if (list.length > 0) setEventoId(list[0].id);
    };
    fetchEventos();
  }, []);

  const handleBusqueda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busqueda || !eventoId) return;

    setLoading(true);
    setError('');
    setMsg('');
    setReserva(null);
    setSocioEncontrado(null);

    const term = busqueda.trim().toUpperCase();

    try {
      // 1. Buscar por Ticket ID
      const qReserva = query(collection(db, "reservas"), where("ticketID", "==", term));
      const snapReserva = await getDocs(qReserva);
      
      if (!snapReserva.empty) {
        setReserva({ id: snapReserva.docs[0].id, ...snapReserva.docs[0].data() });
        setLoading(false);
        return;
      }

      // 2. Buscar por UID (QR) o DNI
      // Primero intentamos por DNI (ID del doc)
      let socioSnap = await getDoc(doc(db, "socios", term));
      
      // Si no, buscamos por UID
      if (!socioSnap.exists()) {
        const qSocio = query(collection(db, "socios"), where("uid", "==", busqueda.trim()));
        const snapSocio = await getDocs(qSocio);
        if (!snapSocio.empty) socioSnap = snapSocio.docs[0];
      }

      if (socioSnap.exists()) {
        const sData = socioSnap.data();
        // REGLA ANTIFRAUDE: Un QR solo una vez por evento
        const asistenciaRef = doc(db, "asistencia_eventos", `${eventoId}_${socioSnap.id}`);
        const asistenciaSnap = await getDoc(asistenciaRef);
        
        if (asistenciaSnap.exists()) {
          setError("❌ ERROR: Carnet ya utilizado hoy para este evento");
        } else {
          setSocioEncontrado({ id: socioSnap.id, ...sData });
        }
      } else {
        setError("No se encontró reserva ni soci@s con ese identificador");
      }
    } catch (err) {
      setError('Error en la búsqueda');
    }
    setLoading(false);
  };

  const registrarAsistenciaSocio = async () => {
    if (!socioEncontrado || !eventoId) return;
    setLoading(true);
    try {
      const evento = eventos.find(e => e.id === eventoId);
      const hoy = new Date().toISOString().split('T')[0];
      const expData = socioEncontrado.membresias || {};
      let tieneDescuento = false;

      if (evento?.categoria === 'musica') {
        tieneDescuento = (expData['musica'] || '') >= hoy || (expData['local'] || '') >= hoy;
      } else if (evento?.categoria === 'danza') {
        tieneDescuento = (expData['danza'] || '') >= hoy;
      }

      const precio = tieneDescuento ? (evento?.precio_descuento || 0) : (evento?.precio_estandar || 0);

      // Registrar asistencia
      await setDoc(doc(db, "asistencia_eventos", `${eventoId}_${socioEncontrado.id}`), {
        eventoId,
        socioId: socioEncontrado.id,
        nombre: socioEncontrado.nombre,
        fecha: new Date().toISOString(),
        precio: precio,
        tipo: 'socio'
      });

      // Sumar a caja
      const mesAnio = new Date().toISOString().substring(0, 7); // YYYY-MM
      await setDoc(doc(db, "caja_eventos", mesAnio), {
        total: increment(precio),
        ultimaActualizacion: new Date().toISOString()
      }, { merge: true });

      setMsg(`✅ Acceso concedido a ${socioEncontrado.nombre}. Cobrado: ${precio}€`);
      setSocioEncontrado(null);
      setBusqueda('');
    } catch (err) {
      alert("Error al registrar asistencia");
    }
    setLoading(false);
  };

  const registrarWalkIn = async () => {
    const dni = prompt("DNI del Walk-in (Opcional para soci@s):");
    let nombre = "";
    let esSocio = false;
    let socioId = null;

    setLoading(true);
    try {
      const evento = eventos.find(e => e.id === eventoId);
      let precio = evento?.precio_estandar || 0;

      if (dni) {
        const socioSnap = await getDoc(doc(db, "socios", dni.toUpperCase()));
        if (socioSnap.exists()) {
          const sData = socioSnap.data();
          nombre = sData.nombre;
          esSocio = true;
          socioId = socioSnap.id;
          
          const hoy = new Date().toISOString().split('T')[0];
          const expData = sData.membresias || {};
          let tieneDescuento = false;

          if (evento?.categoria === 'musica') {
            tieneDescuento = (expData['musica'] || '') >= hoy || (expData['local'] || '') >= hoy;
          } else if (evento?.categoria === 'danza') {
            tieneDescuento = (expData['danza'] || '') >= hoy;
          } else {
            tieneDescuento = (expData[evento?.categoria] || '') >= hoy;
          }

          if (tieneDescuento) {
            precio = evento?.precio_descuento || 0;
          }
        } else {
          nombre = prompt("DNI no encontrado. Introduce nombre:") || "Walk-in";
        }
      } else {
        nombre = prompt("Introduce nombre del Walk-in:") || "Walk-in";
      }

      if (!nombre) {
        setLoading(false);
        return;
      }

      await addDoc(collection(db, "asistencia_eventos"), {
        eventoId,
        socioId,
        nombre: nombre,
        fecha: new Date().toISOString(),
        precio: precio,
        tipo: esSocio ? 'socio_walkin' : 'walk-in'
      });

      const mesAnio = new Date().toISOString().substring(0, 7);
      await setDoc(doc(db, "caja_eventos", mesAnio), {
        total: increment(precio),
        ultimaActualizacion: new Date().toISOString()
      }, { merge: true });

      setMsg(`✅ Walk-in registrado: ${nombre}. Cobrado: ${precio}€`);
      setBusqueda('');
    } catch (err) {
      alert("Error al registrar walk-in");
    }
    setLoading(false);
  };

  const actualizarSlot = async (index: number, nuevoEstado: string, esSocio: boolean = false) => {
    if (!reserva) return;

    const nuevosSlots = [...reserva.slots];
    const precioAnterior = nuevosSlots[index].estado === 'pendiente' ? nuevosSlots[index].precio : 0;
    
    nuevosSlots[index] = { 
      ...nuevosSlots[index], 
      estado: nuevoEstado,
      esSocio: esSocio,
      precio: esSocio ? 0 : nuevosSlots[index].precio
    };

    const totalPendiente = nuevosSlots.reduce((acc, s) => acc + (s.estado === 'pendiente' ? s.precio : 0), 0);
    const cobrado = nuevosSlots[index].estado === 'pagado_efectivo' ? nuevosSlots[index].precio : 0;

    try {
      await updateDoc(doc(db, "reservas", reserva.id), {
        slots: nuevosSlots,
        totalPendiente: totalPendiente
      });

      if (cobrado > 0) {
        const mesAnio = new Date().toISOString().substring(0, 7);
        await setDoc(doc(db, "caja_eventos", mesAnio), {
          total: increment(cobrado),
          ultimaActualizacion: new Date().toISOString()
        }, { merge: true });
      }

      setReserva({ ...reserva, slots: nuevosSlots, totalPendiente: totalPendiente });
      if (totalPendiente === 0) {
        setMsg("✅ Reserva completada y cobrada");
        setTimeout(() => setReserva(null), 2000);
      }
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
        
        // Anti-fraud check for socio extra
        const asistenciaRef = doc(db, "asistencia_eventos", `${eventoId}_${socioSnap.id}`);
        const asistenciaSnap = await getDoc(asistenciaRef);
        if (asistenciaSnap.exists()) {
          alert("❌ ERROR: Este carnet ya ha sido usado para este evento.");
          return;
        }

        const evento = eventos.find(e => e.id === eventoId);
        let tieneDescuento = false;
        if (evento?.categoria === 'musica') {
          tieneDescuento = (data.membresias?.['musica'] || '') >= hoy || (data.membresias?.['local'] || '') >= hoy;
        } else {
          tieneDescuento = (data.membresias?.[evento?.categoria] || '') >= hoy;
        }
        
        if (tieneDescuento) {
          await setDoc(asistenciaRef, {
            eventoId,
            socioId: socioSnap.id,
            nombre: data.nombre,
            fecha: new Date().toISOString(),
            precio: 0,
            tipo: 'socio_reserva'
          });
          actualizarSlot(index, 'validado_socio', true);
        } else {
          alert("Soci@s inactivo en esta categoría");
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

        {/* SELECTOR DE EVENTO */}
        <div className="mb-6">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-4">Evento Actual</p>
          <select 
            className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-indigo-400 font-bold outline-none"
            value={eventoId}
            onChange={e => setEventoId(e.target.value)}
          >
            {eventos.map(ev => (
              <option key={ev.id} value={ev.id} className="bg-slate-900">{ev.titulo} ({new Date(ev.fecha).toLocaleDateString()})</option>
            ))}
          </select>
        </div>

        {/* BOTÓN ESCÁNER PROMINENTE */}
        {!mostrarScanner ? (
          <button 
            onClick={() => setMostrarScanner(true)}
            className="w-full mb-6 p-8 bg-indigo-600 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20 group"
          >
            <div className="bg-white/20 p-4 rounded-2xl group-hover:scale-110 transition-transform">
              <Camera size={32} className="text-white" />
            </div>
            <div className="text-center">
              <p className="text-xl font-black uppercase italic tracking-tighter">Activar Escáner QR</p>
              <p className="text-[10px] font-bold uppercase text-indigo-200 tracking-widest opacity-60">Usa la cámara para validar carnets</p>
            </div>
          </button>
        ) : (
          <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex justify-between items-center mb-4 px-4">
              <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Escáner en vivo</p>
              <button 
                onClick={() => setMostrarScanner(false)}
                className="flex items-center gap-2 bg-red-500/20 text-red-400 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-all"
              >
                <X size={14} /> Cerrar Cámara
              </button>
            </div>
            <div id="reader" className="overflow-hidden rounded-[3rem] border-2 border-indigo-500/30 bg-black/40 shadow-2xl min-h-[300px]"></div>
            <p className="text-center text-[10px] font-black uppercase text-slate-500 mt-6 tracking-widest animate-pulse">Enfoca el código QR del socio</p>
          </div>
        )}

        {/* BUSCADOR MANUAL */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-4 px-4">
            <div className="h-px flex-1 bg-white/10"></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">O búsqueda manual</p>
            <div className="h-px flex-1 bg-white/10"></div>
          </div>
          <form id="search-form" onSubmit={handleBusqueda} className="flex gap-2">
            <div className="relative flex-1">
              <input 
                type="text" 
                placeholder="TICKET, QR O DNI" 
                className="w-full p-6 bg-white/5 border border-white/10 rounded-3xl text-center text-2xl font-black uppercase outline-none focus:border-indigo-500 transition-all"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
              {busqueda && (
                <button 
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              )}
            </div>
            <button className="bg-indigo-600 px-8 rounded-3xl font-black uppercase text-xs hover:bg-indigo-500 transition-all">OK</button>
          </form>
        </div>

        <button 
          onClick={registrarWalkIn}
          className="w-full mb-10 p-4 bg-white/5 border border-white/10 rounded-2xl text-slate-300 font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
        >
          + Registrar Walk-in (Manual)
        </button>

        {loading && <div className="text-center animate-pulse italic text-slate-500 mb-6">Procesando...</div>}
        {error && <div className="bg-red-500/20 text-red-400 p-6 rounded-3xl text-center font-bold mb-6 border border-red-500/30">{error}</div>}
        {msg && <div className="bg-emerald-500/20 text-emerald-400 p-6 rounded-3xl text-center font-bold mb-6 border border-emerald-500/30">{msg}</div>}

        {/* RESULTADO SOCIO (QR/DNI) */}
        {socioEncontrado && (
          <div className="bg-indigo-500/10 border-2 border-indigo-500 p-10 rounded-[4rem] animate-in fade-in zoom-in duration-300 mb-10 shadow-2xl shadow-indigo-500/20">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-2">Soci@s Identificado</p>
                <h2 className="text-5xl font-black italic uppercase leading-none tracking-tighter">{socioEncontrado.nombre}</h2>
              </div>
              <div className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${socioEncontrado.estado === 'activo' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                {socioEncontrado.estado}
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-4 mb-10">
              {['musica', 'danza', 'local'].map(cat => {
                const exp = socioEncontrado.membresias?.[cat];
                const hoy = new Date().toISOString().split('T')[0];
                const activo = exp && exp >= hoy;
                const esCatEvento = eventos.find(e => e.id === eventoId)?.categoria === cat;

                return (
                  <div key={cat} className={`flex justify-between items-center p-5 rounded-3xl border ${activo ? (esCatEvento ? 'bg-indigo-500/20 border-indigo-500' : 'bg-emerald-500/5 border-emerald-500/20') : 'bg-red-500/5 border-red-500/10'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{cat === 'musica' ? '🎸' : cat === 'danza' ? '💃' : '🏠'}</span>
                      <span className={`text-xs uppercase font-black tracking-widest ${activo ? 'text-white' : 'text-white/20'}`}>{cat === 'musica' ? 'Music Is Cool' : cat === 'danza' ? 'Club de Baile' : 'Locales'}</span>
                    </div>
                    <span className={`text-[10px] font-black uppercase ${activo ? 'text-emerald-400' : 'text-red-500/40'}`}>
                      {activo ? `Vence: ${exp}` : 'Caducado'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setSocioEncontrado(null)}
                className="flex-1 bg-white/5 p-6 rounded-2xl font-black uppercase text-xs hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={registrarAsistenciaSocio}
                className="flex-[2] bg-indigo-600 p-6 rounded-2xl font-black uppercase text-xl hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-500/20"
              >
                Confirmar Entrada
              </button>
            </div>
          </div>
        )}

        {reserva && (
          <div className="space-y-8 animate-in fade-in zoom-in duration-300">
            {/* INFO RESERVA */}
            <div className="bg-white/5 p-8 rounded-[4rem] border border-white/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[9px] font-black uppercase bg-indigo-500 text-white px-4 py-1.5 rounded-full tracking-widest">{reserva.categoria}</span>
                  <p className="text-[10px] font-mono text-slate-400">REF: {reserva.ticketID}</p>
                </div>
                <h2 className="text-4xl font-black italic uppercase leading-none mb-6 tracking-tighter">{reserva.eventoTitulo}</h2>
                <div className="flex justify-between items-end pt-6 border-t border-white/5">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Pendiente</p>
                    <p className="text-5xl font-black italic text-indigo-400">{reserva.totalPendiente}€</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Acompañantes</p>
                    <p className="text-2xl font-black text-white">{reserva.acompañantes || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* BARAJA DE SLOTS */}
            <div className="space-y-4">
              <div className="flex justify-between items-center px-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Slots de Acceso</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase italic">Validar uno a uno</span>
              </div>
              {reserva.slots.map((s: any, idx: number) => (
                <div 
                  key={idx} 
                  className={`relative p-6 rounded-[2.5rem] border-2 transition-all duration-500 flex flex-col sm:flex-row justify-between items-center gap-4 ${
                    s.estado === 'pendiente' ? 'bg-white/5 border-white/10' : 
                    s.estado === 'pagado_efectivo' ? 'bg-emerald-500/10 border-emerald-500/30' : 
                    s.estado === 'ingresado' ? 'bg-blue-500/10 border-blue-500/30' :
                    'bg-indigo-500/10 border-indigo-500/30'
                  }`}
                >
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg ${
                      s.estado === 'pendiente' ? 'bg-slate-800 text-slate-500' : 
                      s.estado === 'pagado_efectivo' ? 'bg-emerald-500 text-white' : 
                      s.estado === 'ingresado' ? 'bg-blue-500 text-white' :
                      'bg-indigo-500 text-white'
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-black uppercase text-xl leading-none tracking-tight">
                        {s.tipo === 'titular' ? (s.nombre || 'TITULAR') : `ACOMPAÑANTE ${idx}`}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${
                          s.estado === 'pendiente' ? 'text-yellow-500' : 
                          s.estado === 'pagado_efectivo' ? 'text-emerald-400' : 
                          s.estado === 'ingresado' ? 'text-blue-400' :
                          'text-indigo-400'
                        }`}>
                          {s.estado.replace('_', ' ')}
                        </span>
                        {s.esSocio && <span className="text-[8px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-md font-black">SOCI@</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    {s.estado === 'pendiente' && (
                      <>
                        {s.precio > 0 ? (
                          <button 
                            onClick={() => actualizarSlot(idx, 'pagado_efectivo')}
                            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-4 rounded-2xl font-black uppercase text-[10px] transition-all shadow-lg shadow-emerald-600/20"
                          >Cobrar {s.precio}€</button>
                        ) : (
                          <button 
                            onClick={() => actualizarSlot(idx, 'ingresado')}
                            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-2xl font-black uppercase text-[10px] transition-all shadow-lg shadow-blue-600/20"
                          >Ingresar</button>
                        )}
                        
                        {s.tipo === 'acompañante' && (
                          <button 
                            onClick={() => validarSocioExtra(idx)}
                            className="flex-1 sm:flex-none bg-white/10 hover:bg-white/20 text-white px-6 py-4 rounded-2xl font-black uppercase text-[10px] transition-all"
                          >Validar Soci@s</button>
                        )}
                      </>
                    )}
                    {(s.estado === 'pagado_efectivo' || s.estado === 'validado_socio' || s.estado === 'ingresado') && (
                      <div className="flex items-center gap-2 text-emerald-400 font-black italic uppercase text-sm px-4">
                        <span className="text-xl">✓</span>
                        <span>ACCESO OK</span>
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
