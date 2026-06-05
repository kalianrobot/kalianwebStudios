import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { collection, getDocs, updateDoc, doc, query, orderBy, DocumentData, where, setDoc, getDoc, getDocsFromServer, arrayUnion, arrayRemove, increment, writeBatch, collectionGroup, deleteDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Link } from 'react-router-dom';
import { registrarIngreso, MetodoPago } from '../../lib/finanzas';
import { fetchConfig } from '../../lib/configService';
import { syncSocioStatus } from '../../lib/socioService';
import KalianCalendar from '../shared/KalianCalendar';

const TeacherDashboard = () => {
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [cursoSeleccionado, setCursoSeleccionado] = useState<DocumentData | null>(null);
  const [alumnosDetalles, setAlumnosDetalles] = useState<DocumentData[]>([]);
  const [pagosMensuales, setPagosMensuales] = useState<Record<string, any>>({});
  const [pagosInscripciones, setPagosInscripciones] = useState<Record<string, any>>({});
  const [archivo, setArchivo] = useState<File | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Efectivo');
  const [subiendo, setSubiendo] = useState(false);
  const [storageUsage, setStorageUsage] = useState(0);
  const [gestionandoSesiones, setGestionandoSesiones] = useState<string | null>(null);
  const [sesiones, setSesiones] = useState<DocumentData[]>([]);
  const [nuevaSesion, setNuevaSesion] = useState({ fecha: '', hora_inicio: '', hora_fin: '', sala: 'SALA GRANDE', esRecurrente: false, diasSemana: [] as number[] });
  const [conflictos, setConflictos] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingPago, setConfirmingPago] = useState<{ socioId: string, nombre: string } | null>(null);
  const [showUnpayModal, setShowUnpayModal] = useState(false);
  const [confirmingUnpago, setConfirmingUnpago] = useState<{ socioId: string, nombre: string, mes: number, anio: number } | null>(null);
  const [mesParaPago, setMesParaPago] = useState<number>(new Date().getMonth() + 1);
  const [anioParaPago, setAnioParaPago] = useState<number>(new Date().getFullYear());
  const [notificaciones, setNotificaciones] = useState<DocumentData[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [cuotaGlobal, setCuotaGlobal] = useState(15);
  const [cursosMap, setCursosMap] = useState<Record<string, string>>({});
  const { user, socioData, logoutTeacher } = useAuth();
  const { t } = useLanguage();

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  const mesAnioKey = `${anioActual}_${mesActual}`;

  const fetchStorageUsage = async () => {
    try {
      const snap = await getDoc(doc(db, "metadata", "storage"));
      if (snap.exists()) setStorageUsage(snap.data().totalBytes || 0);
    } catch (e) { console.error(e); }
  };

  const storageLimit = 5 * 1024 * 1024 * 1024; // 5GB
  const usagePercent = Math.min(100, (storageUsage / storageLimit) * 100);
  const usageMB = (storageUsage / (1024 * 1024)).toFixed(2);

  useEffect(() => {
    if (!user) return;

    fetchConfig().then(conf => setCuotaGlobal(conf.cuotaMensualSocio));

    // Cargar mapa de titulos de todos los cursos (para mostrar atribución cross-curso)
    getDocs(collection(db, "cursos")).then(snap => {
      const map: Record<string, string> = {};
      snap.docs.forEach(d => { map[d.id] = d.data().titulo || d.id; });
      setCursosMap(map);
    }).catch(err => console.error("TeacherDashboard: Error cargando cursosMap:", err));

    // Listen to cursos
    const qC = query(collection(db, "cursos"), where("profesorId", "==", user.uid));
    const unsubC = onSnapshot(qC, (snap) => {
      setCursos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => console.error("TeacherDashboard: Error en cursos onSnapshot:", err.message));

    // Listen to notificaciones
    const qN = query(collection(db, "notificaciones"), where("userId", "==", user.uid), orderBy("fecha", "desc"));
    const unsubN = onSnapshot(qN, (snap) => {
      setNotificaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("TeacherDashboard: Error en notificaciones onSnapshot:", err.message));

    fetchStorageUsage();

    return () => {
      unsubC();
      unsubN();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Listen to monthly payments
    const qM = query(
      collection(db, "pagos_mensuales"),
      where("mes", "==", mesActual),
      where("anio", "==", anioActual)
    );
    const unsubM = onSnapshot(qM, (snap) => {
      const mapM: Record<string, any> = {};
      snap.docs.forEach(d => { mapM[d.data().socioId] = d.data(); });
      setPagosMensuales(mapM);
    }, (err) => console.error("TeacherDashboard: Error en pagos_mensuales onSnapshot:", err.message));

    // Listen to course-specific payments
    let unsubI = () => {};
    if (cursoSeleccionado) {
      const qI = query(
        collection(db, "pagos_inscripciones"),
        where("cursoId", "==", cursoSeleccionado.id)
      );
      unsubI = onSnapshot(qI, (snap) => {
        const mapI: Record<string, any> = {};
        snap.docs.forEach(d => { mapI[d.data().socioId] = d.data(); });
        setPagosInscripciones(mapI);
      }, (err) => console.error("TeacherDashboard: Error en pagos_inscripciones onSnapshot:", err.message));
    }

    return () => {
      unsubM();
      unsubI();
    };
  }, [user, cursoSeleccionado, mesActual, anioActual]);

  useEffect(() => {
    const fetchAlumnos = async () => {
      if (!cursoSeleccionado || !cursoSeleccionado.alumnos || cursoSeleccionado.alumnos.length === 0) {
        setAlumnosDetalles([]);
        return;
      }

      try {
        // Firestore 'in' query supports up to 30 items.
        const dnis = cursoSeleccionado.alumnos;
        const q = query(collection(db, "socios"), where("dni", "in", dnis));
        const snap = await getDocs(q);
        setAlumnosDetalles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching alumnos details:", err);
      }
    };

    fetchAlumnos();
  }, [cursoSeleccionado]);

  const toggleAforo = async (id: string, actual: boolean) => {
    try {
      await updateDoc(doc(db, "cursos", id), { aforo_disponible: !actual });
    } catch (err) { console.error(err); }
  };

  const togglePago = async (socioId: string, tipo: 'mensual' | 'inscripcion', valorActual: boolean, cursoId?: string, nombreSocio?: string) => {
    try {
      const nuevoEstado = !valorActual;
      
      if (tipo === 'mensual') {
        if (nuevoEstado) {
          // Mostrar modal de confirmación antes de marcar como pagado
          setMesParaPago(mesActual);
          setAnioParaPago(anioActual);
          setConfirmingPago({ socioId, nombre: nombreSocio || 'Alumno' });
          setShowConfirmModal(true);
          return;
        }

        // Si es para desmarcar (solo si no está bloqueado, aunque el botón debería estar deshabilitado)
        const pagoId = `${anioActual}_${mesActual}_${socioId}`;
        const pagoRef = doc(db, "pagos_mensuales", pagoId);
        const snap = await getDoc(pagoRef);

        if (snap.exists()) {
          const data = snap.data();
          if (data.bloqueado && socioData?.role !== 'admin') {
            alert(t('teacher.paymentLocked'));
            return;
          }
          // El profesor solo puede revertir pagos que él mismo registró en este curso
          if (socioData?.role !== 'admin' && (data.profesorId !== user?.uid || data.cursoId !== cursoSeleccionado?.id)) {
            alert(t('teacher.paymentLocked'));
            return;
          }

          // Mostrar confirmación antes de desmarcar
          setConfirmingUnpago({
            socioId,
            nombre: nombreSocio || socioId,
            mes: data.mes ?? mesActual,
            anio: data.anio ?? anioActual
          });
          setShowUnpayModal(true);
        }
      } else if (tipo === 'inscripcion' && cursoId) {
        const pagoId = `${socioId}_${cursoId}`;
        const pagoRef = doc(db, "pagos_inscripciones", pagoId);
        const snap = await getDoc(pagoRef);

        if (snap.exists()) {
          await updateDoc(pagoRef, {
            pagado: nuevoEstado,
            fechaPago: nuevoEstado ? new Date().toISOString() : null
          });
        } else {
          await setDoc(pagoRef, {
            socioId,
            cursoId,
            pagado: nuevoEstado,
            fechaPago: nuevoEstado ? new Date().toISOString() : null
          });
        }

        // Registrar en Finanzas si se marca como pagado
        if (nuevoEstado) {
          // Buscamos el precio en el curso seleccionado
          // Nota: Aquí simplificamos usando el precio de la primera modalidad o un valor por defecto
          // ya que el registro de pago de inscripción no guarda la modalidad elegida explícitamente en su ID
          const monto = cursoSeleccionado?.modalidades?.[0]?.precio || 0;
          await registrarIngreso({
            monto,
            concepto: `Inscripción Curso: ${cursoSeleccionado?.titulo}`,
            categoria: 'Curso',
            metodo: metodoPago,
            socio_id: socioId
          });
        }
      }
    } catch (err) { console.error(err); }
  };

  const ejecutarPagoConfirmado = async () => {
    if (!confirmingPago) return;
    const { socioId } = confirmingPago;

    try {
      const pagoId = `${anioParaPago}_${mesParaPago}_${socioId}`;
      const pagoRef = doc(db, "pagos_mensuales", pagoId);

      await setDoc(pagoRef, {
        socioId,
        mes: mesParaPago,
        anio: anioParaPago,
        pagado: true,
        bloqueado: false,
        monto: cuotaGlobal,
        cursoId: cursoSeleccionado?.id || null,
        profesorId: user?.uid || null,
        metodo: metodoPago,
        actualizadoPor: user?.uid,
        fechaActualizacion: new Date().toISOString()
      }, { merge: true });

      // Nota: el ingreso en finanzas se registra cuando el admin "Cierra Aportación Mes"
      // en AdminCursos (categoria 'Cierre Aportación Curso'). Aquí solo se marca el
      // estado operativo del cobro.

      await syncSocioStatus(socioId);

      setShowConfirmModal(false);
      setConfirmingPago(null);
      setMsg(t('teacher.paymentRegistered'));
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert(t('teacher.paymentError'));
    }
  };

  const ejecutarDespagoConfirmado = async () => {
    if (!confirmingUnpago) return;
    const { socioId, mes, anio } = confirmingUnpago;
    try {
      const pagoId = `${anio}_${mes}_${socioId}`;
      const pagoRef = doc(db, "pagos_mensuales", pagoId);
      await updateDoc(pagoRef, {
        pagado: false,
        bloqueado: false,
        actualizadoPor: user?.uid,
        fechaActualizacion: new Date().toISOString()
      });
      await syncSocioStatus(socioId);
      setShowUnpayModal(false);
      setConfirmingUnpago(null);
      setMsg(t('teacher.paymentReversed'));
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert(t('teacher.paymentError'));
    }
  };

  const subirDocumento = async (cursoId: string) => {
    if (!archivo) return;

    // 1. Validación de tamaño individual (20MB)
    const LIMITE_ARCHIVO = 20 * 1024 * 1024; // 20MB
    if (archivo.size > LIMITE_ARCHIVO) {
      alert(t('teacher.fileTooLarge'));
      return;
    }

    setSubiendo(true);
    try {
      // 2. Validación de límite total (5GB)
      const LIMITE_TOTAL = 5 * 1024 * 1024 * 1024; // 5GB
      const storageMetaRef = doc(db, "metadata", "storage");
      const metaSnap = await getDoc(storageMetaRef);
      const totalActual = metaSnap.exists() ? metaSnap.data().totalBytes || 0 : 0;

      if (totalActual + archivo.size > LIMITE_TOTAL) {
        alert(t('teacher.storageFullError'));
        setSubiendo(false);
        return;
      }

      const storageRef = ref(storage, `cursos/${cursoId}/${Date.now()}_${archivo.name}`);
      await uploadBytes(storageRef, archivo);
      const url = await getDownloadURL(storageRef);
      
      const docData = {
        nombre: archivo.name,
        url: url,
        fecha: new Date().toISOString(),
        path: storageRef.fullPath,
        size: archivo.size // Guardamos el tamaño para restarlo al eliminar
      };

      // Actualizar curso y metadatos de almacenamiento de forma atómica
      await updateDoc(doc(db, "cursos", cursoId), {
        documentos: arrayUnion(docData)
      });

      // Actualizar contador total
      if (metaSnap.exists()) {
        await updateDoc(storageMetaRef, { totalBytes: increment(archivo.size) });
      } else {
        await setDoc(storageMetaRef, { totalBytes: archivo.size });
      }

      setArchivo(null);
      fetchStorageUsage();
      alert(t('teacher.docUploaded'));
    } catch (err) {
      console.error(err);
      alert(t('teacher.docUploadError'));
    } finally {
      setSubiendo(false);
    }
  };

  const eliminarDocumento = async (cursoId: string, documento: any) => {
    if (!window.confirm(t('teacher.confirmDeleteDoc'))) return;
    try {
      const storageRef = ref(storage, documento.path);
      await deleteObject(storageRef);
      
      await updateDoc(doc(db, "cursos", cursoId), {
        documentos: arrayRemove(documento)
      });

      // Restar del contador total
      const storageMetaRef = doc(db, "metadata", "storage");
      await updateDoc(storageMetaRef, { 
        totalBytes: increment(-(documento.size || 0)) 
      });
      
      fetchStorageUsage();
    } catch (err) {
      console.error(err);
      alert(t('teacher.deleteError'));
    }
  };

  const mesesES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const fetchSesiones = async (cursoId: string) => {
    const snap = await getDocs(query(collection(db, "cursos", cursoId, "sesiones"), orderBy("fecha", "asc")));
    setSesiones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const guardarSesion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gestionandoSesiones) return;
    setConflictos([]);
    
    try {
      const curso = cursos.find(c => c.id === gestionandoSesiones);
      if (!curso) return;

      const sesionesAGuardar: any[] = [];
      const fechasAComprobar: string[] = [];

      if (nuevaSesion.esRecurrente && nuevaSesion.diasSemana.length > 0) {
        const end = new Date(curso.fechaFin);
        
        nuevaSesion.diasSemana.forEach(targetDay => {
          const current = new Date(nuevaSesion.fecha);
          const targetDayJs = targetDay === 7 ? 0 : targetDay;

          // Ajustar al primer día de la semana deseado desde la fecha seleccionada
          while (current.getDay() !== targetDayJs) {
            current.setDate(current.getDate() + 1);
          }

          while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            fechasAComprobar.push(dateStr);
            sesionesAGuardar.push({
              ...nuevaSesion,
              fecha: dateStr,
              esRecurrente: true
            });
            current.setDate(current.getDate() + 7);
          }
        });
      } else {
        fechasAComprobar.push(nuevaSesion.fecha);
        sesionesAGuardar.push(nuevaSesion);
      }

      // Validación de Conflictos
      const conflicts: string[] = [];
      
      // 1. Comprobar contra Eventos
      const snapE = await getDocs(query(collection(db, "eventos"), where("fecha", ">=", fechasAComprobar[0])));
      const eventosExistentes = snapE.docs.map(d => d.data());
      
      // 2. Comprobar contra todas las Sesiones (collectionGroup)
      const snapS = await getDocs(collectionGroup(db, "sesiones"));
      const sesionesExistentes = snapS.docs.map(d => ({ ...d.data(), cursoId: d.ref.parent.parent?.id }));

      for (const f of fechasAComprobar) {
        const hasEvento = eventosExistentes.some(ev => ev.fecha.startsWith(f));
        const hasSesion = sesionesExistentes.some((s: any) => 
          s.fecha === f && 
          s.sala === nuevaSesion.sala || 
          ((nuevaSesion.sala === 'SALA GRANDE' || nuevaSesion.sala === 'SALA' || nuevaSesion.sala === 'Toda la Sala') && 
           (s.sala === 'SALA GRANDE' || s.sala === 'SALA' || s.sala === 'Toda la Sala')) && 
          (
            (nuevaSesion.hora_inicio >= s.hora_inicio && nuevaSesion.hora_inicio < s.hora_fin) ||
            (nuevaSesion.hora_fin > s.hora_inicio && nuevaSesion.hora_fin <= s.hora_fin)
          )
        );

        if (hasEvento || hasSesion) {
          conflicts.push(f);
        }
      }

      if (conflicts.length > 0) {
        setConflictos(conflicts);
        return;
      }

      // Guardar en bloque
      const batch = writeBatch(db);
      sesionesAGuardar.forEach(s => {
        const sesionId = `${s.fecha}_${s.hora_inicio.replace(':', '')}`;
        const ref = doc(db, "cursos", gestionandoSesiones, "sesiones", sesionId);
        batch.set(ref, s);
      });

      await batch.commit();
      setMsg(t('teacher.sessionsAdded', { n: sesionesAGuardar.length }));
      setNuevaSesion({ fecha: '', hora_inicio: '', hora_fin: '', sala: 'SALA GRANDE', esRecurrente: false, diasSemana: [] });
      fetchSesiones(gestionandoSesiones);
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert(t('teacher.saveSessionError'));
    }
  };

  const eliminarSesion = async (sesionId: string) => {
    if (!gestionandoSesiones) return;
    if (window.confirm(t('teacher.confirmDeleteSession'))) {
      await deleteDoc(doc(db, "cursos", gestionandoSesiones, "sesiones", sesionId));
      fetchSesiones(gestionandoSesiones);
    }
  };

  const marcarLeida = async (id: string) => {
    try {
      await updateDoc(doc(db, "notificaciones", id), { leida: true });
    } catch (err) { console.error(err); }
  };

  const eliminarNotificacion = async (id: string) => {
    try {
      await deleteDoc(doc(db, "notificaciones", id));
    } catch (err) { console.error(err); }
  };

  return (
    <div className="min-h-screen bg-kalian-dark p-6 font-sans text-kalian-cream">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 flex justify-between items-end">
          <div>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold tracking-tight uppercase italic leading-none">{t('teacher.panelTitle')} <span className="text-kalian-cream">{t('teacher.panelHighlight')}</span></h1>
            {msg && <div className="bg-emerald-500 text-white p-3 rounded-xl mt-4 font-bold text-center animate-bounce text-[10px] uppercase tracking-widest">{msg}</div>}
            <p className="text-[10px] text-kalian-gold/40 font-black uppercase tracking-[0.4em] mt-4 ml-4">{t('teacher.managementSubtitle')} - {t(`month.${mesActual}`)} {anioActual}</p>
            {user && <p className="text-[8px] text-kalian-gold/20 font-mono mt-2 ml-4">ID: {user.uid}</p>}
            
            {/* Barra de Almacenamiento */}
            <div className="mt-6 ml-4 max-w-xs">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[8px] font-black uppercase text-kalian-gold/40 tracking-widest">{t('teacher.storage')}: {usageMB}MB / 5000MB</span>
                <span className="text-[8px] font-black text-kalian-gold/40">{usagePercent.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full bg-kalian-gold/5 rounded-full overflow-hidden border border-kalian-gold/10">
                <div 
                  className={`h-full transition-all duration-1000 ${usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-kalian-gold'}`}
                  style={{ width: `${usagePercent}%` }}
                ></div>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="relative">
              <button 
                onClick={() => setShowNotifs(!showNotifs)}
                className={`p-3 rounded-xl border transition-all ${notificaciones.some(n => !n.leida) ? 'bg-amber-500/20 border-amber-500 text-amber-500 animate-pulse' : 'bg-kalian-gold/5 border-kalian-gold/10 text-kalian-gold/40 hover:text-kalian-gold'}`}
              >
                🔔 {notificaciones.filter(n => !n.leida).length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">{notificaciones.filter(n => !n.leida).length}</span>}
              </button>
              
              {showNotifs && (
                <div className="absolute right-0 mt-4 w-80 bg-kalian-dark border border-kalian-gold/20 rounded-2xl shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="p-4 bg-black/40 border-b border-kalian-gold/10 flex justify-between items-center">
                    <h4 className="text-[10px] font-black uppercase text-kalian-gold tracking-widest">{t('teacher.notifications')}</h4>
                    <button onClick={() => setShowNotifs(false)} className="text-kalian-gold/40 hover:text-white">×</button>
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar">
                    {notificaciones.length === 0 ? (
                      <p className="p-8 text-center text-[10px] text-kalian-gold/20 font-black uppercase tracking-widest italic">{t('teacher.noNotifications')}</p>
                    ) : (
                      notificaciones.map(n => (
                        <div key={n.id} className={`p-4 border-b border-kalian-gold/5 hover:bg-kalian-gold/5 transition-all ${!n.leida ? 'bg-kalian-gold/5' : ''}`}>
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-[10px] font-black text-kalian-cream uppercase">{n.titulo}</p>
                            <button onClick={() => eliminarNotificacion(n.id)} className="text-[10px] text-red-500/40 hover:text-red-500">🗑️</button>
                          </div>
                          <p className="text-[9px] text-kalian-gold/60 leading-relaxed mb-2">{n.mensaje}</p>
                          <div className="flex justify-between items-center">
                            <p className="text-[7px] text-kalian-gold/20 font-mono">{n.fecha?.toDate?.().toLocaleString() || t('teacher.recent')}</p>
                            {!n.leida && (
                              <button onClick={() => marcarLeida(n.id)} className="text-[8px] font-black uppercase text-kalian-gold hover:text-white transition-colors">{t('teacher.markRead')}</button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button 
              onClick={() => setView(view === 'list' ? 'calendar' : 'list')}
              className="bg-kalian-gold text-black px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white transition-all shadow-lg shadow-kalian-gold/20"
            >
              {view === 'list' ? t('teacher.viewCalendar') : t('teacher.viewList')}
            </button>
            <button 
              onClick={() => { fetchStorageUsage(); }}
              className="bg-kalian-gold/5 text-kalian-gold/40 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:text-kalian-gold transition-all"
            >
              {t('teacher.refresh')}
            </button>
          </div>
        </header>

        {loading ? (
          <div className="text-center py-20 text-kalian-gold/40 font-black uppercase tracking-widest animate-pulse">{t('teacher.loadingCourses')}</div>
        ) : view === 'calendar' ? (
          <div className="animate-in fade-in zoom-in-95 duration-500 space-y-6">
            <div className="flex justify-between items-center bg-black/40 p-6 rounded-[2rem] border border-kalian-gold/10">
              <div>
                <h2 className="text-2xl kalian-poster-text text-kalian-gold uppercase italic leading-none">{t('teacher.classCalendar')}</h2>
                <p className="text-[10px] text-kalian-gold/40 font-black uppercase tracking-widest mt-2">{t('teacher.calendarHint')}</p>
              </div>
              <button 
                onClick={() => setView('list')}
                className="bg-kalian-gold/10 text-kalian-gold px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-kalian-gold/20 transition-all border border-kalian-gold/20"
              >
                {t('teacher.backToList')}
              </button>
            </div>
            <KalianCalendar teacherMode={true} />
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* LISTA DE CURSOS */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest mb-6 ml-4 italic">{t('teacher.myCourses')}</h2>
              {cursos.map(c => {
                const totalAlumnos = c.alumnos?.length || 0;
                const pagadosEnEsteCurso = (c.alumnos || []).filter((dni: string) => {
                  const p = pagosMensuales[dni];
                  return p?.pagado && p?.cursoId === c.id;
                });
                const sumaCobrada = pagadosEnEsteCurso.reduce((acc: number, dni: string) => acc + (pagosMensuales[dni]?.monto || 0), 0);
                const cuentaPagados = (c.alumnos || []).filter((dni: string) => pagosMensuales[dni]?.pagado).length;
                const cerrado = c.ultimoCierreAportacion === mesAnioKey;
                const listoTransferir = !cerrado && totalAlumnos > 0 && cuentaPagados === totalAlumnos;
                return (
                <div
                  key={c.id}
                  onClick={() => setCursoSeleccionado(c)}
                  className={`p-8 rounded-[2.5rem] border transition-all cursor-pointer group ${cursoSeleccionado?.id === c.id ? 'bg-kalian-gold/20 border-kalian-gold shadow-2xl' : 'bg-black/40 border-kalian-gold/10 hover:border-kalian-gold/30'}`}
                >
                  <h3 className="text-2xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors uppercase italic leading-none">{c.titulo}</h3>
                  <p className="text-[9px] text-kalian-gold/40 font-black uppercase tracking-[0.3em] mt-2">
                    {c.horario} | {totalAlumnos} Alumnos
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-[9px] font-black uppercase tracking-widest">
                    <span className={`px-2 py-1 rounded-lg border ${cerrado ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : listoTransferir ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse' : 'bg-kalian-gold/5 text-kalian-gold/60 border-kalian-gold/20'}`}>
                      {cerrado ? '🔒 Cerrado' : `${cuentaPagados}/${totalAlumnos} pagados`}
                    </span>
                    {sumaCobrada > 0 && (
                      <span className="text-kalian-gold/60">{sumaCobrada}€</span>
                    )}
                  </div>
                  {listoTransferir && (
                    <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mt-2">✅ Listo para transferir</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2 justify-between items-center">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${c.aforo_disponible !== false ? 'text-emerald-500' : 'text-red-500'}`}>
                      {c.aforo_disponible !== false ? t('teacher.seatsAvail') : t('teacher.noSeats')}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleAforo(c.id, c.aforo_disponible !== false); }}
                        className="bg-kalian-gold/10 text-kalian-gold px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-kalian-gold/20 transition-all"
                      >
                        {c.aforo_disponible !== false ? t('teacher.closeCapacity') : t('teacher.openCapacity')}
                      </button>
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setView('calendar');
                        }}
                        className="bg-amber-500/10 text-amber-500 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all border border-amber-500/20"
                      >
                        📅 Calendario
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
              {cursos.length === 0 && (
                <div className="bg-black/20 p-10 rounded-[2.5rem] text-center border border-dashed border-kalian-gold/10">
                  <p className="text-kalian-gold/20 font-black uppercase tracking-widest italic text-xs">{t('teacher.noCourses')}</p>
                </div>
              )}
            </div>

            {/* LISTA DE ALUMNOS Y PAGOS */}
            <div className="lg:col-span-2">
              {cursoSeleccionado ? (
                <div className="bg-black/40 p-10 rounded-[3rem] border border-kalian-gold/20 shadow-2xl animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex justify-between items-start mb-10">
                    <div>
                      <h2 className="text-4xl kalian-poster-text text-kalian-gold uppercase italic leading-none">{cursoSeleccionado.titulo}</h2>
                      <p className="text-[10px] text-kalian-gold/40 font-black uppercase tracking-[0.4em] mt-3 ml-4">{t('teacher.attendanceControl')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-xl border border-kalian-gold/10">
                        <p className="text-[8px] font-black text-kalian-gold/40 uppercase tracking-widest">{t('teacher.paymentMethod')}</p>
                        <select
                          value={metodoPago}
                          onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                          className="bg-transparent text-[10px] text-kalian-gold font-bold outline-none cursor-pointer"
                        >
                          <option value="Efectivo">{t('teacher.cash')}</option>
                          <option value="Tarjeta">{t('teacher.card')}</option>
                          <option value="Transferencia">{t('teacher.transfer')}</option>
                        </select>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl kalian-poster-text text-kalian-cream leading-none">{cursoSeleccionado.alumnos?.length || 0}</p>
                        <p className="text-[8px] font-black text-kalian-gold/20 uppercase tracking-widest">{t('teacher.students')}</p>
                      </div>
                    </div>
                  </div>

                  {/* GESTIÓN DE DOCUMENTOS */}
                  <div className="mb-12 bg-kalian-gold/5 p-8 rounded-[2rem] border border-kalian-gold/10">
                    <h3 className="text-sm font-black uppercase tracking-widest text-kalian-gold mb-6 italic">{t('teacher.courseDocs')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {cursoSeleccionado.documentos?.map((doc: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-kalian-gold/10 group">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="text-xl">📄</span>
                            <div className="overflow-hidden">
                              <p className="text-[10px] font-black uppercase text-kalian-cream truncate">{doc.nombre}</p>
                              <p className="text-[8px] text-kalian-gold/30 font-bold">{new Date(doc.fecha).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <a href={doc.url} target="_blank" rel="noreferrer" className="p-2 hover:bg-kalian-gold/20 rounded-lg transition-all">👁️</a>
                            <button onClick={() => eliminarDocumento(cursoSeleccionado.id, doc)} className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-all">🗑️</button>
                          </div>
                        </div>
                      ))}
                      {(!cursoSeleccionado.documentos || cursoSeleccionado.documentos.length === 0) && (
                        <p className="col-span-full text-[10px] text-kalian-gold/20 font-black uppercase tracking-widest text-center py-4 italic">{t('teacher.noDocs')}</p>
                      )}
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-4 items-center border-t border-kalian-gold/10 pt-6">
                      <input 
                        type="file" 
                        onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                        className="flex-1 text-[10px] font-black uppercase text-kalian-gold/40 file:bg-kalian-gold/10 file:text-kalian-gold file:border-0 file:px-4 file:py-2 file:rounded-lg file:mr-4 file:cursor-pointer"
                      />
                      <button 
                        onClick={() => subirDocumento(cursoSeleccionado.id)}
                        disabled={!archivo || subiendo}
                        className="bg-kalian-gold text-black px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white transition-all disabled:opacity-30"
                      >
                        {subiendo ? t('teacher.uploading') : t('teacher.uploadDoc')}
                      </button>
                    </div>
                  </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-12 gap-4 px-6 py-3 text-[9px] font-black text-kalian-gold/80 uppercase tracking-widest border-b border-kalian-gold/10">
                        <div className="col-span-6">{t('teacher.student')}</div>
                        <div className="col-span-3 text-center">{t('teacher.monthlyKalian')} {t(`month.${mesActual}`)}</div>
                        <div className="col-span-3 text-center">{t('teacher.courseEnrollment')}</div>
                      </div>

                      {alumnosDetalles.map((alumno: any, idx: number) => {
                        const pagoM = pagosMensuales[alumno.dni] || {};
                        const pagoI = pagosInscripciones[alumno.dni] || {};
                        const cubiertoPorLocal = !!pagoM.localId;
                        const pagadoEnOtroCurso = !!pagoM.pagado && !!pagoM.cursoId && pagoM.cursoId !== cursoSeleccionado.id;
                        const pagadoEnEsteCurso = !!pagoM.pagado && pagoM.cursoId === cursoSeleccionado.id;
                        const cobradoPorAdmin = !!pagoM.pagado && !pagoM.cursoId && !pagoM.localId;
                        const propio = pagadoEnEsteCurso && pagoM.profesorId === user?.uid;
                        const bloqueado = !!pagoM.bloqueado || cubiertoPorLocal || pagadoEnOtroCurso || cobradoPorAdmin || (pagadoEnEsteCurso && !propio);

                        let etiqueta: string | null = null;
                        if (cubiertoPorLocal) etiqueta = t('teacher.coveredByLocal');
                        else if (pagadoEnOtroCurso) etiqueta = `Pagado en ${cursosMap[pagoM.cursoId] || pagoM.cursoId}`;
                        else if (cobradoPorAdmin) etiqueta = 'Cobrado por admin';
                        else if (pagoM.bloqueado && pagadoEnEsteCurso) etiqueta = '🔒 Cerrado por admin';

                        return (
                          <div key={idx} className="grid grid-cols-12 gap-4 px-6 py-5 bg-kalian-gold/5 rounded-2xl items-center hover:bg-kalian-gold/10 transition-all group">
                            <div className="col-span-6">
                              <p className="font-black text-kalian-cream uppercase italic group-hover:text-kalian-gold transition-colors">{alumno.nombre}</p>
                              <p className="text-[8px] text-kalian-gold/60 font-bold tracking-widest mt-1">{alumno.dni}</p>
                              {etiqueta && (
                                <p className="text-[7px] font-black text-emerald-500 uppercase tracking-widest mt-1">{etiqueta}</p>
                              )}
                            </div>
                            <div className="col-span-3 flex flex-col items-center gap-1">
                              <button
                                onClick={() => togglePago(alumno.dni, 'mensual', !!pagoM.pagado, undefined, alumno.nombre)}
                                disabled={bloqueado}
                                className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${pagoM.pagado ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20' : 'bg-black/40 border-kalian-gold/20 text-transparent hover:border-kalian-gold/40'} ${bloqueado ? 'opacity-100 cursor-default' : ''}`}
                              >
                                {pagoM.pagado ? '✓' : ''}
                              </button>
                              {bloqueado && pagoM.pagado && (
                                <span className="text-[7px] font-black text-emerald-500/60 uppercase tracking-tighter">{t('teacher.settled')}</span>
                              )}
                            </div>
                            <div className="col-span-3 flex justify-center">
                              <button 
                                onClick={() => togglePago(alumno.dni, 'inscripcion', !!pagoI.pagado, cursoSeleccionado.id)}
                                className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${pagoI.pagado ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' : 'bg-black/40 border-kalian-gold/20 text-transparent hover:border-kalian-gold/40'}`}
                              >
                                {pagoI.pagado ? '✓' : ''}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {alumnosDetalles.length === 0 && (
                        <div className="py-20 text-center">
                          <p className="text-kalian-gold/20 font-black uppercase tracking-widest italic text-xs">{t('teacher.noStudents')}</p>
                        </div>
                      )}
                    </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-black/20 rounded-[3rem] border border-dashed border-kalian-gold/10 p-20 text-center">
                  <div className="text-6xl mb-8 opacity-20">📋</div>
                  <h3 className="text-2xl kalian-poster-text text-kalian-gold/40 uppercase italic mb-4">{t('teacher.selectCourse')}</h3>
                  <p className="text-[10px] text-kalian-gold/20 font-black uppercase tracking-widest max-w-xs">
                    {t('teacher.selectCourseHint')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL CONFIRMACIÓN PAGO (ANTI-ERROR) */}
        {showConfirmModal && confirmingPago && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-kalian-dark w-full max-w-md rounded-[3rem] shadow-2xl border border-kalian-gold/20 p-10 text-center space-y-8 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-kalian-gold/10 rounded-full flex items-center justify-center text-4xl mx-auto border border-kalian-gold/20">
                💰
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl kalian-poster-text text-kalian-gold uppercase italic">{t('teacher.confirmContrib')}</h3>
                <p className="text-sm text-kalian-cream/70 leading-relaxed">
                  {t('teacher.contribConfirmMsg', { nombre: confirmingPago.nombre })}
                </p>
                <div className="bg-black/40 p-4 rounded-2xl border border-kalian-gold/10 space-y-2">
                  <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-widest">¿A qué mes corresponde este pago?</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    {(() => {
                      const opts = [];
                      for (let delta = -1; delta <= 1; delta++) {
                        let m = mesActual + delta;
                        let a = anioActual;
                        if (m < 1) { m = 12; a -= 1; }
                        if (m > 12) { m = 1; a += 1; }
                        opts.push({ mes: m, anio: a });
                      }
                      return opts.map(({ mes, anio }) => (
                        <button
                          key={`${anio}_${mes}`}
                          type="button"
                          onClick={() => { setMesParaPago(mes); setAnioParaPago(anio); }}
                          className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${mesParaPago === mes && anioParaPago === anio ? 'bg-kalian-gold text-black border-kalian-gold shadow-lg shadow-kalian-gold/20' : 'bg-black/40 border-kalian-gold/20 text-kalian-gold/60 hover:border-kalian-gold/40'}`}
                        >
                          {mesesES[mes - 1]} {anio !== anioActual ? anio : ''}
                        </button>
                      ));
                    })()}
                  </div>
                </div>
                <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-widest">
                  {t('teacher.lockConfirmMsg')}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={ejecutarPagoConfirmado}
                  className="w-full bg-kalian-gold text-black py-5 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20"
                >
                  {t('teacher.confirmLock')}
                </button>
                <button 
                  onClick={() => { setShowConfirmModal(false); setConfirmingPago(null); }}
                  className="w-full py-5 text-kalian-gold/40 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors"
                >
                  {t('teacher.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CONFIRMACIÓN DESMARCAR PAGO */}
        {showUnpayModal && confirmingUnpago && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-kalian-dark w-full max-w-sm rounded-[3rem] shadow-2xl border border-red-500/30 p-8 text-center space-y-6 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-3xl mx-auto border border-red-500/20">
                ↩️
              </div>
              <div className="space-y-3">
                <h3 className="text-xl kalian-poster-text text-red-400 uppercase italic">¿Desmarcar pago?</h3>
                <p className="text-sm text-kalian-cream/80 leading-relaxed">
                  ¿Seguro que quieres desmarcar el pago de
                </p>
                <p className="text-lg font-black text-kalian-gold uppercase italic">{confirmingUnpago.nombre}</p>
                <p className="text-sm text-kalian-cream/70">
                  correspondiente a{' '}
                  <span className="font-black text-kalian-cream">
                    {mesesES[confirmingUnpago.mes - 1]} {confirmingUnpago.anio !== anioActual ? confirmingUnpago.anio : ''}
                  </span>?
                </p>
                <p className="text-[9px] font-black text-red-400/60 uppercase tracking-widest">
                  El pago quedará como pendiente y podrás volver a registrarlo.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={ejecutarDespagoConfirmado}
                  className="w-full bg-red-500 text-white py-4 rounded-2xl kalian-poster-text text-base tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-red-500/20"
                >
                  Sí, desmarcar pago
                </button>
                <button
                  onClick={() => { setShowUnpayModal(false); setConfirmingUnpago(null); }}
                  className="w-full py-4 text-kalian-gold/40 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL GESTIÓN SESIONES */}
        {gestionandoSesiones && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-kalian-dark w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-kalian-gold/20">
              <div className="p-8 bg-black/40 text-white flex justify-between items-center border-b border-kalian-gold/10">
                <div>
                  <h3 className="text-2xl kalian-poster-text text-kalian-gold uppercase italic">{t('teacher.manageSessions')}</h3>
                  <p className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-widest mt-1">
                    {cursos.find(c => c.id === gestionandoSesiones)?.titulo}
                  </p>
                </div>
                <button onClick={() => setGestionandoSesiones(null)} className="text-kalian-gold/40 hover:text-white text-3xl transition-colors">×</button>
              </div>
              
              <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                {/* Formulario Nueva Sesión */}
                <form onSubmit={guardarSesion} className="bg-kalian-gold/5 p-8 rounded-[2rem] border border-kalian-gold/10 space-y-6">
                  <h4 className="text-[10px] font-black uppercase text-kalian-gold/60 tracking-[0.3em] italic">{t('teacher.addNewSession')}</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2 tracking-widest">{t('teacher.dateLabel')}</label>
                      <input 
                        type="date" 
                        className="w-full p-4 bg-black/40 rounded-xl text-xs border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold/50 transition-all"
                        value={nuevaSesion.fecha}
                        onChange={e => setNuevaSesion({...nuevaSesion, fecha: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2 tracking-widest">{t('teacher.roomLabel')}</label>
                      <select 
                        className="w-full p-4 bg-black/40 rounded-xl text-xs border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold/50 transition-all uppercase font-black"
                        value={nuevaSesion.sala}
                        onChange={e => setNuevaSesion({...nuevaSesion, sala: e.target.value})}
                      >
                        <option value="SALA GRANDE">SALA GRANDE</option>
                        <option value="Estudio">Estudio</option>
                        <option value="Local Pequeño">Local Pequeño</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2 tracking-widest">{t('teacher.startTime')}</label>
                      <input 
                        type="time" 
                        className="w-full p-4 bg-black/40 rounded-xl text-xs border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold/50 transition-all"
                        value={nuevaSesion.hora_inicio}
                        onChange={e => setNuevaSesion({...nuevaSesion, hora_inicio: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black uppercase text-kalian-gold/40 ml-2 tracking-widest">{t('teacher.endTime')}</label>
                      <input 
                        type="time" 
                        className="w-full p-4 bg-black/40 rounded-xl text-xs border border-kalian-gold/20 text-kalian-cream outline-none focus:border-kalian-gold/50 transition-all"
                        value={nuevaSesion.hora_fin}
                        onChange={e => setNuevaSesion({...nuevaSesion, hora_fin: e.target.value})}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-black/40 p-5 rounded-2xl border border-kalian-gold/10 group">
                    <input 
                      type="checkbox" 
                      id="recurrente-teacher"
                      className="w-5 h-5 accent-kalian-gold bg-transparent border-kalian-gold/20 rounded"
                      checked={nuevaSesion.esRecurrente}
                      onChange={e => setNuevaSesion({...nuevaSesion, esRecurrente: e.target.checked})}
                    />
                    <label htmlFor="recurrente-teacher" className="text-[10px] font-black uppercase text-kalian-gold/60 cursor-pointer tracking-widest">
                      {t('teacher.isRecurrent')}
                    </label>
                  </div>

                  {nuevaSesion.esRecurrente && (
                    <div className="space-y-4 bg-kalian-gold/5 p-6 rounded-[2rem] border border-kalian-gold/10 animate-in fade-in zoom-in-95 duration-300">
                      <p className="text-[9px] font-black text-kalian-gold/60 uppercase tracking-[0.2em] mb-4">{t('teacher.selectDays')}</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 1, label: 'L' },
                          { id: 2, label: 'M' },
                          { id: 3, label: 'X' },
                          { id: 4, label: 'J' },
                          { id: 5, label: 'V' },
                          { id: 6, label: 'S' },
                          { id: 7, label: 'D' }
                        ].map(day => (
                          <button
                            key={day.id}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const current = [...nuevaSesion.diasSemana];
                              if (current.includes(day.id)) {
                                setNuevaSesion({ ...nuevaSesion, diasSemana: current.filter(d => d !== day.id) });
                              } else {
                                setNuevaSesion({ ...nuevaSesion, diasSemana: [...current, day.id].sort() });
                              }
                            }}
                            className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all border ${
                              nuevaSesion.diasSemana.includes(day.id) 
                                ? 'bg-kalian-gold border-kalian-gold text-black shadow-lg shadow-kalian-gold/20' 
                                : 'bg-black/40 border-kalian-gold/10 text-kalian-gold/40 hover:border-kalian-gold/30'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[8px] font-black text-kalian-gold/40 uppercase tracking-[0.2em] leading-relaxed mt-4">
                        {t('teacher.repeatUntil', { date: cursos.find(c => c.id === gestionandoSesiones)?.fechaFin || '' })}
                      </p>
                    </div>
                  )}

                  {conflictos.length > 0 && (
                    <div className="bg-red-500/10 p-5 rounded-2xl border border-red-500/20 animate-in shake-1 duration-500">
                      <p className="text-[9px] font-black text-red-500 uppercase mb-3 tracking-widest">{t('teacher.conflictsDetected')}</p>
                      <div className="flex flex-wrap gap-2">
                        {conflictos.map(f => (
                          <span key={f} className="bg-red-500/20 text-red-200 px-3 py-1.5 rounded-lg text-[8px] font-mono border border-red-500/30">{f}</span>
                        ))}
                      </div>
                      <p className="text-[8px] text-red-500/60 mt-3 italic">{t('teacher.conflictsHint')}</p>
                    </div>
                  )}

                  <button className="w-full bg-kalian-gold text-black p-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] shadow-2xl shadow-kalian-gold/20 hover:bg-white transition-all active:scale-95">
                    {nuevaSesion.esRecurrente ? t('teacher.generateSeries') : t('teacher.addSession')}
                  </button>
                </form>

                {/* Listado de Sesiones */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-kalian-gold/40 tracking-[0.3em] ml-4 italic">{t('teacher.scheduledSessions')}</h4>
                  {sesiones.length === 0 ? (
                    <div className="bg-black/20 p-12 rounded-[2rem] text-center border border-dashed border-kalian-gold/10">
                      <p className="text-kalian-gold/20 font-black uppercase tracking-widest italic text-xs">{t('teacher.noSessions')}</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {sesiones.map(s => (
                        <div key={s.id} className="flex items-center justify-between bg-black/40 p-5 rounded-2xl border border-kalian-gold/10 group hover:border-kalian-gold/30 transition-all">
                          <div className="flex items-center gap-5">
                            <div className="bg-kalian-gold/10 text-kalian-gold p-4 rounded-xl font-black text-center min-w-[70px] border border-kalian-gold/10">
                              <p className="text-[8px] uppercase tracking-widest mb-1 opacity-40">{t('teacher.day')}</p>
                              <p className="text-lg leading-none">{s.fecha.split('-')[2]}</p>
                            </div>
                            <div>
                              <p className="text-xs font-black text-kalian-cream uppercase tracking-widest">
                                {s.fecha} {s.esRecurrente && <span className="ml-2 text-kalian-gold">🔁</span>}
                              </p>
                              <p className="text-[10px] font-bold text-kalian-gold/60 uppercase tracking-[0.2em] mt-1">
                                {s.hora_inicio} - {s.hora_fin} | {s.sala}
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => eliminarSesion(s.id)}
                            className="text-red-500/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-3 hover:bg-red-500/10 rounded-xl"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
