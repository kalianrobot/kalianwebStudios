import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { collection, query, where, getDocs, doc, updateDoc, DocumentData, getDoc, deleteDoc, increment } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

const PerfilSocio = () => {
  const [reservasActivas, setReservasActivas] = useState<DocumentData[]>([]);
  const [historialReservas, setHistorialReservas] = useState<DocumentData[]>([]);
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

          let todasLasReservas: any[] = snapResUid.docs.map(d => ({ id: d.id, ...d.data() }));

          // Fallback por DNI
          if (sData.dni) {
            const qResDni = query(collection(db, "reservas"), where("dniTitular", "==", sData.dni));
            const snapResDni = await getDocs(qResDni);
            snapResDni.docs.forEach(d => {
              if (!todasLasReservas.some(r => r.id === d.id)) {
                todasLasReservas.push({ id: d.id, ...d.data() });
              }
            });
          }

          // Verificar si el evento existe y separar activas de historial
          const promVerificar = todasLasReservas.map(async (r) => {
            const evSnap = await getDoc(doc(db, r.esCurso ? "cursos" : "eventos", r.eventoId));
            if (!evSnap.exists()) return null; // BDD: Si el evento se borra, la reserva desaparece
            
            const fechaAct = r.fechaActividad || r.fechaReserva?.split('T')[0];
            return { 
              ...r, 
              titulo: r.eventoTitulo,
              tipo: r.esCurso ? 'CURSO' : 'EVENTO',
              fechaActividad: fechaAct,
              activa: fechaAct >= hoy
            };
          });

          const verificadas = (await Promise.all(promVerificar)).filter(r => r !== null);
          setReservasActivas(verificadas.filter(r => r.activa));
          setHistorialReservas(verificadas.filter(r => !r.activa));
        }
      } catch (err) {
        console.error("Error cargando perfil:", err);
      } finally {
        setCargando(false);
      }
    };
    cargarDatos();
  }, [navigate]);

  const cancelarReserva = async (reserva: any) => {
    if (!window.confirm("¿Seguro que quieres cancelar esta reserva?")) return;
    
    try {
      const esCurso = reserva.esCurso;
      const coleccionActividad = esCurso ? "cursos" : "eventos";
      const docRef = doc(db, coleccionActividad, reserva.eventoId);
      
      // Restar aforo
      const numPlazas = 1 + (reserva.acompañantes || 0);
      await updateDoc(docRef, {
        aforo_actual: increment(-numPlazas)
      });

      // Borrar reserva
      await deleteDoc(doc(db, "reservas", reserva.id));
      
      setReservasActivas(prev => prev.filter(r => r.id !== reserva.id));
      alert("✅ Reserva cancelada con éxito");
    } catch (err) {
      console.error(err);
      alert("Error al cancelar");
    }
  };
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

      setReservasActivas(prev => prev.map(r => r.id === reserva.id ? { ...r, acompañantes: nuevoNum } : r));
    } catch (err) {
      console.error("Error al actualizar:", err);
      alert("No se pudo actualizar el número de acompañantes.");
    }
  };

  if (cargando) return (
    <div className="min-h-screen bg-kalian-dark flex items-center justify-center">
      <div className="text-kalian-gold kalian-poster-text text-4xl animate-pulse">Cargando Panel...</div>
    </div>
  );

  if (!usuario && !cargando) {
    return (
      <div className="min-h-screen bg-kalian-dark flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-4xl mb-6 border border-red-500/20 shadow-2xl shadow-red-500/10">🚫</div>
        <h2 className="text-4xl kalian-poster-text text-kalian-cream mb-4">Acceso Restringido</h2>
        <p className="text-kalian-cream/50 font-bold max-w-md text-sm uppercase tracking-widest leading-relaxed">Lo sentimos, este panel es exclusivo para socios registrados con DNI. Si crees que esto es un error, contacta con administración.</p>
        <button 
          onClick={() => navigate('/')} 
          className="mt-12 bg-kalian-gold text-black px-10 py-4 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20"
        >
          Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <header className="max-w-6xl mx-auto mb-20 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
        <div>
          <h1 className="text-6xl md:text-8xl kalian-poster-text text-kalian-gold tracking-[-0.05em]">MI PANEL <span className="text-kalian-cream">KALIAN</span></h1>
          {usuario && (
            <div className="mt-6 space-y-3">
              <p className="font-black text-kalian-gold/40 uppercase tracking-[0.4em] text-[10px]">Socio: {usuario.nombre} • {usuario.dni}</p>
              {usuario.cursos && usuario.cursos.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {usuario.cursos.map((cId: string) => (
                    <span key={cId} className="bg-kalian-gold/10 text-kalian-gold px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-kalian-gold/20">Curso: {cId}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <button 
          onClick={() => auth.signOut().then(() => navigate('/'))}
          className="text-[10px] font-black uppercase text-kalian-gold/40 hover:text-kalian-gold transition-colors tracking-[0.3em] border-b border-transparent hover:border-kalian-gold/40 pb-1"
        >
          Cerrar Sesión
        </button>
      </header>

      <main className="max-w-6xl mx-auto space-y-24">
        {/* SECCIÓN CURSOS Y LOCALES */}
        {(cursosDetalle.length > 0 || localDetalle) && (
          <section className="space-y-12">
            <div className="flex items-center gap-6">
              <h2 className="text-3xl kalian-poster-text text-kalian-gold">MIS <span className="text-kalian-cream">CURSOS Y LOCALES</span></h2>
              <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {cursosDetalle.map(c => (
                <div key={c.id} className="bg-black/40 border border-kalian-gold/10 rounded-3xl p-8 flex items-center gap-8 hover:border-kalian-gold/30 transition-all">
                  <div className="w-20 h-20 bg-kalian-gold/10 border border-kalian-gold/20 rounded-2xl flex items-center justify-center text-4xl">
                    {c.categoria === 'danza' ? '💃' : '🎸'}
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-kalian-gold uppercase tracking-[0.3em] mb-2">Curso Activo</p>
                    <h3 className="text-3xl kalian-poster-text text-kalian-cream">{c.titulo}</h3>
                    <p className="text-xs font-bold text-kalian-cream/40 mt-2 tracking-widest uppercase">{c.horario}</p>
                    
                    {/* DOCUMENTOS DEL CURSO */}
                    {c.documentos && c.documentos.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-kalian-gold/10 space-y-3">
                        <p className="text-[8px] font-black text-kalian-gold/40 uppercase tracking-widest">Material del Curso</p>
                        <div className="flex flex-wrap gap-2">
                          {c.documentos.map((doc: any, idx: number) => (
                            <a 
                              key={idx} 
                              href={doc.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="bg-kalian-gold/5 hover:bg-kalian-gold/20 border border-kalian-gold/10 px-3 py-2 rounded-lg flex items-center gap-2 transition-all group"
                            >
                              <span className="text-sm">📄</span>
                              <span className="text-[9px] font-bold uppercase tracking-tighter text-kalian-cream/60 group-hover:text-kalian-gold">{doc.nombre}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {localDetalle && (
                <div className="bg-black/40 border border-kalian-gold/10 rounded-3xl p-8 flex items-center gap-8 hover:border-kalian-gold/30 transition-all">
                  <div className="w-20 h-20 bg-kalian-gold/10 border border-kalian-gold/20 rounded-2xl flex items-center justify-center text-4xl">🏠</div>
                  <div>
                    <p className="text-[9px] font-black text-kalian-gold uppercase tracking-[0.3em] mb-2">Alquiler de Local</p>
                    <h3 className="text-3xl kalian-poster-text text-kalian-cream">{localDetalle.nombre}</h3>
                    <p className="text-xs font-bold text-kalian-cream/40 mt-2 tracking-widest uppercase">Grupo: {localDetalle.nombreGrupo}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* SECCIÓN RESERVAS EVENTOS */}
        <section className="space-y-12">
          <div className="flex items-center gap-6">
            <h2 className="text-3xl kalian-poster-text text-kalian-gold">MIS <span className="text-kalian-cream">RESERVAS</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {reservasActivas.length === 0 && cursosDetalle.length === 0 && !localDetalle ? (
              <div className="col-span-full bg-black/20 p-20 rounded-[3rem] text-center border border-kalian-gold/10 border-dashed">
                <p className="kalian-poster-text text-kalian-gold/30 text-4xl">No tienes actividades<br/>inscritas todavía</p>
              </div>
            ) : reservasActivas.map(res => (
          <div key={res.id} className="bg-kalian-cream rounded-[3rem] p-10 text-black shadow-2xl flex flex-col items-center transform hover:scale-[1.02] transition-all duration-500 group relative">
            <div className="absolute top-0 left-0 w-full h-4 bg-kalian-gold rounded-t-[3rem] opacity-20"></div>
            
            <span className="bg-black text-kalian-gold px-5 py-1.5 rounded-full text-[10px] font-black uppercase mb-6 tracking-widest">
              {res.tipo} • {res.fechaActividad}
            </span>
            
            <h3 className="text-3xl kalian-poster-text uppercase leading-none text-center mb-8 h-16 flex items-center">{res.titulo}</h3>
            
            <div className="bg-white p-8 rounded-[2.5rem] mb-8 shadow-inner border border-black/5 flex flex-col items-center group-hover:shadow-2xl transition-all">
              <QRCodeSVG 
                value={res.id} 
                size={140} 
                level="H" 
                includeMargin={true}
                className="mix-blend-multiply"
              />
              <p className="text-center font-mono text-[9px] mt-6 text-black/30 font-bold tracking-[0.3em]">{res.id}</p>
            </div>

            <div className="w-full bg-black/5 p-6 rounded-3xl flex justify-between items-center border border-black/5">
              <div>
                <p className="text-[9px] font-black text-black/40 uppercase tracking-widest">Acompañantes</p>
                <p className="text-3xl kalian-poster-text mt-1">{res.acompañantes}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => actualizarAcompañantes(res, res.acompañantes - 1)}
                  className="w-12 h-12 bg-white border border-black/10 rounded-2xl kalian-poster-text text-2xl hover:bg-black hover:text-kalian-gold transition-all shadow-sm">-</button>
                <button 
                  onClick={() => actualizarAcompañantes(res, res.acompañantes + 1)}
                  className="w-12 h-12 bg-white border border-black/10 rounded-2xl kalian-poster-text text-2xl hover:bg-black hover:text-kalian-gold transition-all shadow-sm">+</button>
              </div>
            </div>
            
            <button 
              onClick={() => cancelarReserva(res)}
              className="mt-6 text-[9px] font-black uppercase text-red-500/40 hover:text-red-500 transition-colors tracking-widest"
            >
              Cancelar Reserva
            </button>
          </div>
        ))}
          </div>
        </section>

        {/* SECCIÓN HISTORIAL */}
        {historialReservas.length > 0 && (
          <section className="space-y-12">
            <div className="flex items-center gap-6">
              <h2 className="text-3xl kalian-poster-text text-kalian-gold/40">HISTORIAL <span className="text-kalian-cream/40">PASADO</span></h2>
              <div className="h-[1px] flex-1 bg-kalian-gold/10"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 opacity-60 grayscale">
              {historialReservas.map(res => (
                <div key={res.id} className="bg-black/20 border border-kalian-gold/10 rounded-3xl p-6">
                  <p className="text-[8px] font-black text-kalian-gold/40 uppercase mb-2">{res.fechaActividad}</p>
                  <h3 className="text-xl kalian-poster-text text-kalian-cream uppercase leading-none">{res.titulo}</h3>
                  <p className="text-[8px] font-bold text-kalian-gold/20 mt-2 uppercase">Ticket: {res.id}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default PerfilSocio;
