import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { collection, query, where, getDocs, doc, updateDoc, DocumentData, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const PerfilSocio = () => {
  const [reservas, setReservas] = useState<DocumentData[]>([]);
  const [cursosDetalle, setCursosDetalle] = useState<DocumentData[]>([]);
  const [localDetalle, setLocalDetalle] = useState<DocumentData | null>(null);
  const [usuario, setUsuario] = useState<DocumentData | null>(null);
  const [cargando, setCargando] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const cargarDatos = async () => {
      if (!auth.currentUser) {
        navigate('/login');
        return;
      }
      
      try {
        const qSocio = query(collection(db, "socios"), where("uid", "==", auth.currentUser.uid));
        const snapSocio = await getDocs(qSocio);
        let sData = null;

        if (!snapSocio.empty) {
          sData = snapSocio.docs[0].data();
        } else if (auth.currentUser.email) {
          // Fallback por email para vincular socios creados por admin
          const qEmail = query(collection(db, "socios"), where("email", "==", auth.currentUser.email));
          const snapEmail = await getDocs(qEmail);
          if (!snapEmail.empty) {
            sData = snapEmail.docs[0].data();
            await updateDoc(snapEmail.docs[0].ref, { uid: auth.currentUser.uid });
          }
        }

        if (sData) {
          setUsuario(sData);
          // Cargar cursos detallados
          if (sData.cursos && sData.cursos.length > 0) {
            const cursosProm = sData.cursos.map(async (cId: string) => {
              const cSnap = await getDoc(doc(db, "cursos", cId));
              return cSnap.exists() ? { id: cSnap.id, ...cSnap.data() } : null;
            });
            const cursosRes = await Promise.all(cursosProm);
            const hoy = new Date().toISOString().split('T')[0];
            setCursosDetalle(cursosRes.filter(c => c !== null && (c.fechaFin >= hoy)));
          }

          // Cargar local detallado
          if (sData.localId) {
            const lSnap = await getDoc(doc(db, "locales", sData.localId));
            if (lSnap.exists()) setLocalDetalle({ id: lSnap.id, ...lSnap.data() });
          }

          // CARGAR RESERVAS (UID + Email + DNI fallback)
          const qResUid = query(collection(db, "reservas"), where("uidTitular", "==", auth.currentUser.uid));
          const snapResUid = await getDocs(qResUid);
          const hoy = new Date().toISOString().split('T')[0];

          let listaReservas = snapResUid.docs.map(d => ({ 
            id: d.id, 
            titulo: d.data().eventoTitulo,
            tipo: d.data().esCurso ? 'CURSO' : 'EVENTO',
            fechaActividad: d.data().fechaActividad || d.data().fechaReserva?.split('T')[0],
            ...d.data() 
          })).filter(r => r.fechaActividad >= hoy);

          // Fallback por DNI (lo más seguro para socios)
          if (sData.dni) {
            const qResDni = query(collection(db, "reservas"), where("dniTitular", "==", sData.dni));
            const snapResDni = await getDocs(qResDni);
            snapResDni.docs.forEach(d => {
              const rData = d.data();
              const fechaAct = rData.fechaActividad || rData.fechaReserva?.split('T')[0];
              if (fechaAct >= hoy && !listaReservas.some(r => r.id === d.id)) {
                listaReservas.push({ 
                  id: d.id, 
                  titulo: rData.eventoTitulo,
                  tipo: rData.esCurso ? 'CURSO' : 'EVENTO',
                  fechaActividad: fechaAct,
                  ...rData 
                });
              }
            });
          }

          if (auth.currentUser.email) {
            const qResEmail = query(collection(db, "reservas"), where("emailTitular", "==", auth.currentUser.email));
            const snapResEmail = await getDocs(qResEmail);
            
            for (const d of snapResEmail.docs) {
              const data = d.data();
              const fechaAct = data.fechaActividad || data.fechaReserva?.split('T')[0];
              if (fechaAct >= hoy) {
                if (data.uidTitular !== auth.currentUser.uid) {
                  await updateDoc(d.ref, { uidTitular: auth.currentUser.uid });
                }
                if (!listaReservas.some(r => r.id === d.id)) {
                  listaReservas.push({ 
                    id: d.id, 
                    titulo: data.eventoTitulo,
                    tipo: data.esCurso ? 'CURSO' : 'EVENTO',
                    fechaActividad: fechaAct,
                    ...data 
                  });
                }
              }
            }
          }
          setReservas(listaReservas);
        }
      } catch (err) {
        console.error("Error cargando perfil:", err);
      } finally {
        setCargando(false);
      }
    };
    cargarDatos();
  }, [navigate]);

  const actualizarAcompañantes = async (reserva: any, nuevoNum: number) => {
    if (nuevoNum < 0) return;
    
    try {
      const esCurso = reserva.esCurso;
      const coleccionActividad = esCurso ? "cursos" : "eventos";
      const docRef = doc(db, coleccionActividad, reserva.eventoId);
      const snapDoc = await getDoc(docRef);
      
      if (!snapDoc.exists()) {
        alert("No se encontró la actividad.");
        return;
      }

      const dataActividad = snapDoc.data();
      const aforoMax = esCurso ? dataActividad.aforo_total : dataActividad.aforo_max;

      // Calcular ocupación actual (excluyendo la reserva actual para recalcular)
      const qRes = query(collection(db, "reservas"), where("eventoId", "==", reserva.eventoId));
      const snapRes = await getDocs(qRes);
      
      let ocupacionSinMi = 0;
      snapRes.docs.forEach(d => {
        if (d.id !== reserva.id) {
          const rData = d.data();
          // Cada reserva cuenta como 1 titular + acompañantes
          ocupacionSinMi += (1 + (rData.acompañantes || 0));
        }
      });

      const nuevaOcupacionTotal = ocupacionSinMi + 1 + nuevoNum;

      if (nuevaOcupacionTotal > aforoMax) {
        alert(`❌ No hay aforo suficiente. Capacidad máxima: ${aforoMax}. Espacio disponible: ${aforoMax - (ocupacionSinMi + 1)}`);
        return;
      }

      // Actualizar la reserva
      await updateDoc(doc(db, "reservas", reserva.id), {
        acompañantes: nuevoNum
      });

      // También actualizar aforo_actual en el evento/curso (opcional pero recomendado para consistencia)
      await updateDoc(docRef, {
        aforo_actual: ocupacionSinMi + 1 + nuevoNum
      });

      setReservas(prev => prev.map(r => r.id === reserva.id ? { ...r, acompañantes: nuevoNum } : r));
    } catch (err) {
      console.error("Error al actualizar:", err);
      alert("No se pudo actualizar el número de acompañantes.");
    }
  };

  if (cargando) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-white font-black italic uppercase animate-pulse">Cargando Panel...</div>
    </div>
  );

  if (!usuario && !cargando) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-4xl mb-6">🚫</div>
        <h2 className="text-3xl font-black uppercase italic text-white mb-4">Acceso Restringido</h2>
        <p className="text-slate-400 font-bold max-w-md">Lo sentimos, este panel es exclusivo para socios registrados con DNI. Si crees que esto es un error, contacta con administración.</p>
        <button 
          onClick={() => navigate('/')} 
          className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg"
        >
          Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6 md:p-12 text-slate-100 font-sans">
      <header className="max-w-6xl mx-auto mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-5xl font-black italic uppercase leading-none">Mi Panel<br/><span className="text-indigo-500">Kalian</span></h1>
          {usuario && (
            <div className="mt-4 space-y-2">
              <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Socio: {usuario.nombre} • {usuario.dni}</p>
              {usuario.cursos && usuario.cursos.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {usuario.cursos.map((cId: string) => (
                    <span key={cId} className="bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-indigo-500/30">Curso: {cId}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <button 
          onClick={() => auth.signOut().then(() => navigate('/'))}
          className="text-[10px] font-black uppercase text-slate-500 hover:text-white transition-colors"
        >
          Cerrar Sesión
        </button>
      </header>

      <main className="max-w-6xl mx-auto space-y-16">
        {/* SECCIÓN CURSOS Y LOCALES */}
        {(cursosDetalle.length > 0 || localDetalle) && (
          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-black italic uppercase tracking-tighter">Mis <span className="text-emerald-500">Cursos y Locales</span></h2>
              <div className="h-[2px] flex-1 bg-white/10"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {cursosDetalle.map(c => (
                <div key={c.id} className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] p-8 flex items-center gap-6">
                  <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-3xl">
                    {c.categoria === 'danza' ? '💃' : '🎸'}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Curso Activo</p>
                    <h3 className="text-2xl font-black uppercase italic">{c.titulo}</h3>
                    <p className="text-sm font-bold text-slate-400 mt-1">{c.horario}</p>
                  </div>
                </div>
              ))}
              {localDetalle && (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-[2.5rem] p-8 flex items-center gap-6">
                  <div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center text-3xl">🏠</div>
                  <div>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Alquiler de Local</p>
                    <h3 className="text-2xl font-black uppercase italic">{localDetalle.nombre}</h3>
                    <p className="text-sm font-bold text-slate-400 mt-1">Grupo: {localDetalle.nombreGrupo}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* SECCIÓN RESERVAS EVENTOS */}
        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">Mis <span className="text-indigo-500">Reservas</span></h2>
            <div className="h-[2px] flex-1 bg-white/10"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {reservas.length === 0 && cursosDetalle.length === 0 && !localDetalle ? (
              <div className="col-span-full bg-slate-800/50 p-16 rounded-[3rem] text-center border-2 border-dashed border-slate-700">
                <p className="italic text-slate-500 font-bold uppercase tracking-tighter text-2xl">No tienes actividades<br/>inscritas todavía</p>
              </div>
            ) : reservas.map(res => (
          <div key={res.id} className="bg-white rounded-[3rem] p-8 text-slate-900 shadow-2xl flex flex-col items-center transform hover:scale-[1.02] transition-transform">
            <span className="bg-indigo-100 text-indigo-600 px-4 py-1 rounded-full text-[10px] font-black uppercase mb-4 tracking-tighter">
              {res.tipo} • {res.fechaActividad}
            </span>
            
            <h3 className="text-xl font-black uppercase leading-tight text-center mb-6 h-12 flex items-center">{res.titulo}</h3>
            
            <div className="bg-slate-50 p-6 rounded-[2.5rem] mb-6 shadow-inner border border-slate-100">
              <img src={res.qrUrl} alt="Ticket QR" className="w-32 h-32 mix-blend-multiply" />
              <p className="text-center font-mono text-[9px] mt-4 text-slate-400 font-bold tracking-widest">{res.ticketID}</p>
            </div>

            <div className="w-full bg-slate-50 p-4 rounded-2xl flex justify-between items-center border border-slate-100">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Acompañantes</p>
                <p className="text-2xl font-black italic">{res.acompañantes}</p>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={() => actualizarAcompañantes(res, res.acompañantes - 1)}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-xl font-black hover:bg-slate-900 hover:text-white transition-all shadow-sm">-</button>
                <button 
                  onClick={() => actualizarAcompañantes(res, res.acompañantes + 1)}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-xl font-black hover:bg-slate-900 hover:text-white transition-all shadow-sm">+</button>
              </div>
            </div>
            <p className="text-[8px] text-slate-400 mt-3 uppercase font-black tracking-widest italic">Gestiona tus acompañantes según aforo</p>
          </div>
        ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default PerfilSocio;
