import React, { useEffect, useState } from 'react';
import { auth, db } from '../../firebase';
import { collection, query, where, getDocs, doc, updateDoc, DocumentData, getDoc, deleteDoc, increment } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from '../../context/LanguageContext';

const PerfilSocio = () => {
  const { t, tField } = useLanguage();
  const [reservasActivas, setReservasActivas] = useState<DocumentData[]>([]);
  const [historialReservas, setHistorialReservas] = useState<DocumentData[]>([]);
  const [cursosDetalle, setCursosDetalle] = useState<DocumentData[]>([]);
  const [localDetalle, setLocalDetalle] = useState<DocumentData | null>(null);
  const [usuario, setUsuario] = useState<DocumentData | null>(null);
  const [cargando, setCargando] = useState(true);
  const navigate = useNavigate();
  const [membresiasAMostrar, setMembresiasAMostrar] = useState<{cat: string, fecha: string}[]>([]);

  const [pagoMensual, setPagoMensual] = useState<any>(null);

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
        let socioRef = null;

        if (!snapSocio.empty) {
          sData = snapSocio.docs[0].data();
          socioRef = snapSocio.docs[0].ref;
        } else if (auth.currentUser.email) {
          const qEmail = query(collection(db, "socios"), where("email", "==", auth.currentUser.email));
          const snapEmail = await getDocs(qEmail);
          if (!snapEmail.empty) {
            sData = snapEmail.docs[0].data();
            socioRef = snapEmail.docs[0].ref;
            await updateDoc(socioRef, { uid: auth.currentUser.uid });
          }
        }

        if (sData) {
          setUsuario(sData);
          
          // Cargar pago mensual
          const mesActual = new Date().getMonth() + 1;
          const anioActual = new Date().getFullYear();
          const pagoId = `${anioActual}_${mesActual}_${sData.dni}`;
          const pagoSnap = await getDoc(doc(db, "pagos_mensuales", pagoId));
          if (pagoSnap.exists()) {
            setPagoMensual(pagoSnap.data());
          }

          let cursosRes: any[] = [];
          // Cargar cursos detallados
          if (sData.cursos && sData.cursos.length > 0) {
            const cursosProm = sData.cursos.map(async (cId: string) => {
              const cSnap = await getDoc(doc(db, "cursos", cId));
              return cSnap.exists() ? { id: cSnap.id, ...cSnap.data() } : null;
            });
            cursosRes = await Promise.all(cursosProm);
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
            
            const evData = evSnap.data();
            const fechaAct = r.fechaActividad || evData.fecha || evData.fechaFin || r.fechaReserva?.split('T')[0];
            
            return {
              ...r,
              titulo: r.eventoTitulo,
              tituloEvento: tField(evData, 'titulo') || r.eventoTitulo,
              tipo: r.esCurso ? t('profile.tipoCurso') : t('profile.tipoEvento'),
              fechaActividad: fechaAct,
              activa: new Date(fechaAct) >= new Date(),
              max_acompanantes: evData.max_acompanantes || 4
            };
          });

          const verificadas = (await Promise.all(promVerificar)).filter(r => r !== null);
          setReservasActivas(verificadas.filter(r => r.activa));
          setHistorialReservas(verificadas.filter(r => !r.activa));

          // --- LÓGICA DE MEMBRESÍAS ROBUSTA ---
          const m: Record<string, string> = { ...(sData.membresias || {}) };
          let huboCambios = false;

          // Sincronizar desde cursos activos
          cursosRes.forEach(c => {
            if (c && c.categoria && c.fechaFin) {
              if (!m[c.categoria] || m[c.categoria] < c.fechaFin) {
                m[c.categoria] = c.fechaFin;
                huboCambios = true;
              }
            }
          });

          // Sincronizar desde local
          if (sData.localId) {
            const lSnap = await getDoc(doc(db, "locales", sData.localId));
            if (lSnap.exists()) {
              const lData = lSnap.data();
              if (lData.fechaExpiracion) {
                if (!m['local'] || m['local'] < lData.fechaExpiracion) {
                  m['local'] = lData.fechaExpiracion;
                  huboCambios = true;
                }
              }
            }
          }

          // Si hubo cambios o faltaba el mapa, actualizamos en BDD para futuras sesiones
          if (huboCambios || !sData.membresias) {
            if (socioRef) {
              await updateDoc(socioRef, { 
                membresias: m,
                estado: Object.values(m).some(f => f >= hoy) ? 'activo' : 'inactivo'
              });
            }
          }

          // Filtrar las que vamos a mostrar (solo activas)
          const activas = Object.entries(m)
            .filter(([_, fecha]) => fecha >= hoy)
            .map(([cat, fecha]) => ({ cat, fecha }));
          
          setMembresiasAMostrar(activas);
        }
      } catch (err) {
        console.error("Error cargando perfil:", err);
      } finally {
        setCargando(false);
      }
    };
    cargarDatos();
  }, [navigate]);

  const getNombreCategoria = (cat: string) => {
    if (cat === 'musica') return t('profile.category.musica');
    if (cat === 'danza') return t('profile.category.danza');
    if (cat === 'local') return t('profile.category.local');
    return cat;
  };

  const puedeAñadirInvitados = (reserva: any) => {
    if (reserva.esCurso) return false;
    const fechaEvento = new Date(reserva.fechaActividad);
    const ahora = new Date();
    const diferenciaMs = fechaEvento.getTime() - ahora.getTime();
    const diferenciaHoras = diferenciaMs / (1000 * 60 * 60);
    return diferenciaHoras > 2;
  };

  const cancelarReserva = async (reserva: any) => {
    if (!window.confirm(t('profile.confirmCancel'))) return;
    
    try {
      const esCurso = reserva.esCurso;
      const coleccionActividad = esCurso ? "cursos" : "eventos";
      const docRef = doc(db, coleccionActividad, reserva.eventoId);
      
      // Restar solo lo que NO ha entrado todavía (aforo_reservado)
      const totalReserva = 1 + (reserva.acompañantes || 0);
      const yaIngresados = reserva.asistentes_ingresados || 0;
      const pendientes = Math.max(0, totalReserva - yaIngresados);
      
      if (pendientes > 0) {
        await updateDoc(docRef, {
          aforo_reservado: increment(-pendientes)
        });
      }

      // Borrar reserva
      await deleteDoc(doc(db, "reservas", reserva.id));
      
      setReservasActivas(prev => prev.filter(r => r.id !== reserva.id));
      alert(t('profile.cancelSuccess'));
    } catch (err) {
      console.error(err);
      alert(t('profile.cancelError'));
    }
  };
  const actualizarAcompañantes = async (reserva: any, nuevoNum: number) => {
    if (nuevoNum < 0) return;
    
    const esAumento = nuevoNum > (reserva.acompañantes || 0);
    
    if (esAumento && !puedeAñadirInvitados(reserva)) {
      alert(t('profile.guestsAfterEvent'));
      return;
    }

    const maxPermitidos = reserva.max_acompanantes || 4;
    if (nuevoNum > maxPermitidos) {
      alert(t('profile.maxGuests', { n: maxPermitidos }));
      return;
    }

    const yaIngresados = reserva.asistentes_ingresados || 0;
    const nuevoTotal = 1 + nuevoNum;
    if (nuevoTotal < yaIngresados) {
      alert(t('profile.cannotReduce', { n: yaIngresados }));
      return;
    }
    
    try {
      const esCurso = reserva.esCurso;
      const coleccionActividad = esCurso ? "cursos" : "eventos";
      const docRef = doc(db, coleccionActividad, reserva.eventoId);
      const snapDoc = await getDoc(docRef);
      
      if (!snapDoc.exists()) {
        alert(t('profile.activityNotFound'));
        return;
      }

      const dataActividad = snapDoc.data();
      const aforoMax = Number(dataActividad.aforo_maximo || dataActividad.aforo_max || dataActividad.aforo_total || 0);
      const aforoRes = Number(dataActividad.aforo_reservado || 0);

      const diferencia = nuevoNum - (reserva.acompañantes || 0);

      if (aforoRes + diferencia > aforoMax) {
        alert(t('profile.notEnoughCapacity', { max: aforoMax, avail: Math.max(0, aforoMax - aforoRes) }));
        return;
      }

      // Actualizar la reserva
      await updateDoc(doc(db, "reservas", reserva.id), {
        acompañantes: nuevoNum
      });

      // Actualizar aforo_reservado en el evento/curso
      await updateDoc(docRef, {
        aforo_reservado: increment(diferencia)
      });

      setReservasActivas(prev => prev.map(r => r.id === reserva.id ? { ...r, acompañantes: nuevoNum } : r));
    } catch (err) {
      console.error("Error al actualizar:", err);
      alert(t('profile.updateError'));
    }
  };

  if (cargando) return (
    <div className="min-h-screen bg-kalian-dark flex items-center justify-center">
      <div className="text-kalian-gold kalian-poster-text text-4xl animate-pulse">{t('profile.loading')}</div>
    </div>
  );

  if (!usuario && !cargando) {
    return (
      <div className="min-h-screen bg-kalian-dark flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-4xl mb-6 border border-red-500/20 shadow-2xl shadow-red-500/10">🚫</div>
        <h2 className="text-4xl kalian-poster-text text-kalian-cream mb-4">{t('profile.restrictedAccess')}</h2>
        <p className="text-kalian-cream/50 font-bold max-w-md text-sm uppercase tracking-widest leading-relaxed">{t('profile.restrictedAccessText')}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-12 bg-kalian-gold text-black px-10 py-4 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20"
        >
          {t('profile.backHome')}
        </button>
      </div>
    );
  }

  const calcularAportacionSugerida = () => {
    if (!usuario) return 15;
    const cursos = usuario.cursos || [];
    const tieneSalsa = cursos.some((cId: string) => cId.toLowerCase().includes('salsa'));
    const tieneBachata = cursos.some((cId: string) => cId.toLowerCase().includes('bachata') && !cId.toLowerCase().includes('coreográfico'));

    if (tieneSalsa && tieneBachata) {
      return 40; // 25€ especial + 15€ cuota
    }
    return 15;
  };

  const mesActualStr = t(`month.${new Date().getMonth() + 1}`);

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <header className="max-w-6xl mx-auto mb-20 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
        <div>
          <h1 className="text-6xl md:text-8xl kalian-poster-text text-kalian-gold tracking-[-0.05em]">{t('profile.title')} <span className="text-kalian-cream">{t('profile.titleHighlight')}</span></h1>
          {usuario && (
            <div className="mt-6 space-y-3">
              <p className="font-black text-kalian-gold/40 uppercase tracking-[0.4em] text-[10px]">{t('profile.memberLabel')} {usuario.nombre} • {usuario.dni}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => auth.signOut().then(() => navigate('/'))}
          className="text-[10px] font-black uppercase text-kalian-gold/40 hover:text-kalian-gold transition-colors tracking-[0.3em] border-b border-transparent hover:border-kalian-gold/40 pb-1"
        >
          {t('profile.logout')}
        </button>
      </header>

      <main className="max-w-6xl mx-auto space-y-24">
        {/* CARNET DIGITAL ESTÁTICO */}
        <section className="flex flex-col lg:flex-row gap-12 items-center bg-black/40 border border-kalian-gold/20 rounded-[4rem] p-10 md:p-16 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-kalian-gold/5 rounded-full blur-3xl -mr-32 -mt-32 group-hover:bg-kalian-gold/10 transition-all duration-1000"></div>
          
          <div className="relative z-10 flex-shrink-0 bg-white p-8 rounded-[3rem] shadow-2xl shadow-kalian-gold/10 transform group-hover:rotate-1 transition-transform duration-500">
            <QRCodeSVG 
              value={usuario?.uid || 'anon'} 
              size={200} 
              level="H" 
              includeMargin={true}
              className="mix-blend-multiply"
            />
            <div className="mt-6 flex flex-col items-center">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${usuario?.estado === 'activo' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40">{t('profile.cardDigital')}</p>
              </div>
              <p className="font-mono text-[9px] text-black/20 font-bold uppercase tracking-widest">ID: {usuario?.uid?.substring(0, 12)}</p>
            </div>
          </div>

          <div className="relative z-10 flex-grow space-y-8 text-center lg:text-left">
            <div>
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
                <span className="text-kalian-gold font-black text-[10px] uppercase tracking-[0.5em]">{t('profile.memberCard')}</span>
                <span className={`inline-block px-4 py-1 rounded-full text-[8px] font-black uppercase tracking-widest w-fit mx-auto lg:mx-0 ${usuario?.estado === 'activo' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' : 'bg-red-500/20 text-red-500 border border-red-500/30'}`}>
                  {usuario?.estado === 'activo' ? t('profile.activeMember') : t('profile.inactiveMember')}
                </span>
              </div>
              <h2 className="text-5xl md:text-7xl kalian-poster-text text-kalian-cream leading-none uppercase italic">{usuario?.nombre}</h2>
              
              <div className="mt-8 space-y-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex flex-col">
                    <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] mb-2">{t('profile.activeMemberships')}</p>
                    <div className="flex flex-wrap justify-center lg:justify-start gap-4">
                      {membresiasAMostrar.length > 0 ? (
                        membresiasAMostrar.map(({cat, fecha}) => (
                          <div key={cat} className="flex flex-col bg-kalian-gold/10 border border-kalian-gold/20 px-6 py-3 rounded-2xl group/item hover:bg-kalian-gold/20 transition-colors">
                            <span className="text-kalian-gold text-[10px] font-black uppercase tracking-widest">{getNombreCategoria(cat)}</span>
                            <span className="text-kalian-cream/40 text-[8px] font-bold uppercase tracking-tighter">{t('profile.validUntil')} {fecha}</span>
                          </div>
                        ))
                      ) : (
                        <div className="bg-red-500/10 border border-red-500/20 px-6 py-3 rounded-2xl">
                          <span className="text-red-500/60 text-[10px] font-black uppercase tracking-widest italic">{t('profile.noMemberships')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col lg:ml-8">
                    <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] mb-2">{t('profile.monthlyContribution')} {mesActualStr}:</p>
                    <div className={`flex flex-col px-6 py-3 rounded-2xl border ${pagoMensual?.pagado ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${pagoMensual?.pagado ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {pagoMensual?.pagado ? t('profile.paid') : t('profile.pending')}
                      </span>
                      <span className="text-kalian-cream/40 text-[8px] font-bold uppercase tracking-tighter">
                        {pagoMensual?.pagado ? `${t('profile.amountLabel')} ${pagoMensual.monto}€/mes` : `${t('profile.suggestedLabel')} ${calcularAportacionSugerida()}€/mes`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-kalian-cream/40 text-sm font-bold leading-relaxed max-w-xl mx-auto lg:mx-0 uppercase tracking-widest">
              {t('profile.cardDescription')}
            </p>
          </div>
        </section>

        {/* SECCIÓN CURSOS Y KALIAN HUB */}
        {(cursosDetalle.length > 0 || localDetalle) && (
          <section className="space-y-12">
            <div className="flex items-center gap-6">
              <h2 className="text-3xl kalian-poster-text text-kalian-gold">{t('profile.myCoursesAndHubTitle')} <span className="text-kalian-cream">{t('profile.myCoursesAndHubHighlight')}</span></h2>
              <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {cursosDetalle.map(c => (
                <div key={c.id} className="bg-black/40 border border-kalian-gold/10 rounded-3xl p-8 flex items-center gap-8 hover:border-kalian-gold/30 transition-all">
                  <div className="w-20 h-20 bg-kalian-gold/10 border border-kalian-gold/20 rounded-2xl flex items-center justify-center text-4xl">
                    {c.categoria === 'danza' ? '💃' : '🎸'}
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-kalian-gold uppercase tracking-[0.3em] mb-2">{t('profile.activeCourse')}</p>
                    <h3 className="text-3xl kalian-poster-text text-kalian-cream">{tField(c, 'titulo')}</h3>
                    <p className="text-xs font-bold text-kalian-cream/40 mt-2 tracking-widest uppercase">{tField(c, 'horario')}</p>

                    {/* DOCUMENTOS DEL CURSO */}
                    {c.documentos && c.documentos.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-kalian-gold/10 space-y-3">
                        <p className="text-[8px] font-black text-kalian-gold/40 uppercase tracking-widest">{t('profile.courseMaterial')}</p>
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
                    <p className="text-[9px] font-black text-kalian-gold uppercase tracking-[0.3em] mb-2">{t('profile.kalianHub')}</p>
                    <h3 className="text-3xl kalian-poster-text text-kalian-cream">{localDetalle.nombre}</h3>
                    <p className="text-xs font-bold text-kalian-cream/40 mt-2 tracking-widest uppercase">{t('profile.group')} {localDetalle.nombreGrupo}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* SECCIÓN RESERVAS EVENTOS */}
        <section className="space-y-12">
          <div className="flex items-center gap-6">
            <h2 className="text-3xl kalian-poster-text text-kalian-gold">{t('profile.myReservationsTitle')} <span className="text-kalian-cream">{t('profile.myReservationsHighlight')}</span></h2>
            <div className="h-[1px] flex-1 bg-kalian-gold/20"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {reservasActivas.length === 0 ? (
              <div className="col-span-full bg-black/20 p-20 rounded-[3rem] text-center border border-kalian-gold/10 border-dashed">
                <p className="kalian-poster-text text-kalian-gold/30 text-4xl whitespace-pre-line">{t('profile.noReservations')}</p>
              </div>
            ) : reservasActivas.map(res => (
          <div key={res.id} className="bg-kalian-cream rounded-[3rem] p-10 text-black shadow-2xl flex flex-col items-center transform hover:scale-[1.02] transition-all duration-500 group relative">
            <div className="absolute top-0 left-0 w-full h-4 bg-kalian-gold rounded-t-[3rem] opacity-20"></div>
            
            <span className="bg-black text-kalian-gold px-5 py-1.5 rounded-full text-[10px] font-black uppercase mb-6 tracking-widest">
              {res.tipo} • {res.fechaActividad}
            </span>
            
            <h3 className="text-3xl kalian-poster-text uppercase leading-none text-center mb-8 h-16 flex items-center">{res.tituloEvento || res.titulo}</h3>
            
            <div className="bg-white p-8 rounded-[2.5rem] mb-8 shadow-inner border border-black/5 flex flex-col items-center group-hover:shadow-2xl transition-all">
              <QRCodeSVG 
                value={res.ticketID || res.id} 
                size={140} 
                level="H" 
                includeMargin={true}
                className="mix-blend-multiply"
              />
              <p className="text-center font-mono text-[11px] mt-6 text-black font-black tracking-[0.3em] uppercase">{t('profile.locator')} {res.ticketID || res.id}</p>
            </div>

            <div className="w-full bg-black/5 p-6 rounded-3xl flex justify-between items-center border border-black/5">
              <div>
                <p className="text-[9px] font-black text-black/40 uppercase tracking-widest">{t('profile.companions')}</p>
                <p className="text-3xl kalian-poster-text mt-1">{res.acompañantes}</p>
                {res.acompañantes >= res.max_acompanantes && (
                  <p className="text-[8px] font-bold text-kalian-gold/60 uppercase mt-1">{t('profile.limitReached')}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => actualizarAcompañantes(res, res.acompañantes - 1)}
                  className="w-12 h-12 bg-white border border-black/10 rounded-2xl kalian-poster-text text-2xl hover:bg-black hover:text-kalian-gold transition-all shadow-sm">-</button>
                <button 
                  onClick={() => actualizarAcompañantes(res, res.acompañantes + 1)}
                  disabled={!puedeAñadirInvitados(res) || res.acompañantes >= res.max_acompanantes}
                  className={`w-12 h-12 bg-white border border-black/10 rounded-2xl kalian-poster-text text-2xl transition-all shadow-sm ${(!puedeAñadirInvitados(res) || res.acompañantes >= res.max_acompanantes) ? 'opacity-20 cursor-not-allowed' : 'hover:bg-black hover:text-kalian-gold'}`}>+</button>
              </div>
            </div>
            
            {!puedeAñadirInvitados(res) && !res.esCurso && (
              <p className="mt-4 text-[8px] font-black text-red-500/60 uppercase tracking-widest text-center">
                {t('profile.addGuestsDisabled')}
              </p>
            )}

            <button
              onClick={() => cancelarReserva(res)}
              className="mt-6 text-[9px] font-black uppercase text-red-500/40 hover:text-red-500 transition-colors tracking-widest"
            >
              {t('profile.cancelReservation')}
            </button>
          </div>
        ))}
          </div>
        </section>

        {/* SECCIÓN HISTORIAL */}
        {historialReservas.length > 0 && (
          <section className="space-y-12">
            <div className="flex items-center gap-6">
              <h2 className="text-3xl kalian-poster-text text-kalian-gold/40">{t('profile.historyTitle')} <span className="text-kalian-cream/40">{t('profile.historyHighlight')}</span></h2>
              <div className="h-[1px] flex-1 bg-kalian-gold/10"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 opacity-60 grayscale">
              {historialReservas.map(res => (
                <div key={res.id} className="bg-black/20 border border-kalian-gold/10 rounded-3xl p-6">
                  <p className="text-[8px] font-black text-kalian-gold/40 uppercase mb-2">{res.fechaActividad}</p>
                  <h3 className="text-xl kalian-poster-text text-kalian-cream uppercase leading-none">{res.tituloEvento || res.titulo}</h3>
                  <p className="text-[8px] font-bold text-kalian-gold/20 mt-2 uppercase">{t('profile.ticket')} {res.id}</p>
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
