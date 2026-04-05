import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { collection, getDocs, updateDoc, doc, query, orderBy, DocumentData, where, setDoc, getDoc, getDocsFromServer, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

const TeacherDashboard = () => {
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursoSeleccionado, setCursoSeleccionado] = useState<DocumentData | null>(null);
  const [pagos, setPagos] = useState<Record<string, any>>({});
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const { user, socioData, logoutTeacher } = useAuth();

  const mesActual = new Date().getMonth() + 1;
  const anioActual = new Date().getFullYear();
  const mesAnioKey = `${anioActual}_${mesActual}`;

  const fetchCursos = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "cursos"), 
        where("profesorId", "==", user.uid)
      );
      let snap;
      try {
        snap = await getDocs(q);
      } catch (e: any) {
        console.warn("Error en query normal, intentando desde servidor:", e);
        snap = await getDocsFromServer(q);
      }
      setCursos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const fetchPagos = async () => {
    try {
      const q = query(
        collection(db, "pagos_mensuales"),
        where("mes", "==", mesActual),
        where("anio", "==", anioActual)
      );
      const snap = await getDocs(q);
      const pagosMap: Record<string, any> = {};
      snap.docs.forEach(d => {
        pagosMap[d.data().socioId] = d.data();
      });
      setPagos(pagosMap);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { 
    fetchCursos(); 
    fetchPagos();
  }, [user]);

  const toggleAforo = async (id: string, actual: boolean) => {
    try {
      await updateDoc(doc(db, "cursos", id), { aforo_disponible: !actual });
      fetchCursos();
    } catch (err) { console.error(err); }
  };

  const togglePago = async (socioId: string, campo: 'aportacionKalian' | 'cuotaCurso', valorActual: boolean) => {
    const pagoId = `${anioActual}_${mesActual}_${socioId}`;
    const pagoRef = doc(db, "pagos_mensuales", pagoId);
    
    try {
      const snap = await getDoc(pagoRef);
      if (snap.exists()) {
        await updateDoc(pagoRef, {
          [campo]: !valorActual,
          actualizadoPor: user?.uid,
          fechaActualizacion: new Date().toISOString()
        });
      } else {
        await setDoc(pagoRef, {
          socioId,
          mes: mesActual,
          anio: anioActual,
          aportacionKalian: campo === 'aportacionKalian' ? !valorActual : false,
          cuotaCurso: campo === 'cuotaCurso' ? !valorActual : false,
          actualizadoPor: user?.uid,
          fechaActualizacion: new Date().toISOString()
        });
      }
      fetchPagos();
    } catch (err) { console.error(err); }
  };

  const subirDocumento = async (cursoId: string) => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const storageRef = ref(storage, `cursos/${cursoId}/${Date.now()}_${archivo.name}`);
      await uploadBytes(storageRef, archivo);
      const url = await getDownloadURL(storageRef);
      
      const docData = {
        nombre: archivo.name,
        url: url,
        fecha: new Date().toISOString(),
        path: storageRef.fullPath
      };

      await updateDoc(doc(db, "cursos", cursoId), {
        documentos: arrayUnion(docData)
      });

      setArchivo(null);
      fetchCursos();
      alert("✅ Documento subido con éxito");
    } catch (err) {
      console.error(err);
      alert("Error al subir documento");
    } finally {
      setSubiendo(false);
    }
  };

  const eliminarDocumento = async (cursoId: string, documento: any) => {
    if (!window.confirm("¿Seguro que quieres eliminar este documento?")) return;
    try {
      const storageRef = ref(storage, documento.path);
      await deleteObject(storageRef);
      
      await updateDoc(doc(db, "cursos", cursoId), {
        documentos: arrayRemove(documento)
      });
      
      fetchCursos();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar");
    }
  };

  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  return (
    <div className="min-h-screen bg-kalian-dark p-6 font-sans text-kalian-cream">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 flex justify-between items-end">
          <div>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold tracking-tight uppercase italic leading-none">PANEL <span className="text-kalian-cream">PROFESORES</span></h1>
            <p className="text-[10px] text-kalian-gold/40 font-black uppercase tracking-[0.4em] mt-4 ml-4">Gestión de Cursos y Pagos - {meses[mesActual-1]} {anioActual}</p>
            {user && <p className="text-[8px] text-kalian-gold/20 font-mono mt-2 ml-4">ID: {user.uid}</p>}
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => { fetchCursos(); fetchPagos(); }}
              className="bg-kalian-gold/5 text-kalian-gold/40 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:text-kalian-gold transition-all"
            >
              🔄 Refrescar
            </button>
            {socioData && (
              <Link 
                to="/home" 
                className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white hover:text-indigo-600 transition-all shadow-lg shadow-indigo-600/20"
              >
                Área Socio
              </Link>
            )}
            <button onClick={logoutTeacher} className="bg-kalian-gold/10 text-kalian-gold px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-kalian-gold hover:text-black transition-all">SALIR</button>
          </div>
        </header>

        {loading ? (
          <div className="text-center py-20 text-kalian-gold/40 font-black uppercase tracking-widest animate-pulse">Cargando tus cursos...</div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* LISTA DE CURSOS */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest mb-6 ml-4 italic">Mis Cursos</h2>
              {cursos.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => setCursoSeleccionado(c)}
                  className={`p-8 rounded-[2.5rem] border transition-all cursor-pointer group ${cursoSeleccionado?.id === c.id ? 'bg-kalian-gold/20 border-kalian-gold shadow-2xl' : 'bg-black/40 border-kalian-gold/10 hover:border-kalian-gold/30'}`}
                >
                  <h3 className="text-2xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors uppercase italic leading-none">{c.titulo}</h3>
                  <p className="text-[9px] text-kalian-gold/40 font-black uppercase tracking-[0.3em] mt-2">
                    {c.horario} | {c.alumnos?.length || 0} Alumnos
                  </p>
                  <div className="mt-4 flex justify-between items-center">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${c.aforo_disponible ? 'text-emerald-500' : 'text-red-500'}`}>
                      {c.aforo_disponible ? 'Abierto' : 'Completo'}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleAforo(c.id, c.aforo_disponible !== false); }}
                      className="text-[8px] font-black uppercase tracking-widest text-kalian-gold/30 hover:text-kalian-gold transition-all"
                    >
                      Alternar Aforo
                    </button>
                  </div>
                </div>
              ))}
              {cursos.length === 0 && (
                <div className="bg-black/20 p-10 rounded-[2.5rem] text-center border border-dashed border-kalian-gold/10">
                  <p className="text-kalian-gold/20 font-black uppercase tracking-widest italic text-xs">No tienes cursos asignados</p>
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
                      <p className="text-[10px] text-kalian-gold/40 font-black uppercase tracking-[0.4em] mt-3 ml-4">Control de Asistencia y Pagos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl kalian-poster-text text-kalian-cream leading-none">{cursoSeleccionado.alumnos?.length || 0}</p>
                      <p className="text-[8px] font-black text-kalian-gold/20 uppercase tracking-widest">Alumnos</p>
                    </div>
                  </div>

                  {/* GESTIÓN DE DOCUMENTOS */}
                  <div className="mb-12 bg-kalian-gold/5 p-8 rounded-[2rem] border border-kalian-gold/10">
                    <h3 className="text-sm font-black uppercase tracking-widest text-kalian-gold mb-6 italic">Documentos del Curso</h3>
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
                        <p className="col-span-full text-[10px] text-kalian-gold/20 font-black uppercase tracking-widest text-center py-4 italic">No hay documentos subidos</p>
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
                        {subiendo ? 'Subiendo...' : 'Subir Documento'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 text-[9px] font-black text-kalian-gold/30 uppercase tracking-widest border-b border-kalian-gold/10">
                      <div className="col-span-6">Alumno</div>
                      <div className="col-span-3 text-center">Aportación Kalian</div>
                      <div className="col-span-3 text-center">Cuota Curso</div>
                    </div>

                    {cursoSeleccionado.alumnos?.map((alumno: any, idx: number) => {
                      const pagoSocio = pagos[alumno.dni] || {};
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-4 px-6 py-5 bg-kalian-gold/5 rounded-2xl items-center hover:bg-kalian-gold/10 transition-all group">
                          <div className="col-span-6">
                            <p className="font-black text-kalian-cream uppercase italic group-hover:text-kalian-gold transition-colors">{alumno.nombre}</p>
                            <p className="text-[8px] text-kalian-gold/30 font-bold tracking-widest mt-1">{alumno.dni}</p>
                          </div>
                          <div className="col-span-3 flex justify-center">
                            <button 
                              onClick={() => togglePago(alumno.dni, 'aportacionKalian', !!pagoSocio.aportacionKalian)}
                              className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${pagoSocio.aportacionKalian ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20' : 'bg-black/40 border-kalian-gold/20 text-transparent hover:border-kalian-gold/40'}`}
                            >
                              {pagoSocio.aportacionKalian ? '✓' : ''}
                            </button>
                          </div>
                          <div className="col-span-3 flex justify-center">
                            <button 
                              onClick={() => togglePago(alumno.dni, 'cuotaCurso', !!pagoSocio.cuotaCurso)}
                              className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${pagoSocio.cuotaCurso ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' : 'bg-black/40 border-kalian-gold/20 text-transparent hover:border-kalian-gold/40'}`}
                            >
                              {pagoSocio.cuotaCurso ? '✓' : ''}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {(!cursoSeleccionado.alumnos || cursoSeleccionado.alumnos.length === 0) && (
                      <div className="py-20 text-center">
                        <p className="text-kalian-gold/20 font-black uppercase tracking-widest italic text-xs">No hay alumnos inscritos en este curso</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-black/20 rounded-[3rem] border border-dashed border-kalian-gold/10 p-20 text-center">
                  <div className="text-6xl mb-8 opacity-20">📋</div>
                  <h3 className="text-2xl kalian-poster-text text-kalian-gold/40 uppercase italic mb-4">Selecciona un curso</h3>
                  <p className="text-[10px] text-kalian-gold/20 font-black uppercase tracking-widest max-w-xs">
                    Elige un curso de la lista de la izquierda para gestionar los alumnos y sus pagos mensuales.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
