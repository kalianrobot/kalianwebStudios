import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, updateDoc, doc, DocumentData, setDoc, getDoc, query, where, writeBatch, onSnapshot, deleteField } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { registrarIngreso, MetodoPago } from '../../lib/finanzas';
import { fetchConfig } from '../../lib/configService';
import { syncMultipleSocios } from '../../lib/socioService';

const AdminLocales = () => {
  const { user } = useAuth();
  const [locales, setLocales] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [normalizing, setNormalizing] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [msg, setMsg] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Transferencia');
  const [cuotaGlobal, setCuotaGlobal] = useState(15);

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const mesAnioKey = `${anioActual}_${mesActual}`;

  useEffect(() => { 
    if (!user) return;
    fetchConfig().then(conf => setCuotaGlobal(conf.cuotaMensualSocio));

    const unsub = onSnapshot(collection(db, "locales"), (snap) => {
      if (snap.empty) {
        // Initial setup if empty
        const initial = [
          { id: 'L1', nombre: 'Local 1', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L2', nombre: 'Local 2', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L3', nombre: 'Local 3', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L4', nombre: 'Local 4', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L5', nombre: 'Local 5', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L6', nombre: 'Local 6', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
          { id: 'L7', nombre: 'Local 7', estado: 'disponible', alquilado: false, inquilinos: [], fechaExpiracion: '2099-12-31' },
        ];
        initial.forEach(loc => {
          const { id, ...data } = loc;
          setDoc(doc(db, "locales", id), data);
        });
      } else {
        setLocales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      setLoading(false);
    }, (err) => {
      console.error("AdminLocales: Error en onSnapshot:", err.message);
    });

    return () => unsub();
  }, [user]);

  const normalizarLocales = async () => {
    if (!window.confirm("¿Seguro que deseas normalizar la colección de locales? Esto asegurará que todos tengan los campos 'estado' y 'alquilado' según el estándar.")) return;
    
    try {
      setNormalizing(true);
      const batch = writeBatch(db);
      const snap = await getDocs(collection(db, "locales"));
      
      snap.forEach(lDoc => {
        const data = lDoc.data();
        const update: any = {};
        
        // 1. Normalizar 'alquilado'
        if (data.alquilado === undefined) {
          update.alquilado = false;
        }
        
        // 2. Normalizar 'estado'
        if (!data.estado || !['disponible', 'mantenimiento', 'reservado'].includes(data.estado)) {
          update.estado = 'disponible';
        }
        
        if (Object.keys(update).length > 0) {
          batch.update(lDoc.ref, update);
        }
      });
      
      await batch.commit();
      setMsg("✅ Normalización completada con éxito");
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al normalizar locales");
    } finally {
      setNormalizing(false);
    }
  };

  const toggleEstado = async (id: string, actual: string) => {
    const nuevo = actual === 'disponible' ? 'mantenimiento' : 'disponible';
    try {
      await updateDoc(doc(db, "locales", id), { estado: nuevo });
    } catch (err) { console.error(err); }
  };

  const marcarPagoLocal = async (local: any) => {
    if (!local.alquilado) return;
    const yaPagado = local.ultimoPagoMesAnio === mesAnioKey;
    if (yaPagado) {
      if (!window.confirm("Este local ya figura como pagado este mes. ¿Deseas marcarlo como PENDIENTE? (Los soci@s vinculados también se marcarán como pendientes)")) return;
    } else {
      if (!window.confirm(`¿Confirmas el pago de la aportación de ${local.nombre} para ${meses[mesActual-1]}?`)) return;
    }

    try {
      setLoading(true);
      const nuevoEstado = !yaPagado;
      const batch = writeBatch(db);
      
      // 1. Actualizar Local
      await updateDoc(doc(db, "locales", local.id), {
        ultimoPagoMesAnio: nuevoEstado ? mesAnioKey : ''
      });

      // 2. Obtener socios vinculados (excluyendo borrados)
      const q = query(collection(db, "socios"), where("localId", "==", local.id));
      const snapRaw = await getDocs(q);
      const sociosVivos = snapRaw.docs.filter(d => !d.data().deletedAt);

      // 3. Actualizar estado de pago de los socios
      for (const sDoc of sociosVivos) {
        const socioId = sDoc.id;
        const pagoId = `${anioActual}_${mesActual}_${socioId}`;
        const pagoRef = doc(db, "pagos_mensuales", pagoId);

        batch.set(pagoRef, {
          socioId,
          mes: mesActual,
          anio: anioActual,
          pagado: nuevoEstado,
          bloqueado: nuevoEstado, // Bloqueo anti-error
          monto: nuevoEstado ? cuotaGlobal : 0,
          actualizadoPor: 'admin_bulk_local',
          fechaActualizacion: new Date().toISOString(),
          localId: local.id
        }, { merge: true });

        // Al marcar pagado, restaurar membresias.local por si syncSocioStatus
        // antiguo (o una edición previa) la dejó vacía.
        if (nuevoEstado && local.fechaExpiracion) {
          batch.update(sDoc.ref, {
            'membresias.local': local.fechaExpiracion
          });
        }
      }

      // 4. Registrar en Finanzas (Aportación o Devolución)
      const montoTransaccion = sociosVivos.length * cuotaGlobal;
      await registrarIngreso({
        monto: nuevoEstado ? montoTransaccion : -montoTransaccion,
        concepto: nuevoEstado
          ? `Aportación Local ${local.nombre} (${sociosVivos.length} socios) - ${meses[mesActual-1]}`
          : `REVERSIÓN: Aportación Local ${local.nombre} - ${meses[mesActual-1]}`,
        categoria: 'Aportación Socio Local',
        metodo: metodoPago,
        local_id: local.id,
        mes: mesActual,
        anio: anioActual
      });

      await batch.commit();

      const socioIds = sociosVivos.map(d => d.id);
      if (socioIds.length > 0) {
        await syncMultipleSocios(socioIds);
      }
      
      if (nuevoEstado) {
        setMsg(`✅ Aportación de ${local.nombre} procesada (${montoTransaccion}€)`);
      } else {
        setMsg(`⚠️ Pago revertido para ${local.nombre}. Soci@s marcados como pendientes.`);
      }

      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al procesar pago");
    } finally {
      setLoading(false);
    }
  };

  const guardarLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;

    // Validación de DNI/NIE de todos los inquilinos antes de tocar Firestore
    if (editando.alquilado && editando.inquilinos) {
      const dniRe = /^[0-9XYZ][0-9]{7}[A-Z]$/;
      for (let i = 0; i < editando.inquilinos.length; i++) {
        const inq = editando.inquilinos[i];
        const raw = (inq.dni || '').trim().toUpperCase();
        if (!raw) continue; // permite filas en blanco que el usuario aún no rellenó
        if (!dniRe.test(raw)) {
          alert(`❌ DNI/NIE no válido en la fila ${i + 1}: "${inq.dni}"\nFormato: 8 dígitos + letra (ej: 12345678A) o NIE (ej: X1234567A).\n\nCorrígelo antes de guardar.`);
          return;
        }
        // Normalizar a la versión limpia (trim + upper) para que doc-id y dni queden coherentes
        editando.inquilinos[i] = { ...inq, dni: raw };
      }
    }

    try {
      setLoading(true);
      const localOriginal = locales.find(l => l.id === editando.id);
      const estabaPagado = localOriginal?.ultimoPagoMesAnio === mesAnioKey;
      const ahoraPagado = editando.ultimoPagoMesAnio === mesAnioKey;

      // 1. Actualizar Local
      await updateDoc(doc(db, "locales", editando.id), {
        alquilado: editando.alquilado,
        nombreGrupo: editando.nombreGrupo || '',
        actividadArtistica: editando.actividadArtistica || '',
        fechaExpiracion: editando.fechaExpiracion || '',
        inquilinos: editando.inquilinos || [],
        ultimoPagoMesAnio: editando.ultimoPagoMesAnio || ''
      });

      // 2. Sincronizar Pagos si el estado de pago CAMBIÓ
      if (estabaPagado !== ahoraPagado) {
        const q = query(collection(db, "socios"), where("localId", "==", editando.id));
        const snapRaw = await getDocs(q);
        const sociosVivos = snapRaw.docs.filter(d => !d.data().deletedAt);
        const batch = writeBatch(db);

        // Actualizar socios
        for (const sDoc of sociosVivos) {
          const socioId = sDoc.id;
          const pagoId = `${anioActual}_${mesActual}_${socioId}`;
          const pagoRef = doc(db, "pagos_mensuales", pagoId);

          batch.set(pagoRef, {
            socioId,
            mes: mesActual,
            anio: anioActual,
            pagado: ahoraPagado,
            bloqueado: ahoraPagado, // Bloqueo anti-error
            monto: ahoraPagado ? cuotaGlobal : 0,
            actualizadoPor: 'admin_modal_local',
            fechaActualizacion: new Date().toISOString(),
            localId: editando.id
          }, { merge: true });

          if (ahoraPagado && editando.fechaExpiracion) {
            batch.update(sDoc.ref, {
              'membresias.local': editando.fechaExpiracion
            });
          }
        }
        await batch.commit();

        // Registrar en Finanzas (Aportación o Reversión)
        const montoTransaccion = sociosVivos.length * cuotaGlobal;
        if (montoTransaccion > 0) {
          await registrarIngreso({
            monto: ahoraPagado ? montoTransaccion : -montoTransaccion,
            concepto: ahoraPagado
              ? `Aportación Local ${editando.nombre} (${sociosVivos.length} socios) - ${meses[mesActual-1]}`
              : `REVERSIÓN: Aportación Local ${editando.nombre} - ${meses[mesActual-1]}`,
            categoria: 'Aportación Socio Local',
            metodo: metodoPago,
            local_id: editando.id,
            mes: mesActual,
            anio: anioActual
          });
        }
      }

      // 3. Limpiar localId para inquilinos eliminados
      const viejosDNIs = new Set(
        (localOriginal?.inquilinos || []).map((i: any) => i.dni?.toUpperCase()).filter(Boolean)
      );
      const nuevosDNIs = new Set(
        (editando.inquilinos || []).map((i: any) => i.dni?.toUpperCase()).filter(Boolean)
      );
      const dnisBorrados = [...viejosDNIs].filter(dni => !nuevosDNIs.has(dni as string));

      for (const dni of dnisBorrados) {
        const socioRef = doc(db, "socios", dni as string);
        const sSnap = await getDoc(socioRef);
        if (sSnap.exists() && sSnap.data().localId === editando.id) {
          await updateDoc(socioRef, { localId: deleteField() });
        }
      }

      // 4. Sincronizar Inquilinos como Socios
      if (editando.alquilado && editando.inquilinos) {
        for (const inq of editando.inquilinos) {
          if (!inq.dni) continue;
          const dniUpper = inq.dni.toUpperCase();
          const socioRef = doc(db, "socios", dniUpper);
          const socioSnap = await getDoc(socioRef);

          const socioData = {
            dni: dniUpper,
            nombre: inq.nombre || '',
            direccion: inq.direccion || '',
            email: inq.email || '',
            cuentaBancaria: inq.cuentaBancaria || '',
            verificado: true,
            localId: editando.id,
            [`membresias.local`]: editando.fechaExpiracion || '',
          };

          if (!socioSnap.exists()) {
            await setDoc(socioRef, { ...socioData, uid: 'local-' + Math.random().toString(36).substring(7) });
          } else {
            await updateDoc(socioRef, socioData);
          }
        }
      }

      const dnisActivos = (editando.inquilinos || [])
        .map((i: any) => i.dni?.toUpperCase())
        .filter(Boolean);
      const dnisASincronizar = [...new Set([...dnisActivos, ...dnisBorrados])] as string[];
      if (dnisASincronizar.length > 0) {
        await syncMultipleSocios(dnisASincronizar);
      }

      setMsg("✅ Local actualizado y soci@s sincronizados");
      setTimeout(() => setMsg(''), 3000);
      setEditando(null);
    } catch (err) {
      console.error(err);
      alert("Error al guardar");
    }
  };

  const addInquilino = () => {
    const nuevo = { nombre: '', dni: '', direccion: '', email: '', cuentaBancaria: '' };
    setEditando({ ...editando, inquilinos: [...(editando.inquilinos || []), nuevo] });
  };

  const removeInquilino = (index: number) => {
    const list = [...editando.inquilinos];
    list.splice(index, 1);
    setEditando({ ...editando, inquilinos: list });
  };

  const updateInquilino = (index: number, field: string, value: string) => {
    const list = [...editando.inquilinos];
    list[index] = { ...list[index], [field]: value };
    setEditando({ ...editando, inquilinos: list });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <Link to="/staff" className="text-indigo-600 font-bold text-xs uppercase tracking-widest">← Volver</Link>
            <h1 className="text-3xl font-black italic uppercase text-slate-900 mt-2">Gestión de Locales</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Método:</p>
              <select 
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                className="bg-transparent text-[10px] text-slate-900 font-bold outline-none cursor-pointer"
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Transferencia">Transferencia</option>
              </select>
            </div>
            <button 
              onClick={normalizarLocales}
              disabled={normalizing}
              className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-black uppercase text-[9px] tracking-widest border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-50"
            >
              {normalizing ? 'NORMALIZANDO...' : 'NORMALIZAR DATOS'}
            </button>
            {msg && <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold animate-bounce shadow-lg">{msg}</div>}
          </div>
        </header>

        {loading ? (
          <div className="text-center py-20 font-bold text-slate-400 uppercase tracking-widest animate-pulse">Cargando Locales...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {locales.map(l => (
              <div key={l.id} className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 flex flex-col justify-between group hover:border-indigo-200 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-black uppercase italic">{l.nombre}</h2>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${l.estado === 'disponible' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                      {l.estado}
                    </span>
                  </div>
                  
                  <div className="flex gap-4 mb-6">
                    <div className="flex-1 bg-slate-50 p-3 rounded-2xl text-center">
                      <p className="text-[8px] font-black uppercase text-slate-600">Soci@s</p>
                      <p className="font-black text-lg">{l.inquilinos?.length || 0}</p>
                    </div>
                    <div className={`flex-1 p-3 rounded-2xl text-center ${l.alquilado ? 'bg-red-50' : 'bg-emerald-50'}`}>
                      <p className="text-[8px] font-black uppercase text-slate-600">Estado</p>
                      <p className={`font-black text-lg ${l.alquilado ? 'text-red-600' : 'text-emerald-600'}`}>{l.alquilado ? 'ALQUILADO' : 'LIBRE'}</p>
                    </div>
                  </div>

                  {l.alquilado && (
                    <div className="mb-6 space-y-2">
                      <p className="text-[10px] font-black uppercase text-indigo-600 tracking-tighter">Grupo: <span className="text-slate-900">{l.nombreGrupo}</span></p>
                      <p className="text-[10px] font-black uppercase text-slate-600 tracking-tighter">Actividad: <span className="text-slate-900">{l.actividadArtistica}</span></p>
                      <p className="text-[10px] font-black uppercase text-slate-600 tracking-tighter">Expira: <span className="text-slate-900">{l.fechaExpiracion === '2099-12-31' ? 'INDEFINIDA' : l.fechaExpiracion}</span></p>
                      
                      <div className="pt-4 border-t border-slate-100">
                        <button 
                          onClick={() => marcarPagoLocal(l)}
                          className={`w-full p-3 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all flex items-center justify-center gap-2 ${l.ultimoPagoMesAnio === mesAnioKey ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white animate-pulse'}`}
                        >
                          {l.ultimoPagoMesAnio === mesAnioKey ? '✅ APORTACIÓN PAGADA' : '❌ PAGO PENDIENTE'}
                          <span className="opacity-60">({meses[mesActual-1]})</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <button 
                    onClick={() => setEditando(l)}
                    className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-600 transition-all shadow-md"
                  >
                    Editar Alquiler / Soci@s
                  </button>
                  <button 
                    onClick={() => toggleEstado(l.id, l.estado)}
                    className="w-full p-4 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-slate-900 transition-all"
                  >
                    {l.estado === 'disponible' ? 'Poner en Mantenimiento' : 'Habilitar Local'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL DE EDICIÓN */}
        {editando && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 z-50 overflow-y-auto">
            <div className="bg-white w-full max-w-4xl rounded-[3.5rem] shadow-2xl overflow-hidden my-auto">
              <form onSubmit={guardarLocal} className="p-10 space-y-8">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-black uppercase italic">Editar <span className="text-indigo-600">{editando.nombre}</span></h2>
                  <button type="button" onClick={() => setEditando(null)} className="text-slate-300 hover:text-slate-900 text-2xl">✕</button>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl">
                      <span className="font-black uppercase text-xs">Estado de Alquiler</span>
                      <button 
                        type="button"
                        onClick={() => setEditando({...editando, alquilado: !editando.alquilado})}
                        className={`px-6 py-2 rounded-xl font-black uppercase text-[10px] transition-all ${editando.alquilado ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-500'}`}
                      >
                        {editando.alquilado ? 'Alquilado' : 'Libre'}
                      </button>
                    </div>

                    {editando.alquilado && (
                      <>
                        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-black uppercase text-[10px] text-indigo-600 tracking-widest">Aportación Mensual ({meses[mesActual-1]})</span>
                            <button 
                              type="button"
                              onClick={() => {
                                const yaPagado = editando.ultimoPagoMesAnio === mesAnioKey;
                                setEditando({...editando, ultimoPagoMesAnio: yaPagado ? '' : mesAnioKey});
                              }}
                              className={`px-4 py-2 rounded-xl font-black uppercase text-[9px] transition-all ${editando.ultimoPagoMesAnio === mesAnioKey ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white animate-pulse'}`}
                            >
                              {editando.ultimoPagoMesAnio === mesAnioKey ? '✅ PAGADA' : '❌ PENDIENTE'}
                            </button>
                          </div>
                          <p className="text-[8px] font-medium text-indigo-400 leading-tight">
                            * Al guardar como "PAGADA", se actualizará automáticamente el estado de todos los socios vinculados a este local para este mes.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Nombre del Grupo</label>
                          <input type="text" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 font-bold" value={editando.nombreGrupo || ''} onChange={e => setEditando({...editando, nombreGrupo: e.target.value})} required />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Actividad Artística</label>
                          <input type="text" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 font-bold" value={editando.actividadArtistica || ''} onChange={e => setEditando({...editando, actividadArtistica: e.target.value})} required />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Fecha Expiración Alquiler</label>
                          <div className="flex gap-2">
                            <input type="date" className="flex-1 p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 font-bold" value={editando.fechaExpiracion || ''} onChange={e => setEditando({...editando, fechaExpiracion: e.target.value})} required />
                            <button 
                              type="button"
                              onClick={() => setEditando({...editando, fechaExpiracion: '2099-12-31'})}
                              className="bg-slate-900 text-white px-4 rounded-2xl font-black uppercase text-[9px]"
                            >Indefinida</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-black uppercase text-xs text-slate-400">Inquilinos / Soci@s de Local</h3>
                      {editando.alquilado && (
                        <button type="button" onClick={addInquilino} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black uppercase text-[9px] hover:bg-indigo-700">+ Añadir</button>
                      )}
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {editando.inquilinos?.map((inq: any, idx: number) => (
                        <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-3 relative group">
                          <button type="button" onClick={() => removeInquilino(idx)} className="absolute top-4 right-4 text-red-300 hover:text-red-500 text-lg opacity-0 group-hover:opacity-100 transition-all">✕</button>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <input type="text" placeholder="DNI" className="p-3 bg-white rounded-xl text-[10px] font-black uppercase outline-none border border-slate-100" value={inq.dni} onChange={e => updateInquilino(idx, 'dni', e.target.value)} required />
                            <input type="text" placeholder="NOMBRE COMPLETO" className="p-3 bg-white rounded-xl text-[10px] font-bold outline-none border border-slate-100" value={inq.nombre} onChange={e => updateInquilino(idx, 'nombre', e.target.value)} required />
                          </div>
                          <input type="text" placeholder="DIRECCIÓN" className="w-full p-3 bg-white rounded-xl text-[10px] font-bold outline-none border border-slate-100" value={inq.direccion} onChange={e => updateInquilino(idx, 'direccion', e.target.value)} />
                          <input type="email" placeholder="EMAIL" className="w-full p-3 bg-white rounded-xl text-[10px] font-bold outline-none border border-slate-100" value={inq.email} onChange={e => updateInquilino(idx, 'email', e.target.value)} />
                          <input type="text" placeholder="CUENTA BANCARIA (IBAN)" className="w-full p-3 bg-white rounded-xl text-[10px] font-mono outline-none border border-slate-100" value={inq.cuentaBancaria} onChange={e => updateInquilino(idx, 'cuentaBancaria', e.target.value)} />
                        </div>
                      ))}
                      {(!editando.inquilinos || editando.inquilinos.length === 0) && (
                        <p className="text-center py-10 text-slate-300 font-bold uppercase text-[10px] tracking-widest italic">No hay inquilinos registrados</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-6">
                  <button type="submit" className="flex-1 bg-slate-900 text-white p-6 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl hover:bg-indigo-600 transition-all">Guardar Cambios</button>
                  <button type="button" onClick={() => setEditando(null)} className="px-10 bg-slate-100 text-slate-400 rounded-[2rem] font-black uppercase tracking-widest hover:text-slate-900 transition-all">Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLocales;
