import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, updateDoc, doc, query, orderBy, DocumentData } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

const TeacherDashboard = () => {
  const [cursos, setCursos] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const { logoutTeacher } = useAuth();

  const fetchCursos = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "cursos"), orderBy("titulo", "asc")));
      setCursos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchCursos(); }, []);

  const toggleAforo = async (id: string, actual: boolean) => {
    try {
      await updateDoc(doc(db, "cursos", id), { aforo_disponible: !actual });
      fetchCursos();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="min-h-screen bg-kalian-dark p-6 font-sans text-kalian-cream">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12 flex justify-between items-end">
          <div>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold tracking-tight uppercase italic leading-none">PANEL <span className="text-kalian-cream">PROFESORES</span></h1>
            <p className="text-[10px] text-kalian-gold/40 font-black uppercase tracking-[0.4em] mt-4 ml-4">Gestión de Plazas y Cursos</p>
          </div>
          <button onClick={logoutTeacher} className="bg-kalian-gold/10 text-kalian-gold px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-kalian-gold hover:text-black transition-all">SALIR</button>
        </header>

        {loading ? (
          <div className="text-center py-20 text-kalian-gold/40 font-black uppercase tracking-widest animate-pulse">Cargando tus cursos...</div>
        ) : (
          <div className="space-y-6">
            {cursos.map(c => (
              <div key={c.id} className="bg-black/40 p-10 rounded-[3rem] border border-kalian-gold/10 flex flex-col md:flex-row justify-between items-center gap-8 group hover:border-kalian-gold/40 transition-all shadow-2xl">
                <div className="text-center md:text-left">
                  <span className="text-[9px] font-black uppercase bg-kalian-gold/10 text-kalian-gold px-4 py-1 rounded-full mb-3 inline-block tracking-widest">
                    {c.categoria === 'musica' ? 'Music is cool' : c.categoria === 'danza' ? 'Club de baile' : 'Locales'}
                  </span>
                  <h2 className="text-4xl kalian-poster-text text-kalian-cream group-hover:text-kalian-gold transition-colors uppercase italic leading-none">{c.titulo}</h2>
                  <p className="text-[10px] text-kalian-gold/40 font-black uppercase tracking-[0.3em] mt-3">
                    {c.horario} | {c.tipoClase} | {c.frecuencia}
                  </p>
                  <p className="text-[10px] text-kalian-gold/20 font-bold uppercase tracking-widest mt-1">
                    {c.alumnos?.length || 0} Alumnos Inscritos
                  </p>
                </div>

                <div className="flex flex-col items-center gap-4 min-w-[200px]">
                  <p className={`text-2xl kalian-poster-text italic ${c.aforo_disponible ? 'text-emerald-500' : 'text-red-500'}`}>
                    {c.aforo_disponible ? 'PLAZAS LIBRES' : 'CURSO COMPLETO'}
                  </p>
                  <button 
                    onClick={() => toggleAforo(c.id, c.aforo_disponible !== false)}
                    className={`w-full p-5 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl ${c.aforo_disponible ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
                  >
                    {c.aforo_disponible ? 'MARCAR COMO COMPLETO' : 'ABRIR PLAZAS'}
                  </button>
                </div>
              </div>
            ))}
            {cursos.length === 0 && (
              <div className="bg-black/20 p-20 rounded-[3rem] text-center border border-dashed border-kalian-gold/10">
                <p className="text-kalian-gold/20 font-black uppercase tracking-widest italic">No hay cursos registrados en el sistema</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
