import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, getDocsFromServer, limit, doc, setDoc, getDoc, query, orderBy, DocumentData, where, onSnapshot, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createSocioAuth } from '../../lib/adminAuth';
import { sendWelcomeEmail, sendMembershipUpdateEmail } from '../../lib/brevoService';
import { updateDoc, increment } from 'firebase/firestore';
import { registrarIngreso, MetodoPago } from '../../lib/finanzas';
import { fetchConfig } from '../../lib/configService';
import { syncSocioStatus } from '../../lib/socioService';

import { motion, AnimatePresence } from 'motion/react';

const AdminSocios = () => {
  const { user } = useAuth();
  const [socios, setSocios] = useState<DocumentData[]>([]);
  const [pagosMensuales, setPagosMensuales] = useState<Record<string, any>>({});
  const [cursosExistentes, setCursosExistentes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ dni: '', nombre: '', email: '' });
  const [msg, setMsg] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Efectivo');
  const [cleaning, setCleaning] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [formEdit, setFormEdit] = useState<any>({});
  const [cuotaGlobal, setCuotaGlobal] = useState(15);
  const [tabActiva, setTabActiva] = useState<'activos' | 'inactivos'>('activos');
  const [filtroPago, setFiltroPago] = useState<'todos' | 'pagado' | 'pendiente'>('todos');
  const [showDuplicados, setShowDuplicados] = useState(false);
  const hoy = new Date().toISOString().split('T')[0];

  // Detecta socios duplicados: mismo nombre (normalizado) o mismo email (normalizado).
  // Devuelve grupos de >=2 docs.
  const detectarGruposDuplicados = (): DocumentData[][] => {
    const porNombre = new Map<string, DocumentData[]>();
    const porEmail = new Map<string, DocumentData[]>();
    for (const s of socios) {
      const n = (s.nombre || '').trim().toLowerCase();
      const e = (s.email || '').trim().toLowerCase();
      if (n && n.length > 2) {
        if (!porNombre.has(n)) porNombre.set(n, []);
        porNombre.get(n)!.push(s);
      }
      if (e) {
        if (!porEmail.has(e)) porEmail.set(e, []);
        porEmail.get(e)!.push(s);
      }
    }
    const grupos: DocumentData[][] = [];
    const vistos = new Set<string>();
    const add = (grupo: DocumentData[]) => {
      if (grupo.length < 2) return;
      const key = grupo.map(s => s.id).sort().join('|');
      if (vistos.has(key)) return;
      vistos.add(key);
      grupos.push(grupo);
    };
    for (const g of porNombre.values()) add(g);
    for (const g of porEmail.values()) add(g);
    return grupos;
  };

  const purgarResiduosBorrados = async () => {
    if (!window.confirm("Busca socios con deletedAt y limpia residuos: localId y membresias.local en socios + pagos_mensuales asociados que sigan en pagado:true. ¿Continuar?")) return;
    try {
      const snap = await getDocs(collection(db, "socios"));
      const borrados = snap.docs.filter(d => !!d.data().deletedAt);
      const sucios = borrados.filter(d => {
        const data = d.data();
        return data.localId || data.membresias?.local;
      });

      // Limpiar residuos en socios
      if (sucios.length > 0) {
        const batch = writeBatch(db);
        sucios.forEach(d => batch.update(d.ref, {
          localId: deleteField(),
          'membresias.local': deleteField()
        }));
        await batch.commit();
      }

      // Limpiar pagos_mensuales huérfanos:
      //  - socio borrado (deletedAt), o
      //  - socio inexistente (hard-deleted directamente en Firestore).
      let pagosLimpiados = 0;
      const idsVivos = new Set(snap.docs.filter(d => !d.data().deletedAt).map(d => d.id));
      const pagosSnap = await getDocs(collection(db, "pagos_mensuales"));
      const pagosSucios = pagosSnap.docs.filter(p => {
        const data = p.data();
        return data.pagado === true && !idsVivos.has(data.socioId);
      });
      if (pagosSucios.length > 0) {
        const batchPagos = writeBatch(db);
        pagosSucios.forEach(p => batchPagos.update(p.ref, {
          pagado: false,
          bloqueado: false,
          localId: deleteField(),
          actualizadoPor: 'admin_purga_residuos',
          fechaActualizacion: new Date().toISOString()
        }));
        await batchPagos.commit();
        pagosLimpiados = pagosSucios.length;
      }

      if (sucios.length === 0 && pagosLimpiados === 0) {
        alert("✨ No hay residuos que limpiar.");
        return;
      }
      setMsg(`✅ Limpiados ${sucios.length} socio(s) y ${pagosLimpiados} pago(s) huérfano(s)`);
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      console.error(err);
      alert("Error en la purga");
    }
  };

  const handleDeleteDuplicado = async (id: string) => {
    if (!window.confirm(`¿Borrar definitivamente el socio "${id}"?\n\nSe hace soft-delete (deletedAt). Esto NO ajusta entradas existentes en pagos_mensuales ni en finanzas: si este socio ya generó un pago de local este mes, reversa el pago del local antes de borrarlo.`)) return;
    try {
      await updateDoc(doc(db, "socios", id), {
        deletedAt: serverTimestamp(),
        localId: deleteField(),
        'membresias.local': deleteField()
      });
      setMsg("✅ Duplicado movido a la papelera");
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al borrar duplicado");
    }
  };

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();

  useEffect(() => { 
    if (!user) return;
    
    fetchConfig().then(conf => setCuotaGlobal(conf.cuotaMensualSocio));

    // Real-time socios
    const qSocios = query(collection(db, "socios"));
    const unsubSocios = onSnapshot(qSocios, (snap) => {
      const allSocios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = allSocios.filter((s: any) => !s.deletedAt);
      filtered.sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''));
      setSocios(filtered);
      setLoading(false);
    }, (err) => {
      console.error("AdminSocios: Error en socios onSnapshot:", err.message);
      setMsg("❌ Error de permisos: " + err.message);
      setLoading(false);
    });

    // Real-time payments
    const qPagos = query(
      collection(db, "pagos_mensuales"),
      where("mes", "==", mesActual),
      where("anio", "==", anioActual)
    );
    const unsubPagos = onSnapshot(qPagos, (snap) => {
      const mapPagos: Record<string, any> = {};
      snap.docs.forEach(d => {
        mapPagos[d.data().socioId] = d.data();
      });
      setPagosMensuales(mapPagos);
    }, (err) => {
      console.error("AdminSocios: Error en pagos onSnapshot:", err.message);
    });

    // Fetch courses once (they don't change often)
    getDocs(collection(db, "cursos")).then(cursosSnap => {
      const ids = new Set(cursosSnap.docs.map(d => d.id));
      setCursosExistentes(ids);
    }).catch(err => console.error("AdminSocios: Error cursos getDocs:", err.message));

    return () => {
      unsubSocios();
      unsubPagos();
    };
  }, [mesActual, anioActual, user]);

  const handleCleanup = async () => {
    if (!window.confirm(
      "¿Bloquear y anonimizar soci@s con más de 4 meses de inactividad?\n\n" +
      "Por obligación contable y fiscal (LGT art. 66 y CCom art. 30) no se pueden borrar " +
      "los datos asociados a pagos: se anonimizan los datos personales (nombre, email) y " +
      "el documento queda 'bloqueado' a disposición exclusiva de autoridades durante el " +
      "plazo de prescripción de las acciones legales.\n\n" +
      "Esta acción NO borra finanzas, pagos_mensuales ni asistencias asociadas."
    )) return;
    setCleaning(true);
    try {
      const cuatroMesesAtras = new Date();
      cuatroMesesAtras.setMonth(cuatroMesesAtras.getMonth() - 4);
      const limiteIso = cuatroMesesAtras.toISOString().split('T')[0];

      let bloqueados = 0;
      for (const s of socios) {
        if (s.bloqueado) continue;
        const exp = s.membresias || {};
        const fechas = Object.values(exp) as string[];

        // Si no tiene ninguna fecha de expiración o todas son muy antiguas
        const ultimaExp = fechas.length > 0 ? fechas.sort().reverse()[0] : s.fechaAlta?.split('T')[0] || '1900-01-01';

        if (ultimaExp < limiteIso) {
          await updateDoc(doc(db, "socios", s.id), {
            bloqueado: true,
            fechaBloqueo: serverTimestamp(),
            deletedAt: serverTimestamp(),
            nombre: 'ANONIMIZADO',
            email: deleteField(),
            telefono: deleteField(),
            foto: deleteField(),
            estado: 'inactivo',
            localId: deleteField(),
            'membresias.local': deleteField()
          });
          bloqueados++;
        }
      }
      setMsg(`✅ Limpieza completada: ${bloqueados} soci@s bloqueados y anonimizados`);
    } catch (err) {
      console.error(err);
      alert("Error en la limpieza");
    }
    setCleaning(false);
    setTimeout(() => setMsg(''), 5000);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar este socio? Se moverá a la papelera de reciclaje.")) return;
    try {
      await updateDoc(doc(db, "socios", id), {
        deletedAt: serverTimestamp()
      });
      setMsg("✅ Soci@s movido a la papelera");
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al eliminar");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.dni || !form.email) return;

    setLoading(true);
    try {
      const emailClean = form.email.trim().toLowerCase();
      const dniUpper = form.dni.toUpperCase();
      const socioRef = doc(db, "socios", dniUpper);
      const socioSnap = await getDoc(socioRef);

      if (socioSnap.exists() && !socioSnap.data().deletedAt) {
        alert("Este DNI ya está registrado como soci@s.");
        setLoading(false);
        return;
      }

      // 1. Create in Firebase Auth and send activation link
      let realUid = "manual-" + Math.random().toString(36).substring(7);
      try {
        const authResult = await createSocioAuth(emailClean);
        if (authResult.uid) realUid = authResult.uid;
        
        // Send welcome email via Brevo
        await sendWelcomeEmail(emailClean, form.nombre || "Socio Kalian", "https://kalian.es/login");
      } catch (err) {
        console.error("Error creating auth user or sending email:", err);
      }

      // 2. Save to Firestore
      await setDoc(socioRef, {
        dni: dniUpper,
        nombre: form.nombre,
        email: emailClean,
        uid: realUid,
        membresias: {},
        estado: 'inactivo',
        cursos: [],
        verificado: true,
        fechaAlta: new Date().toISOString(),
        deletedAt: null
      });

      setMsg("✅ Soci@s creado y email enviado");
      setTimeout(() => setMsg(''), 3000);
      setForm({ dni: '', nombre: '', email: '' });
      setShowForm(false);
    } catch (err) {
      console.error(err);
      alert("Error al crear soci@s");
    }
    setLoading(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateDoc(doc(db, "socios", editando.id), formEdit);
      await syncSocioStatus(editando.id);
      await sendMembershipUpdateEmail(formEdit.email, formEdit.nombre, editando.uid, formEdit.membresias || {});
      setMsg("✅ Soci@s actualizado y email enviado");
      setTimeout(() => setMsg(''), 3000);
      setEditando(null);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar");
    }
    setLoading(false);
  };

  const togglePago = async (socio: any, valorActual: boolean) => {
    try {
      const socioId = socio.dni;
      const pagoId = `${anioActual}_${mesActual}_${socioId}`;
      const pagoRef = doc(db, "pagos_mensuales", pagoId);
      const snap = await getDoc(pagoRef);

      if (snap.exists() && snap.data().bloqueado && valorActual) {
        if (!window.confirm("⚠️ Este pago está BLOQUEADO. ¿Estás seguro de que quieres desbloquearlo y marcarlo como pendiente?")) return;
      }

      const nuevoEstado = !valorActual;
      const monto = calcularMontoAportacion(socio);
      const batch = writeBatch(db);

      if (nuevoEstado) {
        // MARCAR COMO PAGADO
        batch.set(pagoRef, {
          socioId,
          mes: mesActual,
          anio: anioActual,
          pagado: true,
          bloqueado: true,
          monto: monto,
          actualizadoPor: 'admin',
          fechaActualizacion: new Date().toISOString()
        }, { merge: true });

        // El registro en finanzas se hace vía registrarIngreso (que usa setDoc con ID determinista)
        // Pero para que sea atómico con el batch, deberíamos hacerlo manual aquí o asegurar que registrarIngreso sea llamado después.
        // Dado que registrarIngreso es async y usa setDoc, no podemos meterlo fácilmente en el batch sin duplicar lógica.
        // Sin embargo, el requisito dice "Usa un writeBatch para asegurar que tanto la eliminación de la transacción como la actualización del socio ocurran juntas".
        // Esto aplica sobre todo a la ELIMINACIÓN (reversión).
        
        await batch.commit();

        await registrarIngreso({
          monto: monto,
          concepto: `Cuota Soci@ ${meses[mesActual-1]} ${anioActual}`,
          categoria: 'Socio',
          metodo: metodoPago,
          socio_id: socioId,
          mes: mesActual,
          anio: anioActual
        });
        await syncSocioStatus(socio.id);
      } else {
        // REVERSIÓN
        batch.update(pagoRef, {
          pagado: false,
          bloqueado: false,
          monto: 0,
          actualizadoPor: 'admin',
          fechaActualizacion: new Date().toISOString()
        });

        // Los pagos cubiertos por local no tienen un doc CUOTA_* en finanzas (es un bulk por local).
        // Solo intentamos borrar la transacción de finanzas para pagos directos de socio.
        const esLocal = snap.exists() && snap.data().localId;
        if (!esLocal) {
          const finanzaId = `CUOTA_${anioActual}_${mesActual}_${socioId}`;
          batch.update(doc(db, "finanzas", finanzaId), {
            deletedAt: serverTimestamp()
          });
        }

        await batch.commit();
        await syncSocioStatus(socio.id);
      }
    } catch (err) {
      console.error(err);
      alert("Error al actualizar pago");
    }
  };

  const calcularMontoAportacion = (socio: any) => {
    const cursos = socio.cursos || [];
    // Lógica Senior Logic Developer: 
    // Salsa solamente: 15€
    // Bachata solamente: 15€
    // AMBOS: 25€ + 15€ cuota = 40€
    const tieneSalsa = cursos.some((cId: string) => cId.toLowerCase().includes('salsa'));
    const tieneBachata = cursos.some((cId: string) => cId.toLowerCase().includes('bachata') && !cId.toLowerCase().includes('coreográfico'));

    if (tieneSalsa && tieneBachata) {
      return 25 + cuotaGlobal; // 25€ extra + cuota base
    }
    return cuotaGlobal; // cuota base total
  };

  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <Link to="/staff" className="text-kalian-gold/40 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">← Volver al Panel</Link>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight">SOCI@S <span className="text-kalian-cream">KALIAN</span></h1>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-xl border border-kalian-gold/10">
              <p className="text-[8px] font-black text-kalian-gold/40 uppercase tracking-widest">Método Cobro:</p>
              <select 
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                className="bg-transparent text-[10px] text-kalian-gold font-bold outline-none cursor-pointer"
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Transferencia">Transferencia</option>
              </select>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-kalian-gold text-black px-8 py-3 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/10"
            >
              {showForm ? 'CANCELAR' : '+ NUEVO SOCI@S'}
            </button>
          </div>
        </header>

        {msg && <div className="bg-kalian-gold text-black p-5 rounded-3xl mb-12 kalian-poster-text text-xl text-center shadow-2xl animate-bounce">{msg}</div>}

        {showForm && (
          <form onSubmit={handleCreate} className="bg-black/40 border border-kalian-gold/20 p-10 rounded-[3rem] mb-12 space-y-6 animate-in slide-in-from-top-4 duration-500">
            <h2 className="text-3xl kalian-poster-text text-kalian-gold mb-6">ALTA DE SOCI@S</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/80 uppercase tracking-[0.3em] ml-4">DNI / NIE</p>
                <input 
                  type="text" placeholder="12345678X" 
                  className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold text-kalian-gold font-bold uppercase"
                  value={form.dni}
                  onChange={e => setForm({...form, dni: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/80 uppercase tracking-[0.3em] ml-4">Nombre Completo</p>
                <input 
                  type="text" placeholder="Nombre..." 
                  className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold text-kalian-gold font-bold"
                  value={form.nombre}
                  onChange={e => setForm({...form, nombre: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/80 uppercase tracking-[0.3em] ml-4">Email de Contacto</p>
                <input 
                  type="email" placeholder="tu@email.com" 
                  className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold text-kalian-gold font-bold"
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  required
                />
              </div>
            </div>
            <button 
              disabled={loading}
              className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-2xl shadow-kalian-gold/20 disabled:opacity-50"
            >
              {loading ? 'PROCESANDO...' : 'CREAR SOCI@S Y ENVIAR BIENVENIDA'}
            </button>
          </form>
        )}

        {loading && !showForm ? (
          <div className="text-center py-32 kalian-poster-text text-4xl text-kalian-gold/20 animate-pulse">CARGANDO SOCI@S...</div>
        ) : (() => {
          const esActivo = (s: any) => {
            const exp = s.membresias || {};
            return Object.keys(exp).some(cat => exp[cat] >= hoy);
          };
          const sociosActivos = socios.filter(esActivo);
          const sociosInactivos = socios.filter(s => !esActivo(s));
          const sociosActivosFiltrados = sociosActivos.filter(s => {
            if (filtroPago === 'todos') return true;
            const pagado = !!pagosMensuales[s.dni]?.pagado;
            return filtroPago === 'pagado' ? pagado : !pagado;
          });
          const sociosAMostrar = tabActiva === 'activos' ? sociosActivosFiltrados : sociosInactivos;
          const countPagados = sociosActivos.filter(s => !!pagosMensuales[s.dni]?.pagado).length;
          const countPendientes = sociosActivos.length - countPagados;

          const pillBase = 'px-6 py-3 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest transition-all';
          const pillActive = `${pillBase} bg-kalian-gold text-black shadow-lg shadow-kalian-gold/20`;
          const pillIdle = `${pillBase} text-kalian-gold/60 hover:text-kalian-gold`;
          const subFilterBase = 'px-5 py-2 rounded-2xl font-black uppercase text-[9px] tracking-widest border transition-all';
          const subFilterActive = `${subFilterBase} bg-kalian-gold/20 text-kalian-gold border-kalian-gold/40`;
          const subFilterIdle = `${subFilterBase} bg-black/40 text-kalian-gold/40 border-kalian-gold/10 hover:border-kalian-gold/30`;

          return (
            <>
              <div className="flex gap-2 mb-6 bg-black/40 p-2 rounded-[2rem] w-fit border border-kalian-gold/10">
                <button onClick={() => setTabActiva('activos')} className={tabActiva === 'activos' ? pillActive : pillIdle}>
                  Activos ({sociosActivos.length})
                </button>
                <button onClick={() => setTabActiva('inactivos')} className={tabActiva === 'inactivos' ? pillActive : pillIdle}>
                  Inactivos ({sociosInactivos.length})
                </button>
              </div>

              {tabActiva === 'activos' && (
                <div className="flex gap-2 mb-8 flex-wrap">
                  <button onClick={() => setFiltroPago('todos')} className={filtroPago === 'todos' ? subFilterActive : subFilterIdle}>
                    Todos ({sociosActivos.length})
                  </button>
                  <button onClick={() => setFiltroPago('pagado')} className={filtroPago === 'pagado' ? subFilterActive : subFilterIdle}>
                    ✅ Pagado {meses[mesActual - 1]} ({countPagados})
                  </button>
                  <button onClick={() => setFiltroPago('pendiente')} className={filtroPago === 'pendiente' ? subFilterActive : subFilterIdle}>
                    ❌ Pendiente ({countPendientes})
                  </button>
                </div>
              )}

              {tabActiva === 'inactivos' && (
                <div className="mb-8 flex justify-end gap-3 flex-wrap">
                  <button
                    onClick={() => setShowDuplicados(true)}
                    className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all"
                  >
                    🔍 Detectar duplicados
                  </button>
                  <button
                    onClick={purgarResiduosBorrados}
                    className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all"
                    title="Limpia localId y membresias.local en docs ya borrados (deletedAt)"
                  >
                    🧽 Purgar residuos
                  </button>
                  <button
                    onClick={handleCleanup}
                    disabled={cleaning}
                    className="bg-red-500/10 text-red-500 border border-red-500/20 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                  >
                    {cleaning ? 'BLOQUEANDO...' : '🔒 BLOQUEAR INACTIVOS 4M'}
                  </button>
                </div>
              )}

              <div className="grid gap-6">
                {sociosAMostrar.length === 0 && (
                  <div className="text-center py-32 bg-black/20 rounded-[3rem] border border-kalian-gold/10 border-dashed text-kalian-gold/20 kalian-poster-text text-4xl">
                    {tabActiva === 'activos'
                      ? (filtroPago === 'pagado' ? 'NADIE HA PAGADO AÚN'
                        : filtroPago === 'pendiente' ? 'TODOS HAN PAGADO ✨'
                        : 'NO HAY SOCI@S ACTIVOS')
                      : 'NO HAY SOCI@S INACTIVOS'}
                  </div>
                )}
                {sociosAMostrar.map(s => {
              const exp = s.membresias || {};
              const activas = Object.keys(exp).filter(cat => exp[cat] >= hoy);
              const estadoCalculado = activas.length > 0 ? 'activo' : 'inactivo';
              const emailNoVerificado = s.verificado === false;
              
              return (
                <div key={s.id} className="bg-black/40 p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-8 border border-kalian-gold/10 group hover:border-kalian-gold/40 transition-all duration-500">
                  <div className="flex items-center gap-8 w-full md:w-auto">
                    <div 
                      className="w-16 h-16 bg-kalian-gold/10 rounded-2xl flex items-center justify-center text-3xl border border-kalian-gold/20 relative cursor-help"
                      title={
                        emailNoVerificado 
                          ? "⚠️ ERROR: Email pendiente de validación o rebotado" 
                          : estadoCalculado === 'inactivo' 
                            ? "Socio Inactivo: Sin membresías vigentes" 
                            : "Socio Activo"
                      }
                    >
                      👤
                      <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-black ${emailNoVerificado ? 'bg-amber-500 animate-pulse' : (estadoCalculado === 'activo' ? 'bg-emerald-500' : 'bg-red-500')}`}></div>
                    </div>
                    <div>
                      <p className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors leading-none mb-2">{s.nombre || 'Sin nombre'}</p>
                      <div className="flex gap-4 items-center">
                        <p className="text-[10px] text-kalian-gold/80 font-mono font-black tracking-[0.2em] uppercase">{s.dni || s.id}</p>
                        <p className="text-[10px] text-kalian-gold/60 italic font-bold">{s.email}</p>
                      </div>
                      {s.cursos && s.cursos.filter((cId: string) => cursosExistentes.has(cId)).length > 0 && (
                        <div className="mt-4 flex gap-2 flex-wrap">
                          {s.cursos.filter((cId: string) => cursosExistentes.has(cId)).map((cId: string) => (
                            <span key={cId} className="text-[8px] font-black uppercase bg-kalian-gold/5 text-kalian-gold/60 px-3 py-1 rounded-full border border-kalian-gold/10 tracking-widest">{cId}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                    <div className="flex gap-4 flex-wrap justify-end w-full md:w-auto">
                      {/* Estado de Pago Mensual */}
                      <button 
                        onClick={() => togglePago(s, !!pagosMensuales[s.dni]?.pagado)}
                        className="flex flex-col items-center bg-black/20 p-3 rounded-2xl border border-kalian-gold/5 min-w-[120px] hover:bg-kalian-gold/5 transition-all relative"
                      >
                        <p className="text-[7px] font-black text-kalian-gold/80 uppercase tracking-widest mb-2">Aportación {meses[mesActual-1]}</p>
                        {pagosMensuales[s.dni]?.pagado ? (
                          <div className="flex flex-col items-center">
                            <span className="text-emerald-500 text-xs font-black">✅ PAGADO</span>
                            <span className="text-[8px] text-emerald-500/60 font-bold">{pagosMensuales[s.dni]?.monto || cuotaGlobal}€</span>
                            {pagosMensuales[s.dni]?.bloqueado && (
                              <span className="absolute -top-1 -right-1 text-[8px]">🔒</span>
                            )}
                            {pagosMensuales[s.dni]?.localId && (
                              <span className="text-[6px] text-emerald-500/40 font-black uppercase mt-1">Local: {pagosMensuales[s.dni].localId}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="text-red-500 text-xs font-black animate-pulse">❌ PENDIENTE</span>
                            <span className="text-[8px] text-red-500/60 font-bold">Sugerido: {calcularMontoAportacion(s)}€</span>
                          </div>
                        )}
                      </button>

                      {activas.map(cat => (
                        <div key={cat} className="flex flex-col items-end">
                          <span className="px-4 py-1.5 bg-kalian-gold text-black text-[10px] font-black uppercase rounded-xl shadow-xl shadow-kalian-gold/10 tracking-widest">{cat}</span>
                          <span className="text-[8px] font-black text-kalian-gold/80 mt-2 uppercase tracking-widest">Hasta {exp[cat]}</span>
                        </div>
                      ))}
                      {activas.length === 0 && <span className="px-6 py-2 bg-black/40 text-kalian-gold/20 font-black text-[10px] uppercase rounded-xl border border-kalian-gold/10 tracking-widest italic">Inactivo</span>}
                      <button 
                        onClick={() => {
                          setEditando(s);
                          setFormEdit({
                            nombre: s.nombre || '',
                            email: s.email || '',
                            membresias: s.membresias || {},
                            estado: s.estado || 'inactivo'
                          });
                        }}
                        className="p-3 bg-kalian-gold/10 text-kalian-gold rounded-xl border border-kalian-gold/20 hover:bg-kalian-gold/20 transition-all text-[10px] font-black uppercase tracking-widest"
                      >
                        EDITAR
                      </button>
                      <button 
                        onClick={() => handleDelete(s.id)}
                        disabled={(() => {
                          const fechas = Object.values(exp) as string[];
                          const ultimaExp = fechas.length > 0 ? fechas.sort().reverse()[0] : s.fechaAlta?.split('T')[0] || '1900-01-01';
                          const diff = new Date().getTime() - new Date(ultimaExp).getTime();
                          const dias = diff / (1000 * 60 * 60 * 24);
                          return dias < 120;
                        })()}
                        className="p-3 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Solo eliminable tras 120 días de inactividad"
                      >
                        ELIMINAR
                      </button>
                    </div>
                </div>
              );
            })}
              </div>
            </>
          );
        })()}

        {/* MODAL EDICIÓN */}
        <AnimatePresence>
          {editando && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 z-50"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-kalian-dark border border-kalian-gold/20 p-10 rounded-[3rem] w-full max-w-2xl shadow-2xl relative overflow-y-auto max-h-[90vh]"
              >
              <button onClick={() => setEditando(null)} className="absolute top-8 right-8 text-kalian-gold/40 hover:text-kalian-gold text-2xl">✕</button>
              <h2 className="text-4xl kalian-poster-text text-kalian-gold mb-8 italic uppercase tracking-tight">Editar Soci@s</h2>
              
              <form onSubmit={handleUpdate} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Nombre</p>
                    <input type="text" className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 text-kalian-cream outline-none focus:border-kalian-gold" value={formEdit.nombre} onChange={e => setFormEdit({...formEdit, nombre: e.target.value})} required />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Email</p>
                    <input type="email" className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 text-kalian-cream outline-none focus:border-kalian-gold" value={formEdit.email} onChange={e => setFormEdit({...formEdit, email: e.target.value})} required />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.3em] border-b border-kalian-gold/10 pb-2">Vigencia Membresías</p>
                  {['musica', 'danza', 'local'].map(cat => (
                    <div key={cat} className="flex items-center justify-between gap-4 bg-black/20 p-4 rounded-2xl border border-kalian-gold/5">
                      <span className="text-[10px] font-black uppercase text-kalian-cream/60 tracking-widest">{cat === 'musica' ? 'Music Is Cool' : cat === 'danza' ? 'Club de Baile' : 'Locales'}</span>
                      <input
                        type="date"
                        className="bg-transparent text-kalian-gold font-bold outline-none border-b border-kalian-gold/20 focus:border-kalian-gold"
                        value={formEdit.membresias?.[cat] || ''}
                        onChange={e => setFormEdit({
                          ...formEdit,
                          membresias: { ...formEdit.membresias, [cat]: e.target.value }
                        })}
                      />
                    </div>
                  ))}
                  {Object.keys(formEdit.membresias || {})
                    .filter(k => !['musica', 'danza', 'local'].includes(k) && formEdit.membresias[k])
                    .map(k => (
                      <div key={k} className="flex justify-between items-center bg-slate-50/5 px-4 py-2 rounded-xl border border-kalian-gold/10">
                        <span className="text-[9px] font-black uppercase text-kalian-gold/50">{k}</span>
                        <span className="text-[9px] font-black text-kalian-gold">Hasta {formEdit.membresias[k]}</span>
                      </div>
                    ))
                  }
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Estado General</p>
                  <select 
                    className="w-full p-4 bg-kalian-gold/5 rounded-xl border border-kalian-gold/10 text-kalian-gold font-bold outline-none"
                    value={formEdit.estado}
                    onChange={e => setFormEdit({...formEdit, estado: e.target.value})}
                  >
                    <option value="activo">ACTIVO</option>
                    <option value="inactivo">INACTIVO</option>
                  </select>
                </div>

                <button 
                  disabled={loading}
                  className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20"
                >
                  {loading ? 'GUARDANDO...' : 'ACTUALIZAR Y ENVIAR EMAIL'}
                </button>
              </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODAL DETECCIÓN DUPLICADOS */}
        {showDuplicados && (() => {
          const grupos = detectarGruposDuplicados();
          return (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDuplicados(false)}>
              <div className="bg-kalian-dark border border-amber-500/30 w-full max-w-3xl rounded-[3rem] shadow-2xl p-10 relative max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowDuplicados(false)} className="absolute top-8 right-8 text-kalian-gold/40 hover:text-kalian-gold text-2xl">×</button>
                <h3 className="text-3xl kalian-poster-text text-amber-500 mb-2 italic uppercase">Duplicados Detectados</h3>
                <p className="text-sm text-kalian-cream/70 mb-6">Soci@s agrupados por mismo nombre (normalizado) o mismo email.</p>

                {grupos.length === 0 ? (
                  <p className="text-center py-16 text-kalian-gold/30 font-black uppercase tracking-widest italic">✨ No se detectaron duplicados</p>
                ) : (
                  <div className="space-y-6">
                    {grupos.map((grupo, idx) => (
                      <div key={idx} className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                        <p className="text-[9px] font-black text-amber-500/60 uppercase tracking-[0.3em] mb-3">Grupo {idx + 1} — {grupo.length} coincidencias</p>
                        <div className="space-y-3">
                          {grupo.map((s: any) => {
                            const exp = s.membresias || {};
                            const activas = Object.keys(exp).filter(cat => exp[cat] >= hoy);
                            const estadoCalc = activas.length > 0 ? 'activo' : 'inactivo';
                            return (
                              <div key={s.id} className="bg-black/30 rounded-xl p-4 flex flex-col md:flex-row justify-between gap-3 border border-white/5">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-black text-kalian-cream uppercase italic">{s.nombre || '—'}</p>
                                  <div className="flex gap-4 flex-wrap mt-1">
                                    <span className="text-[10px] font-mono font-black text-kalian-gold/70">{s.id}</span>
                                    <span className="text-[10px] text-kalian-gold/40 italic">{s.email || 'sin email'}</span>
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${estadoCalc === 'activo' ? 'text-emerald-500' : 'text-red-500'}`}>{estadoCalc}</span>
                                    {s.localId && <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Local: {s.localId}</span>}
                                    {s.cursos?.length > 0 && <span className="text-[9px] text-kalian-gold/40">{s.cursos.length} curso(s)</span>}
                                  </div>
                                  <p className="text-[9px] text-kalian-gold/30 font-mono mt-1">Alta: {s.fechaAlta?.split?.('T')[0] || '—'}</p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                  <button
                                    onClick={() => { setShowDuplicados(false); setEditando(s); setFormEdit({ nombre: s.nombre || '', email: s.email || '', membresias: s.membresias || {}, estado: s.estado || 'inactivo' }); }}
                                    className="px-4 py-2 bg-kalian-gold/10 text-kalian-gold rounded-xl border border-kalian-gold/20 hover:bg-kalian-gold/20 text-[10px] font-black uppercase tracking-widest"
                                  >Editar</button>
                                  <button
                                    onClick={() => handleDeleteDuplicado(s.id)}
                                    className="px-4 py-2 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20 hover:bg-red-500 hover:text-white text-[10px] font-black uppercase tracking-widest"
                                  >Borrar</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
                      <p className="text-[10px] text-amber-300/80 leading-relaxed">
                        ⚠ Si el duplicado ya generó un pago de local este mes, <strong>reversa primero el pago del local en AdminLocales</strong> antes de borrarlo aquí; de lo contrario la entrada en finanzas seguirá contando ese socio fantasma. Tras borrar el duplicado, vuelve a marcar el pago del local: la nueva entrada se generará con el conteo correcto.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default AdminSocios;
