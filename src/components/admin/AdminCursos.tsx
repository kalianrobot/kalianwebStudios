import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, DocumentData, updateDoc, getDoc, arrayUnion, increment, where, writeBatch, arrayRemove } from 'firebase/firestore';
import { Link } from 'react-router-dom';

import { createSocioAuth } from '../../lib/adminAuth';
import { sendWelcomeEmail } from '../../lib/brevoService';

const AdminCursos = () => {
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [profesores, setProfesores] = useState<DocumentData[]>([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ 
    titulo: '', 
    precio: '', 
    tiene_descuento: false,
    precio_descuento: '',
    precioTipo: 'mes', // 'mes' o 'clase'
    categoria: 'musica', 
    fechaInicio: '2025-09-01', 
    fechaFin: '2026-06-30', 
    aforo_disponible: true, 
    horario: '',
    tipoClase: 'presencial', // 'presencial' o 'online'
    frecuencia: 'semanal', // 'semanal', 'quincenal', 'mensual'
    profesorId: '',
    profesorNombre: '',
    descripcion: ''
  });
  const [editando, setEditando] = useState<string | null>(null);
  const [cursoSeleccionado, setCursoSeleccionado] = useState<string | null>(null);
  const [solicitudes, setSolicitudes] = useState<DocumentData[]>([]);
  const [manualAlumno, setManualAlumno] = useState({ dni: '', nombre: '', email: '' });

  const fetchCursos = async () => {
    const snap = await getDocs(query(collection(db, "cursos"), orderBy("categoria", "asc")));
    setCursos(snap.docs.map(d => ({ id: d.id, ...d.data() })));

    // Fetch solicitudes (reservas de cursos)
    const snapSol = await getDocs(query(collection(db, "reservas"), where("esCurso", "==", true)));
    setSolicitudes(snapSol.docs.map(d => ({ id: d.id, ...d.data() })));

    // Fetch profesores
    const snapProf = await getDocs(query(collection(db, "profesores"), orderBy("nombre", "asc")));
    setProfesores(snapProf.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { fetchCursos(); }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const prof = profesores.find(p => p.id === form.profesorId);
      const cursoData = { 
        ...form, 
        profesorNombre: prof ? prof.nombre : form.profesorNombre,
        precio: Number(form.precio),
        precio_descuento: form.tiene_descuento ? Number(form.precio_descuento) : 0,
        aforo_actual: editando ? (cursos.find(c => c.id === editando)?.aforo_actual || 0) : 0,
        alumnos: editando ? (cursos.find(c => c.id === editando)?.alumnos || []) : [],
      };

      if (editando) {
        await updateDoc(doc(db, "cursos", editando), cursoData);
        setMsg("✅ Curso actualizado");
      } else {
        const anioMes = form.fechaInicio.substring(0, 7); 
        const slug = form.titulo.trim().replace(/\s+/g, '-').toUpperCase();
        const customId = `${anioMes}-${slug}`;
        await setDoc(doc(db, "cursos", customId), cursoData);
        setMsg("✅ Curso creado: " + customId);
      }
      
      setTimeout(() => setMsg(''), 3000);
      setForm({ 
        titulo: '', 
        precio: '', 
        tiene_descuento: false,
        precio_descuento: '',
        precioTipo: 'mes',
        categoria: 'musica', 
        fechaInicio: '2025-09-01', 
        fechaFin: '2026-06-30', 
        aforo_disponible: true, 
        horario: '',
        tipoClase: 'presencial',
        frecuencia: 'semanal',
        profesorId: '',
        profesorNombre: '',
        descripcion: ''
      });
      setEditando(null);
      fetchCursos();
    } catch (err) { alert("Error al guardar"); }
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
            await sendWelcomeEmail(email, nombre || "Socio Kalian", "https://kalian.es/login"); 
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
          expiraciones: { [categoria]: fechaFin },
          cursos: [cursoId], // Link to course
          verificado: true,
          fechaAlta: new Date().toISOString()
        });
      } else {
        // 2. Si existe, actualizamos su vigencia y datos si vienen de solicitud
        const updateData: any = {
          [`expiraciones.${categoria}`]: fechaFin,
          cursos: arrayUnion(cursoId), // Link to course
          verificado: true
        };
        if (nombre) updateData.nombre = nombre;
        if (email) updateData.email = email;
        
        await updateDoc(socioRef, updateData);
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
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Profesor/a</label>
                <select 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border border-slate-200 text-slate-900" 
                  value={form.profesorId} 
                  onChange={e => setForm({...form, profesorId: e.target.value})} 
                  required
                >
                  <option value="">Seleccionar Profesor</option>
                  {profesores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Categoría</label>
                <select className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border border-slate-200 text-slate-900" value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}>
                  <option value="musica">🎸 Music is cool</option>
                  <option value="danza">💃 Club de baile</option>
                  <option value="local">🏠 Locales</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Horario</label>
              <input type="text" placeholder="ej: Lunes y Martes 14:00-15:00" className="w-full p-5 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900" value={form.horario} onChange={e => setForm({...form, horario: e.target.value})} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Tipo de Clase</label>
                <select className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border border-slate-200 text-slate-900" value={form.tipoClase} onChange={e => setForm({...form, tipoClase: e.target.value})}>
                  <option value="presencial">Presencial</option>
                  <option value="online">Online</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Frecuencia</label>
                <select className="w-full p-5 bg-slate-50 rounded-2xl font-black uppercase border border-slate-200 text-slate-900" value={form.frecuencia} onChange={e => setForm({...form, frecuencia: e.target.value})}>
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </select>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Precio (€)</label>
                <div className="flex gap-2">
                  <input type="number" placeholder="Precio" className="flex-1 p-5 bg-slate-50 rounded-2xl outline-none font-bold border border-slate-200 text-slate-900" value={form.precio} onChange={e => setForm({...form, precio: e.target.value})} required />
                  <select className="p-5 bg-slate-50 rounded-2xl font-black uppercase border border-slate-200 text-slate-900" value={form.precioTipo} onChange={e => setForm({...form, precioTipo: e.target.value})}>
                    <option value="mes">/mes</option>
                    <option value="clase">/clase</option>
                  </select>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <input 
                  type="checkbox" 
                  className="w-6 h-6 rounded-lg accent-slate-900" 
                  checked={form.tiene_descuento} 
                  onChange={e => setForm({...form, tiene_descuento: e.target.checked})} 
                />
                <p className="text-[10px] font-black uppercase text-slate-900 tracking-widest">¿Descuento Socio?</p>
              </div>
              {form.tiene_descuento && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-4">Precio Socio (€)</label>
                  <input type="number" placeholder="Precio Socio" className="w-full p-5 bg-slate-50 rounded-2xl outline-none border border-slate-200 text-slate-900 font-bold" value={form.precio_descuento} onChange={e => setForm({...form, precio_descuento: e.target.value})} required />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Descripción del Curso</label>
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
                      titulo: '', precio: '', tiene_descuento: false, precio_descuento: '', precioTipo: 'mes', categoria: 'musica', 
                      fechaInicio: '2025-09-01', fechaFin: '2026-06-30', aforo_disponible: true, 
                      horario: '', tipoClase: 'presencial', frecuencia: 'semanal', profesor: '', descripcion: '' 
                    });
                  }}
                  className="bg-slate-200 text-slate-600 px-8 rounded-[2rem] font-black uppercase"
                >Cancelar</button>
              )}
            </div>
          </form>

          {/* LISTADO Y GESTIÓN */}
          <div className="space-y-4">
            <h2 className="text-xl font-black uppercase italic mb-4 ml-4 text-slate-400">Cursos Activos</h2>
            {cursos.map(c => (
              <div key={c.id} className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100 group">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-[9px] font-black uppercase bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full mb-2 inline-block">
                      {c.categoria === 'musica' ? 'Music is cool' : c.categoria === 'danza' ? 'Club de baile' : 'Locales'}
                    </span>
                    <h3 className="font-black text-2xl uppercase italic leading-none">{c.titulo}</h3>
                    <p className="text-[10px] text-indigo-500 font-black mt-1 uppercase tracking-widest">{c.horario} | {c.profesorNombre || c.profesor}</p>
                    <p className="text-[8px] text-slate-300 font-mono mt-1">ID Prof: {c.profesorId || 'SIN ID'}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-widest">{c.fechaInicio} al {c.fechaFin}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{c.precio}€/{c.precioTipo || 'mes'} | {c.tipoClase} | {c.frecuencia}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black italic ${c.aforo_disponible ? 'text-emerald-500' : 'text-red-500'}`}>
                      {c.aforo_disponible ? 'DISPONIBLE' : 'COMPLETO'}
                    </p>
                    <p className="text-[8px] font-black uppercase text-slate-300">{c.alumnos?.length || 0} Alumnos</p>
                  </div>
                </div>

                {cursoSeleccionado === c.id ? (
                  <div className="mt-6 bg-slate-50 p-6 rounded-3xl space-y-4 animate-in slide-in-from-top-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-400">Alta Manual de Alumno</h4>
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
                            precio: c.precio.toString(),
                            precioTipo: c.precioTipo || 'mes',
                            categoria: c.categoria,
                            fechaInicio: c.fechaInicio,
                            fechaFin: c.fechaFin,
                            aforo_disponible: c.aforo_disponible !== false,
                            horario: c.horario,
                            tipoClase: c.tipoClase || 'presencial',
                            frecuencia: c.frecuencia || 'semanal',
                            profesorId: c.profesorId || '',
                            profesorNombre: c.profesorNombre || c.profesor || '',
                            descripcion: c.descripcion || ''
                          });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="bg-indigo-100 text-indigo-600 px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-200 transition-all"
                      >Editar</button>
                      <button 
                        onClick={() => setCursoSeleccionado(c.id)}
                        className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all"
                      >+ Inscribir Alumno</button>
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
      </div>
    </div>
  );
};

export default AdminCursos;
