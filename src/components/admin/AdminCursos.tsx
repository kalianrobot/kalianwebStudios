import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, DocumentData, updateDoc, getDoc, arrayUnion, increment, where, writeBatch, arrayRemove, collectionGroup } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';

import { createSocioAuth } from '../../lib/adminAuth';
import { sendWelcomeEmail, sendMembershipUpdateEmail } from '../../lib/brevoService';

const AdminCursos = () => {
  const [searchParams] = useSearchParams();
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [profesores, setProfesores] = useState<DocumentData[]>([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ 
    titulo: '', 
    categoria: 'musica', 
    subcategoria: '',
    modalidades: [{ tipo: 'presencial', frecuencia: 'semanal', precio: '' }],
    fechaInicio: '2025-09-01', 
    fechaFin: '2026-06-30', 
    aforo_disponible: true, 
    horario: '',
    profesorId: '',
    profesorNombre: '',
    descripcion: '',
    ventajas: '',
    // Nuevos campos
    diasSemana: [1], 
    horaInicio: '18:00',
    horaFin: '19:30',
    sala: 'Sala Grande',
    programacionAutomatica: false
  });

  const [conflictosRealTime, setConflictosRealTime] = useState<string[]>([]);
  const [isCheckingConflictos, setIsCheckingConflictos] = useState(false);

  const subcategorias = {
    musica: ['Instrumento', 'Combo', 'Armonía moderna', 'Big Band', 'Master classes'],
    danza: ['Bachata', 'Bachata coreográfico', 'Salsa'],
    local: []
  };

  const getVentajasText = (cat: string) => {
    const catName = cat === 'musica' ? 'Music is Cool' : cat === 'danza' ? 'Club de Baile' : 'Kalian Hub';
    return `Este curso incluye el alta como soci@ de ${catName} y acceso a descuentos en actividades de la misma categoría.`;
  };
  const [editando, setEditando] = useState<string | null>(null);
  const [cursoSeleccionado, setCursoSeleccionado] = useState<string | null>(null);
  const [gestionandoSesiones, setGestionandoSesiones] = useState<string | null>(null);
  const [sesiones, setSesiones] = useState<DocumentData[]>([]);
  const [nuevaSesion, setNuevaSesion] = useState({ fecha: '', hora_inicio: '', hora_fin: '', sala: 'Sala Grande', esRecurrente: false });
  const [conflictos, setConflictos] = useState<string[]>([]);
  const [solicitudes, setSolicitudes] = useState<DocumentData[]>([]);
  const [manualAlumno, setManualAlumno] = useState({ dni: '', nombre: '', email: '' });

  const fetchCursos = async () => {
    const snap = await getDocs(query(collection(db, "cursos"), orderBy("categoria", "asc")));
    setCursos(snap.docs.map(d => ({ id: d.id, ...d.data() })));

    // Fetch solicitudes (reservas de cursos)
    const snapSol = await getDocs(query(collection(db, "reservas"), where("esCurso", "==", true)));
    setSolicitudes(snapSol.docs.map(d => ({ id: d.id, ...d.data() })));

    // Fetch profesores from the dedicated collection
    const snapProf = await getDocs(query(collection(db, "profesores"), orderBy("nombre", "asc")));
    setProfesores(snapProf.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { fetchCursos(); }, []);

  const checkSalaDisponibilidad = async () => {
    if (!form.diasSemana.length || !form.horaInicio || !form.horaFin || !form.fechaInicio || !form.fechaFin) return;
    
    setIsCheckingConflictos(true);
    const conflicts: string[] = [];
    
    try {
      const fechasAComprobar: string[] = [];
      const end = new Date(form.fechaFin);

      form.diasSemana.forEach(targetDay => {
        let current = new Date(form.fechaInicio);
        const targetDayJs = targetDay === 7 ? 0 : targetDay;

        while (current.getDay() !== targetDayJs) {
          current.setDate(current.getDate() + 1);
        }

        while (current <= end) {
          fechasAComprobar.push(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 7);
        }
      });

      if (fechasAComprobar.length === 0) {
        setConflictosRealTime([]);
        setIsCheckingConflictos(false);
        return;
      }

      // 1. Comprobar contra Eventos
      const snapE = await getDocs(query(collection(db, "eventos"), where("fecha", ">=", fechasAComprobar[0])));
      const eventosExistentes = snapE.docs.map(d => d.data());
      
      // 2. Comprobar contra todas las Sesiones
      const snapS = await getDocs(collectionGroup(db, "sesiones"));
      const sesionesExistentes = snapS.docs.map(d => ({ ...d.data(), cursoId: d.ref.parent.parent?.id }));

      for (const f of fechasAComprobar) {
        const hasEvento = eventosExistentes.some(ev => ev.fecha.startsWith(f));
        const hasSesion = sesionesExistentes.some((s: any) => 
          s.fecha === f && 
          s.sala === form.sala && 
          s.cursoId !== editando &&
          (
            (form.horaInicio >= s.hora_inicio && form.horaInicio < s.hora_fin) ||
            (form.horaFin > s.hora_inicio && form.horaFin <= s.hora_fin) ||
            (s.hora_inicio >= form.horaInicio && s.hora_inicio < form.horaFin)
          )
        );

        if (hasEvento || hasSesion) {
          conflicts.push(f);
        }
      }
      setConflictosRealTime(conflicts);
    } catch (err) {
      console.error(err);
    }
    setIsCheckingConflictos(false);
  };

  useEffect(() => {
    if (form.programacionAutomatica) {
      checkSalaDisponibilidad();
    } else {
      setConflictosRealTime([]);
    }
  }, [form.diasSemana, form.horaInicio, form.horaFin, form.sala, form.fechaInicio, form.fechaFin, form.programacionAutomatica, editando]);

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

      if (nuevaSesion.esRecurrente) {
        let current = new Date(nuevaSesion.fecha);
        const end = new Date(curso.fechaFin);
        
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
          s.sala === nuevaSesion.sala && 
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
      setMsg(`✅ ${sesionesAGuardar.length} sesiones añadidas`);
      setNuevaSesion({ fecha: '', hora_inicio: '', hora_fin: '', sala: 'Sala Grande', esRecurrente: false });
      fetchSesiones(gestionandoSesiones);
      setTimeout(() => setMsg(''), 3000);
    } catch (err) { 
      console.error(err);
      alert("Error al guardar sesiones"); 
    }
  };

  const eliminarSesion = async (sesionId: string) => {
    if (!gestionandoSesiones) return;
    if (window.confirm("¿Eliminar esta sesión?")) {
      await deleteDoc(doc(db, "cursos", gestionandoSesiones, "sesiones", sesionId));
      fetchSesiones(gestionandoSesiones);
    }
  };

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && cursos.length > 0) {
      const c = cursos.find(item => item.id === editId);
      if (c) {
        setEditando(c.id);
        setForm({
          titulo: c.titulo || '',
          categoria: c.categoria || 'musica',
          subcategoria: c.subcategoria || '',
          modalidades: c.modalidades || [{ tipo: 'presencial', frecuencia: 'semanal', precio: '' }],
          fechaInicio: c.fechaInicio || '2025-09-01',
          fechaFin: c.fechaFin || '2026-06-30',
          aforo_disponible: c.aforo_disponible !== false,
          horario: c.horario || '',
          profesorId: c.profesorId || '',
          profesorNombre: c.profesorNombre || c.profesor || '',
          descripcion: c.descripcion || '',
          ventajas: c.ventajas || '',
          diasSemana: c.diasSemana || [1],
          horaInicio: c.horaInicio || '18:00',
          horaFin: c.horaFin || '19:30',
          sala: c.sala || 'Sala Grande',
          programacionAutomatica: c.programacionAutomatica || false
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [searchParams, cursos]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.programacionAutomatica && conflictosRealTime.length > 0) {
      alert("⚠️ Hay conflictos de horario. Revisa el panel de validación.");
      return;
    }

    try {
      const prof = profesores.find(p => p.id === form.profesorId);
      const cursoData = { 
        ...form, 
        profesorNombre: prof ? prof.nombre : '',
        modalidades: form.modalidades.map(m => ({ ...m, precio: Number(m.precio) })),
        ventajas: getVentajasText(form.categoria),
        aforo_actual: editando ? (cursos.find(c => c.id === editando)?.aforo_actual || 0) : 0,
        alumnos: editando ? (cursos.find(c => c.id === editando)?.alumnos || []) : [],
      };

      const batch = writeBatch(db);
      let finalId = editando;

      if (editando) {
        batch.update(doc(db, "cursos", editando), cursoData);
      } else {
        const anioMes = form.fechaInicio.substring(0, 7); 
        const slug = form.titulo.trim().replace(/\s+/g, '-').toUpperCase();
        finalId = `${anioMes}-${slug}`;
        batch.set(doc(db, "cursos", finalId), cursoData);
      }

      // Programación Automática de Sesiones
      if (form.programacionAutomatica) {
        const end = new Date(form.fechaFin);
        
        form.diasSemana.forEach(targetDay => {
          let current = new Date(form.fechaInicio);
          const targetDayJs = targetDay === 7 ? 0 : targetDay;

          while (current.getDay() !== targetDayJs) {
            current.setDate(current.getDate() + 1);
          }

          while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            const sesionId = `${dateStr}_${form.horaInicio.replace(':', '')}`;
            const sesionRef = doc(db, "cursos", finalId!, "sesiones", sesionId);
            batch.set(sesionRef, {
              fecha: dateStr,
              hora_inicio: form.horaInicio,
              hora_fin: form.horaFin,
              sala: form.sala,
              esRecurrente: true
            });
            current.setDate(current.getDate() + 7);
          }
        });
      }

      await batch.commit();
      setMsg(editando ? "✅ Curso actualizado" : "✅ Curso creado");
      
      setTimeout(() => setMsg(''), 3000);
      setForm({ 
        titulo: '', 
        categoria: 'musica', 
        subcategoria: '',
        modalidades: [{ tipo: 'presencial', frecuencia: 'semanal', precio: '' }],
        fechaInicio: '2025-09-01', 
        fechaFin: '2026-06-30', 
        aforo_disponible: true, 
        horario: '',
        profesorId: '',
        profesorNombre: '',
        descripcion: '',
        ventajas: '',
        diasSemana: [1],
        horaInicio: '18:00',
        horaFin: '19:30',
        sala: 'Sala Grande',
        programacionAutomatica: false
      });
      setEditando(null);
      fetchCursos();
    } catch (err) { 
      console.error(err);
      alert("Error al guardar"); 
    }
  };

  const añadirAlumno = async (cursoId: string, aforoActual: number, aforoTotal: number, fechaFin: string, categoria: string, alumnoData?: { dni: string, nombre: string, email: string, reservaId?: string }) => {
    const dni = alumnoData ? alumnoData.dni : manualAlumno.dni;
    const nombre = alumnoData ? alumnoData.nombre : manualAlumno.nombre;
    const email = alumnoData ? alumnoData.email : manualAlumno.email;

    if (!dni) return;
    if (aforoActual >= aforoTotal) {
      alert("Aforo completo");
      return;
    }

    try {
      const dniUpper = dni.toUpperCase();
      const socioRef = doc(db, "socios", dniUpper);
      const socioSnap = await getDoc(socioRef);

      // 1. Si no existe el socio, lo creamos (perfil básico)
      if (!socioSnap.exists()) {
        // Create in Firebase Auth first to get a real UID and send activation link
        let realUid = "manual-" + Math.random().toString(36).substring(7);
        if (email) {
          try {
            const authResult = await createSocioAuth(email);
            if (authResult.uid) realUid = authResult.uid;
            
            // Send welcome email via Brevo
            // Note: Since we can't get the link string from client SDK, we inform the user
            // that they will receive a separate email from Firebase for activation.
            await sendWelcomeEmail(email, nombre || "Soci@s Kalian", "https://kalian.es/login"); 
            // We use the login link as a fallback, explaining in the email that they need to check their inbox for the activation link.
          } catch (err) {
            console.error("Error creating auth user or sending email:", err);
          }
        }

        await setDoc(socioRef, {
          dni: dniUpper,
          nombre: nombre || "Pendiente de registro",
          email: email || "",
          uid: realUid,
          membresias: { [categoria]: fechaFin },
          estado: 'activo',
          cursos: [cursoId], // Link to course
          verificado: true,
          fechaAlta: new Date().toISOString()
        });

        // Trigger membership update email for new socio
        await sendMembershipUpdateEmail(email || "", nombre || "Soci@s Kalian", realUid, { [categoria]: fechaFin });
      } else {
        // 2. Si existe, actualizamos su vigencia y datos si vienen de solicitud
        const updateData: any = {
          [`membresias.${categoria}`]: fechaFin,
          estado: 'activo',
          cursos: arrayUnion(cursoId), // Link to course
          verificado: true
        };
        if (nombre) updateData.nombre = nombre;
        if (email) updateData.email = email;
        
        await updateDoc(socioRef, updateData);

        // Trigger membership update email
        const finalSocioSnap = await getDoc(socioRef);
        if (finalSocioSnap.exists()) {
          const sData = finalSocioSnap.data();
          await sendMembershipUpdateEmail(sData.email, sData.nombre, sData.uid, sData.membresias || {});
        }
      }

      // 3. Añadir al curso y subir aforo
      await updateDoc(doc(db, "cursos", cursoId), {
        alumnos: arrayUnion(dniUpper),
        aforo_actual: increment(1)
      });

      // 4. Si viene de una solicitud, borrarla
      if (alumnoData?.reservaId) {
        await deleteDoc(doc(db, "reservas", alumnoData.reservaId));
      }

      setManualAlumno({ dni: '', nombre: '', email: '' });
      setCursoSeleccionado(null);
      fetchCursos();
      setMsg("✅ Alumno añadido con éxito");
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert("Error al añadir alumno");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto">
        <Link to="/staff" className="text-indigo-600 font-bold text-xs uppercase tracking-widest">← Volver</Link>
        <h1 className="text-4xl font-black italic uppercase mb-8 mt-2 tracking-tighter">Academia <span className="text-indigo-600">Kalian</span></h1>

        {msg && <div className="bg-emerald-500 text-white p-5 rounded-3xl mb-8 font-bold text-center shadow-xl animate-bounce">{msg}</div>}

        {/* SOLICITUDES PENDIENTES */}
        {solicitudes.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-black uppercase italic mb-6 ml-4 text-amber-600 flex items-center gap-2">
              ⚠️ Solicitudes de Inscripción Pendientes
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {solicitudes.map(s => (
                <div key={s.id} className="bg-amber-50 border border-amber-200 p-6 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[8px] font-black uppercase bg-amber-200 text-amber-700 px-2 py-1 rounded-lg">Solicitud</span>
                      <span className="text-[8px] font-mono text-amber-400">{s.ticketID}</span>
                    </div>
                    <h3 className="font-black text-lg uppercase italic leading-none mb-1">{s.slots[0].nombre}</h3>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">{s.slots[0].dni}</p>
                    <p className="text-[9px] text-amber-400 italic mb-4">{s.slots[0].email || 'Sin email'}</p>
                    <p className="text-[10px] font-black uppercase text-slate-400">Curso: <span className="text-slate-900">{s.eventoTitulo}</span></p>
                  </div>
                  
                  <button 
                    onClick={() => {
                      const curso = cursos.find(c => c.id === s.eventoId);
                      if (curso) {
                        añadirAlumno(curso.id, curso.aforo_actual, curso.aforo_total, curso.fechaFin, curso.categoria, {
                          dni: s.slots[0].dni,
                          nombre: s.slots[0].nombre,
                          email: s.slots[0].email,
                          reservaId: s.id
                        });
                      } else {
                        alert("Curso no encontrado");
                      }
                    }}
                    className="mt-4 w-full bg-amber-600 text-white p-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-amber-700 transition-all"
                  >
                    Aprobar Inscripción
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* FORMULARIO CREACIÓN / EDICIÓN */}
          <form onSubmit={guardar} className="bg-white p-10 rounded-[3rem] shadow-2xl space-y-5 h-fit border-t-[12px] border-slate-900 text-slate-900">
            <h2 className="text-xl font-black uppercase italic mb-4">{editando ? 'Editar Curso' : 'Nuevo Curso'}</h2>
            
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Nombre del Curso</label>
              <input type="text" placeholder="Nombre del Curso" className="w-full p-5 bg-slate-50 rounded-2xl outline-none focus:ring-2 ring-indigo-500 border border-slate-200 text-slate-900" value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Categoría</label>
                <select 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border border-slate-200 text-slate-900" 
                  value={form.categoria} 
                  onChange={e => setForm({...form, categoria: e.target.value as any, subcategoria: ''})}
                >
                  <option value="musica">🎸 Music is cool</option>
                  <option value="danza">💃 Club de baile</option>
                  <option value="local">🏠 Locales</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Subcategoría</label>
                <select 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border border-slate-200 text-slate-900" 
                  value={form.subcategoria} 
                  onChange={e => setForm({...form, subcategoria: e.target.value})}
                  required
                >
                  <option value="">Seleccionar...</option>
                  {subcategorias[form.categoria as keyof typeof subcategorias].map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 ml-4">Profesor/a (Staff)</label>
              <select 
                className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border border-slate-200 text-slate-900" 
                value={form.profesorId} 
                onChange={e => setForm({...form, profesorId: e.target.value})} 
              >
                <option value="">Seleccionar Profesor (Opcional)</option>
                {profesores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2rem] space-y-6 border border-indigo-500/30">
              <h3 className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em]">Horario del Curso</h3>
              
              <div className="space-y-3">
                <label className="text-[8px] font-black uppercase text-slate-500 ml-2">Días de la Semana</label>
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
                      onClick={() => {
                        const current = [...form.diasSemana];
                        if (current.includes(day.id)) {
                          setForm({ ...form, diasSemana: current.filter(d => d !== day.id) });
                        } else {
                          setForm({ ...form, diasSemana: [...current, day.id].sort() });
                        }
                      }}
                      className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all border ${
                        form.diasSemana.includes(day.id) 
                          ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' 
                          : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-500 ml-2">Inicio</label>
                  <input 
                    type="time" 
                    className="w-full p-4 bg-slate-800 rounded-xl text-xs font-bold text-white border border-slate-700 outline-none focus:border-indigo-500"
                    value={form.horaInicio}
                    onChange={e => setForm({...form, horaInicio: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-slate-500 ml-2">Fin</label>
                  <input 
                    type="time" 
                    className="w-full p-4 bg-slate-800 rounded-xl text-xs font-bold text-white border border-slate-700 outline-none focus:border-indigo-500"
                    value={form.horaFin}
                    onChange={e => setForm({...form, horaFin: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase text-slate-500 ml-2">Sala</label>
                <select 
                  className="w-full p-4 bg-slate-800 rounded-xl text-xs font-bold text-white border border-slate-700 outline-none focus:border-indigo-500"
                  value={form.sala}
                  onChange={e => setForm({...form, sala: e.target.value})}
                >
                  <option value="Sala Grande">Sala Grande</option>
                  <option value="Sala Pequeña">Sala Pequeña</option>
                  <option value="Estudio">Estudio</option>
                </select>
              </div>

              <div className="flex items-center justify-between bg-indigo-500/10 p-5 rounded-2xl border border-indigo-500/20">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="auto-prog"
                    className="w-5 h-5 accent-indigo-500"
                    checked={form.programacionAutomatica}
                    onChange={e => setForm({...form, programacionAutomatica: e.target.checked})}
                  />
                  <label htmlFor="auto-prog" className="text-[10px] font-black uppercase text-indigo-400 cursor-pointer tracking-widest">
                    Programación Automática
                  </label>
                </div>
                {form.programacionAutomatica && (
                  <span className="text-[9px] font-bold text-indigo-300 italic">
                    ~{Math.ceil((new Date(form.fechaFin).getTime() - new Date(form.fechaInicio).getTime()) / (7 * 24 * 60 * 60 * 1000))} sesiones
                  </span>
                )}
              </div>

              {form.programacionAutomatica && (
                <div className={`p-4 rounded-xl border transition-all ${conflictosRealTime.length > 0 ? 'bg-red-500/20 border-red-500/50' : 'bg-emerald-500/20 border-emerald-500/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${conflictosRealTime.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                    <p className={`text-[9px] font-black uppercase tracking-widest ${conflictosRealTime.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {isCheckingConflictos ? 'Verificando disponibilidad...' : conflictosRealTime.length > 0 ? 'Conflictos Detectados' : 'Horario Disponible'}
                    </p>
                  </div>
                  {conflictosRealTime.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {conflictosRealTime.slice(0, 5).map(f => (
                        <span key={f} className="text-[7px] bg-red-500/30 text-red-200 px-1.5 py-0.5 rounded font-mono">{f}</span>
                      ))}
                      {conflictosRealTime.length > 5 && <span className="text-[7px] text-red-300">+{conflictosRealTime.length - 5} más</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 ml-4">Horario (Texto para Web)</label>
              <input type="text" placeholder="ej: Lunes y Martes 14:00-15:00" className="w-full p-5 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.horario} onChange={e => setForm({...form, horario: e.target.value})} required />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center ml-4">
                <label className="text-[9px] font-black uppercase text-slate-600">Configurador de Modalidades</label>
                <button 
                  type="button"
                  onClick={() => setForm({...form, modalidades: [...form.modalidades, { tipo: 'presencial', frecuencia: 'semanal', precio: '' }]})}
                  className="text-[10px] font-black text-indigo-600 uppercase tracking-widest"
                >+ Añadir Fila</button>
              </div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 px-4">
                  <span className="text-[8px] font-black uppercase text-slate-400">Modalidad</span>
                  <span className="text-[8px] font-black uppercase text-slate-400">Frecuencia</span>
                  <span className="text-[8px] font-black uppercase text-slate-400">Aportación (€)</span>
                </div>
                {form.modalidades.map((mod, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-200 relative group">
                    <select 
                      className="p-3 bg-white rounded-xl text-[10px] font-black uppercase border border-slate-100"
                      value={mod.tipo}
                      onChange={e => {
                        const newMods = [...form.modalidades];
                        newMods[idx].tipo = e.target.value;
                        setForm({...form, modalidades: newMods});
                      }}
                    >
                      <option value="presencial">Presencial</option>
                      <option value="online">Online</option>
                    </select>
                    <select 
                      className="p-3 bg-white rounded-xl text-[10px] font-black uppercase border border-slate-100"
                      value={mod.frecuencia}
                      onChange={e => {
                        const newMods = [...form.modalidades];
                        newMods[idx].frecuencia = e.target.value;
                        setForm({...form, modalidades: newMods});
                      }}
                    >
                      <option value="semanal">Semanal</option>
                      <option value="quincenal">Quincenal</option>
                      <option value="mensual">Mensual</option>
                    </select>
                    <div className="relative">
                      <input 
                        type="number" 
                        placeholder="APORTACIÓN €"
                        className="w-full p-3 bg-white rounded-xl text-[10px] font-black border border-slate-100"
                        value={mod.precio}
                        onChange={e => {
                          const newMods = [...form.modalidades];
                          newMods[idx].precio = e.target.value;
                          setForm({...form, modalidades: newMods});
                        }}
                        required
                      />
                      {form.modalidades.length > 1 && (
                        <button 
                          type="button"
                          onClick={() => setForm({...form, modalidades: form.modalidades.filter((_, i) => i !== idx)})}
                          className="absolute -right-2 -top-2 w-5 h-5 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Fecha Inicio</label>
                <input type="date" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.fechaInicio} onChange={e => setForm({...form, fechaInicio: e.target.value})} required />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Fecha Fin</label>
                <input type="date" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.fechaFin} onChange={e => setForm({...form, fechaFin: e.target.value})} required />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Disponibilidad</label>
              <button 
                type="button"
                onClick={() => setForm({...form, aforo_disponible: !form.aforo_disponible})}
                className={`w-full p-5 rounded-2xl font-black uppercase tracking-widest transition-all ${form.aforo_disponible ? 'bg-emerald-100 text-emerald-600 border-emerald-200' : 'bg-red-100 text-red-600 border-red-200'} border`}
              >
                {form.aforo_disponible ? 'Plazas Libres' : 'Sin Plazas'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <p className="text-[10px] font-black uppercase text-slate-900 tracking-widest">Branding de Ventajas</p>
              </div>
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <p className="text-[9px] text-slate-400 italic leading-relaxed">
                  {getVentajasText(form.categoria)}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 ml-4">Descripción del Curso</label>
              <textarea placeholder="Información descriptiva del curso..." className="w-full p-5 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900 min-h-[100px]" value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} />
            </div>

            <div className="flex gap-3">
              <button className="flex-1 bg-slate-900 text-white p-6 rounded-[2rem] font-black uppercase shadow-2xl hover:bg-indigo-600 transition-all active:scale-95">
                {editando ? 'Actualizar Curso' : 'Publicar Curso'}
              </button>
              {editando && (
                <button 
                  type="button"
                  onClick={() => {
                    setEditando(null);
                    setForm({ 
                      titulo: '', 
                      categoria: 'musica', 
                      subcategoria: '',
                      modalidades: [{ tipo: 'presencial', frecuencia: 'semanal', precio: '' }],
                      fechaInicio: '2025-09-01', 
                      fechaFin: '2026-06-30', 
                      aforo_disponible: true, 
                      horario: '',
                      profesorId: '',
                      profesorNombre: '',
                      descripcion: '',
                      ventajas: ''
                    });
                  }}
                  className="bg-slate-200 text-slate-600 px-8 rounded-[2rem] font-black uppercase"
                >Cancelar</button>
              )}
            </div>
          </form>

          {/* LISTADO Y GESTIÓN */}
          <div className="space-y-4">
            <h2 className="text-xl font-black uppercase italic mb-4 ml-4 text-slate-600">Cursos Activos</h2>
            {cursos.map(c => (
              <div key={c.id} className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100 group">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full mb-2 inline-block">
                      {c.categoria === 'musica' ? 'Music is cool' : c.categoria === 'danza' ? 'Club de baile' : 'Locales'}
                    </span>
                    <h3 className="font-black text-2xl uppercase italic leading-none">{c.titulo}</h3>
                    <p className="text-[10px] text-indigo-500 font-black mt-1 uppercase tracking-widest">{c.horario} | {c.profesorNombre || c.profesor || 'Pendiente de asignar'}</p>
                    <p className="text-[8px] text-slate-500 font-mono mt-1">ID Prof: {c.profesorId || 'SIN ID'}</p>
                    <p className="text-[10px] text-slate-600 font-bold mt-2 uppercase tracking-widest">{c.fechaInicio} al {c.fechaFin}</p>
                    <div className="mt-2 space-y-1">
                      {c.modalidades?.map((m: any, i: number) => (
                        <p key={i} className="text-[9px] text-slate-700 font-bold uppercase tracking-widest">
                          {m.tipo} | {m.frecuencia} | {m.precio}€
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black italic ${c.aforo_disponible ? 'text-emerald-500' : 'text-red-500'}`}>
                      {c.aforo_disponible ? 'DISPONIBLE' : 'COMPLETO'}
                    </p>
                    <p className="text-[8px] font-black uppercase text-slate-500">{c.alumnos?.length || 0} Alumnos</p>
                  </div>
                </div>

                {cursoSeleccionado === c.id ? (
                  <div className="mt-6 bg-slate-50 p-6 rounded-3xl space-y-4 animate-in slide-in-from-top-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-600">Alta Manual de Alumno</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <input 
                        type="text" placeholder="DNI" 
                        className="p-4 bg-white rounded-xl font-black uppercase outline-none ring-2 ring-indigo-500 text-xs" 
                        value={manualAlumno.dni}
                        onChange={e => setManualAlumno({...manualAlumno, dni: e.target.value.toUpperCase()})}
                      />
                      <input 
                        type="text" placeholder="NOMBRE" 
                        className="p-4 bg-white rounded-xl font-bold outline-none ring-2 ring-indigo-500 text-xs" 
                        value={manualAlumno.nombre}
                        onChange={e => setManualAlumno({...manualAlumno, nombre: e.target.value})}
                      />
                    </div>
                    <input 
                      type="email" placeholder="EMAIL" 
                      className="w-full p-4 bg-white rounded-xl font-bold outline-none ring-2 ring-indigo-500 text-xs" 
                      value={manualAlumno.email}
                      onChange={e => setManualAlumno({...manualAlumno, email: e.target.value})}
                    />
                    <div className="flex gap-2">
                      <button 
                        onClick={() => añadirAlumno(c.id, c.aforo_actual || 0, c.aforo_total, c.fechaFin, c.categoria)}
                        className="flex-1 bg-indigo-600 text-white p-4 rounded-xl font-black uppercase text-xs"
                      >Añadir Alumno</button>
                      <button onClick={() => setCursoSeleccionado(null)} className="bg-slate-200 text-slate-500 px-6 rounded-xl font-bold">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 flex justify-between items-center">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setEditando(c.id);
                          setForm({
                            titulo: c.titulo,
                            categoria: c.categoria,
                            subcategoria: c.subcategoria || '',
                            modalidades: c.modalidades || [{ tipo: 'presencial', frecuencia: 'semanal', precio: '' }],
                            fechaInicio: c.fechaInicio,
                            fechaFin: c.fechaFin,
                            aforo_disponible: c.aforo_disponible !== false,
                            horario: c.horario,
                            profesorId: c.profesorId || '',
                            profesorNombre: c.profesorNombre || c.profesor || '',
                            descripcion: c.descripcion || '',
                            ventajas: c.ventajas || '',
                            diasSemana: c.diasSemana || [1],
                            horaInicio: c.horaInicio || '18:00',
                            horaFin: c.horaFin || '19:30',
                            sala: c.sala || 'Sala Grande',
                            programacionAutomatica: c.programacionAutomatica || false
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="bg-indigo-100 text-indigo-600 px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-200 transition-all"
                      >Editar</button>
                      <button 
                        onClick={() => setCursoSeleccionado(c.id)}
                        className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all"
                      >+ Inscribir Alumno</button>
                      <button 
                        onClick={() => {
                          setGestionandoSesiones(c.id);
                          fetchSesiones(c.id);
                        }}
                        className="bg-amber-100 text-amber-600 px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-amber-200 transition-all"
                      >📅 Sesiones</button>
                    </div>
                    <button 
                      onClick={async () => { 
                        if (window.confirm("¿Seguro que quieres eliminar este curso?")) {
                          try {
                            // 1. Limpiar referencias en socios
                            const sociosQuery = query(collection(db, "socios"), where("cursos", "array-contains", c.id));
                            const sociosSnap = await getDocs(sociosQuery);
                            
                            if (!sociosSnap.empty) {
                              const batch = writeBatch(db);
                              sociosSnap.docs.forEach(socioDoc => {
                                batch.update(socioDoc.ref, {
                                  cursos: arrayRemove(c.id)
                                });
                              });
                              await batch.commit();
                            }

                            // 2. Borrar el curso
                            await deleteDoc(doc(db, "cursos", c.id)); 
                            fetchCursos(); 
                            setMsg("✅ Curso eliminado y socios actualizados");
                            setTimeout(() => setMsg(''), 3000);
                          } catch (err) {
                            console.error(err);
                            alert("Error al eliminar el curso");
                          }
                        }
                      }} 
                      className="text-red-300 hover:text-red-500 font-bold text-[10px] uppercase"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* MODAL GESTIÓN SESIONES */}
        {gestionandoSesiones && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black italic uppercase">Gestionar Sesiones</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {cursos.find(c => c.id === gestionandoSesiones)?.titulo}
                  </p>
                </div>
                <button onClick={() => setGestionandoSesiones(null)} className="text-slate-400 hover:text-white text-2xl">×</button>
              </div>
              
              <div className="p-8 overflow-y-auto space-y-8">
                {/* Formulario Nueva Sesión */}
                <form onSubmit={guardarSesion} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Añadir Nueva Sesión</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Fecha</label>
                      <input 
                        type="date" 
                        className="w-full p-3 bg-white rounded-xl text-xs border border-slate-200"
                        value={nuevaSesion.fecha}
                        onChange={e => setNuevaSesion({...nuevaSesion, fecha: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Sala</label>
                      <select 
                        className="w-full p-3 bg-white rounded-xl text-xs border border-slate-200 uppercase font-bold"
                        value={nuevaSesion.sala}
                        onChange={e => setNuevaSesion({...nuevaSesion, sala: e.target.value})}
                      >
                        <option value="Sala Grande">Sala Grande</option>
                        <option value="Sala Pequeña">Sala Pequeña</option>
                        <option value="Estudio">Estudio</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Hora Inicio</label>
                      <input 
                        type="time" 
                        className="w-full p-3 bg-white rounded-xl text-xs border border-slate-200"
                        value={nuevaSesion.hora_inicio}
                        onChange={e => setNuevaSesion({...nuevaSesion, hora_inicio: e.target.value})}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Hora Fin</label>
                      <input 
                        type="time" 
                        className="w-full p-3 bg-white rounded-xl text-xs border border-slate-200"
                        value={nuevaSesion.hora_fin}
                        onChange={e => setNuevaSesion({...nuevaSesion, hora_fin: e.target.value})}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-100">
                    <input 
                      type="checkbox" 
                      id="recurrente"
                      className="w-5 h-5 accent-indigo-600"
                      checked={nuevaSesion.esRecurrente}
                      onChange={e => setNuevaSesion({...nuevaSesion, esRecurrente: e.target.checked})}
                    />
                    <label htmlFor="recurrente" className="text-[10px] font-black uppercase text-slate-600 cursor-pointer">
                      ¿Es una clase recurrente?
                    </label>
                  </div>

                  {nuevaSesion.esRecurrente && (
                    <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                      <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest">
                        🔄 Repetir semanalmente hasta el {cursos.find(c => c.id === gestionandoSesiones)?.fechaFin}
                      </p>
                    </div>
                  )}

                  {conflictos.length > 0 && (
                    <div className="bg-red-50 p-4 rounded-2xl border border-red-200">
                      <p className="text-[9px] font-black text-red-600 uppercase mb-2">⚠️ Conflictos detectados en:</p>
                      <div className="flex flex-wrap gap-2">
                        {conflictos.map(f => (
                          <span key={f} className="bg-red-100 text-red-700 px-2 py-1 rounded-lg text-[8px] font-mono">{f}</span>
                        ))}
                      </div>
                      <p className="text-[8px] text-red-400 mt-2 italic">No se puede crear la serie si hay choques de horario o sala.</p>
                    </div>
                  )}

                  <button className="w-full bg-indigo-600 text-white p-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-200">
                    {nuevaSesion.esRecurrente ? 'Generar Serie de Clases' : 'Añadir Sesión al Calendario'}
                  </button>
                </form>

                {/* Listado de Sesiones */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Sesiones Programadas</h4>
                  {sesiones.length === 0 ? (
                    <p className="text-center py-8 text-slate-400 italic text-sm">No hay sesiones programadas aún.</p>
                  ) : (
                    <div className="space-y-2">
                      {sesiones.map(s => (
                        <div key={s.id} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm group">
                          <div className="flex items-center gap-4">
                            <div className="bg-indigo-50 text-indigo-600 p-3 rounded-xl font-black text-center min-w-[60px]">
                              <p className="text-[8px] uppercase">Día</p>
                              <p className="text-sm">{s.fecha.split('-')[2]}</p>
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-900">
                                {s.fecha} {s.esRecurrente && '🔁'}
                              </p>
                              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                                {s.hora_inicio} - {s.hora_fin} | {s.sala}
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => eliminarSesion(s.id)}
                            className="text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2"
                          >
                            Eliminar
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

export default AdminCursos;
