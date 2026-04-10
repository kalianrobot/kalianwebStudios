import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, setDoc, getDoc, query, where, DocumentData, deleteDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { createSocioAuth } from '../../lib/adminAuth';
import { sendWelcomeEmail, sendMembershipUpdateEmail } from '../../lib/brevoService';

const AdminSolicitudes = () => {
  const [solicitudes, setSolicitudes] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    const q = query(collection(db, "solicitudes_cursos"), where("estado", "==", "pendiente"));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Orden manual por fecha descendente
      data.sort((a: any, b: any) => {
        const dateA = new Date(a.fechaSolicitud || 0).getTime();
        const dateB = new Date(b.fechaSolicitud || 0).getTime();
        return dateB - dateA;
      });
      setSolicitudes(data);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching solicitudes real-time:", err);
      setError("Error al cargar las solicitudes en tiempo real.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchSolicitudes = () => {
    // onSnapshot ya se encarga, pero mantenemos la función para el botón de refresco manual si se desea
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  };

  const aprobarSolicitud = async (sol: any) => {
    if (sol.tipo === 'consulta') {
      if (!window.confirm(`¿Marcar consulta de ${sol.nombre} como contactada?`)) return;
      setLoading(true);
      try {
        await updateDoc(doc(db, "solicitudes_cursos", sol.id), {
          estado: 'contactado',
          fechaContacto: new Date().toISOString()
        });
        setMsg("✅ Consulta marcada como contactada");
        setTimeout(() => setMsg(''), 3000);
        fetchSolicitudes();
      } catch (err) {
        console.error(err);
        alert("Error al actualizar consulta");
      }
      setLoading(false);
      return;
    }

    if (!window.confirm(`¿Aprobar solicitud de ${sol.nombre} para el curso ${sol.cursoTitulo}?`)) return;
    
    setLoading(true);
    try {
      const emailClean = sol.email.trim().toLowerCase();
      const dniUpper = (sol.dni || "").toUpperCase();
      if (!dniUpper) {
        alert("Error: La solicitud de inscripción no tiene DNI");
        setLoading(false);
        return;
      }
      const socioRef = doc(db, "socios", dniUpper);
      const socioSnap = await getDoc(socioRef);

      let realUid = "";

      // 2. Añadir al curso (actualizar aforo y lista de alumnos)
      const cursoRef = doc(db, "cursos", sol.cursoId);
      const cursoSnap = await getDoc(cursoRef);
      let fechaFin = "";
      let categoria = sol.categoria || "musica";

      if (cursoSnap.exists()) {
        const cData = cursoSnap.data();
        fechaFin = cData.fechaFin || "";
        categoria = cData.categoria || categoria;

        if (!cData.alumnos?.includes(dniUpper)) {
          await updateDoc(cursoRef, {
            alumnos: arrayUnion(dniUpper),
            aforo_actual: (cData.aforo_actual || 0) + 1
          });
        }
      }

      // 1. Si no es socio, lo creamos
      if (!socioSnap.exists()) {
        realUid = "manual-" + Math.random().toString(36).substring(7);
        try {
          const authResult = await createSocioAuth(emailClean);
          if (authResult.uid) realUid = authResult.uid;
          
          await sendWelcomeEmail(emailClean, sol.nombre || "Soci@s Kalian", "https://kalian.es/login");
        } catch (err) {
          console.error("Error creating auth user:", err);
        }

        await setDoc(socioRef, {
          dni: dniUpper,
          nombre: sol.nombre,
          email: emailClean,
          uid: realUid,
          membresias: fechaFin ? { [categoria]: fechaFin } : {},
          estado: fechaFin ? 'activo' : 'inactivo',
          cursos: [sol.cursoId],
          verificado: true,
          fechaAlta: new Date().toISOString()
        });

        // Trigger membership update email for new socio
        await sendMembershipUpdateEmail(emailClean, sol.nombre, realUid, fechaFin ? { [categoria]: fechaFin } : {});
      } else {
        // Si ya es socio, solo añadimos el curso si no lo tiene y actualizamos expiración
        const updateData: any = {
          cursos: arrayUnion(sol.cursoId),
          estado: 'activo'
        };
        if (fechaFin) {
          updateData[`membresias.${categoria}`] = fechaFin;
        }
        await updateDoc(socioRef, updateData);
        
        // Trigger membership update email
        const finalSocioSnap = await getDoc(socioRef);
        if (finalSocioSnap.exists()) {
          const sData = finalSocioSnap.data();
          await sendMembershipUpdateEmail(sData.email, sData.nombre, sData.uid, sData.membresias || {});
        }
      }

      // 3. Inicializar registro de pago de inscripción (pendiente)
      const pagoInscripcionId = `${dniUpper}_${sol.cursoId}`;
      await setDoc(doc(db, "pagos_inscripciones", pagoInscripcionId), {
        socioId: dniUpper,
        cursoId: sol.cursoId,
        pagado: false,
        fechaCreacion: new Date().toISOString()
      }, { merge: true });

      // 4. Marcar solicitud como aprobada
      await updateDoc(doc(db, "solicitudes_cursos", sol.id), {
        estado: 'aprobado',
        fechaAprobacion: new Date().toISOString()
      });

      setMsg("✅ Solicitud aprobada con éxito");
      setTimeout(() => setMsg(''), 3000);
      fetchSolicitudes();
    } catch (err) {
      console.error(err);
      alert("Error al aprobar solicitud");
    }
    setLoading(false);
  };

  const rechazarSolicitud = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres rechazar esta solicitud?")) return;
    try {
      await updateDoc(doc(db, "solicitudes_cursos", id), {
        estado: 'rechazado'
      });
      setMsg("❌ Solicitud rechazada");
      setTimeout(() => setMsg(''), 3000);
      fetchSolicitudes();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <Link to="/staff" className="text-kalian-gold/80 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">← Volver al Panel</Link>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight">SOLICITUDES <span className="text-kalian-cream">CURSOS</span></h1>
          </div>
          <button onClick={fetchSolicitudes} className="p-3 bg-kalian-gold/10 text-kalian-gold rounded-2xl border border-kalian-gold/20 hover:bg-kalian-gold/20 transition-all">🔄</button>
        </header>

        {msg && <div className="bg-kalian-gold text-black p-5 rounded-3xl mb-12 kalian-poster-text text-xl text-center shadow-2xl animate-bounce">{msg}</div>}
        {error && <div className="bg-red-500 text-white p-5 rounded-3xl mb-12 kalian-poster-text text-xl text-center shadow-2xl">{error}</div>}

        {loading ? (
          <div className="text-center py-32 kalian-poster-text text-4xl text-kalian-gold/20 animate-pulse">CARGANDO SOLICITUDES...</div>
        ) : (
          <div className="grid gap-6">
            {solicitudes.length === 0 && <div className="text-center py-32 bg-black/20 rounded-[3rem] border border-kalian-gold/10 border-dashed text-kalian-gold/20 kalian-poster-text text-4xl uppercase">No hay solicitudes pendientes</div>}
            {solicitudes.map(sol => (
              <div key={sol.id} className="bg-black/40 p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-8 border border-kalian-gold/10 group hover:border-kalian-gold/40 transition-all duration-500">
                <div className="flex items-center gap-8 w-full md:w-auto">
                  <div className="w-16 h-16 bg-kalian-gold/10 rounded-2xl flex items-center justify-center text-3xl border border-kalian-gold/20">
                    📩
                  </div>
                  <div>
                    <p className="text-3xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors leading-none mb-2">{sol.nombre}</p>
                    <div className="flex gap-4 items-center flex-wrap">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-md tracking-widest uppercase ${sol.tipo === 'consulta' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                        {sol.tipo === 'consulta' ? 'Consulta' : 'Inscripción'}
                      </span>
                      {sol.dni && <p className="text-[10px] text-kalian-gold/40 font-mono font-black tracking-[0.2em] uppercase">{sol.dni}</p>}
                      <p className="text-[10px] text-kalian-gold/20 italic font-bold">{sol.email}</p>
                      <p className="text-[10px] text-kalian-gold/20 font-bold uppercase tracking-widest">Tel: {sol.telefono}</p>
                    </div>
                    <div className="mt-4">
                      <span className="text-[10px] font-black uppercase bg-kalian-gold text-black px-4 py-1 rounded-xl tracking-widest">{sol.cursoTitulo}</span>
                      <p className="mt-3 text-xs text-kalian-cream/50 italic">"{sol.mensaje || 'Sin mensaje adicional'}"</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 w-full md:w-auto">
                  <button 
                    onClick={() => aprobarSolicitud(sol)}
                    className="flex-1 md:flex-none bg-emerald-500 text-black px-8 py-4 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-white transition-all shadow-xl shadow-emerald-500/10"
                  >
                    {sol.tipo === 'consulta' ? 'CONTACTADO' : 'APROBAR'}
                  </button>
                  <button 
                    onClick={() => rechazarSolicitud(sol.id)}
                    className="flex-1 md:flex-none bg-red-500/10 text-red-500 px-8 py-4 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                  >
                    RECHAZAR
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSolicitudes;
