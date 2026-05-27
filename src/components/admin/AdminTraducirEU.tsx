import React, { useState } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

interface TraduccionJob {
  coleccion: string;
  id: string;
  campos: { campo: string; campoEU: string; textoES: string }[];
}

interface Resultado {
  id: string;
  coleccion: string;
  ok: boolean;
  msg: string;
}

const DELAY_MS = 600;

async function traducirTexto(texto: string): Promise<string> {
  if (!texto.trim()) return '';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=es|eu`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || 'Error MyMemory');
  return data.responseData.translatedText || texto;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Campos a traducir por colección
const CAMPOS_EU: Record<string, { campo: string; campoEU: string }[]> = {
  eventos:      [{ campo: 'titulo',      campoEU: 'titulo_eu' },
                 { campo: 'descripcion', campoEU: 'descripcion_eu' },
                 { campo: 'reglas',      campoEU: 'reglas_eu' }],
  cursos:       [{ campo: 'titulo',      campoEU: 'titulo_eu' },
                 { campo: 'descripcion', campoEU: 'descripcion_eu' },
                 { campo: 'horario',     campoEU: 'horario_eu' },
                 { campo: 'subcategoria',campoEU: 'subcategoria_eu' }],
  exposiciones: [{ campo: 'titulo',      campoEU: 'titulo_eu' },
                 { campo: 'autor',       campoEU: 'autor_eu' },
                 { campo: 'descripcion', campoEU: 'descripcion_eu' }],
  profesores:   [{ campo: 'nombre',      campoEU: 'nombre_eu' },
                 { campo: 'especialidad',campoEU: 'especialidad_eu' }],
  academias:    [{ campo: 'nombre',      campoEU: 'nombre_eu' }],
};

const AdminTraducirEU = () => {
  const [fase, setFase] = useState<'idle' | 'escaneando' | 'traduciendo' | 'done'>('idle');
  const [jobs, setJobs] = useState<TraduccionJob[]>([]);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [progreso, setProgreso] = useState(0);
  const [total, setTotal] = useState(0);
  const [soloVacios, setSoloVacios] = useState(true);

  const escanear = async () => {
    setFase('escaneando');
    setJobs([]);
    setResultados([]);

    const encontrados: TraduccionJob[] = [];

    for (const [col, campos] of Object.entries(CAMPOS_EU)) {
      const snap = await getDocs(collection(db, col));
      snap.docs.forEach(d => {
        const data = d.data();
        const pendientes = campos.filter(({ campo, campoEU }) => {
          const tieneES = !!data[campo]?.trim?.();
          const tieneEU = !!data[campoEU]?.trim?.();
          return tieneES && (soloVacios ? !tieneEU : true);
        }).map(({ campo, campoEU }) => ({
          campo,
          campoEU,
          textoES: data[campo] || ''
        }));

        if (pendientes.length > 0) {
          encontrados.push({ coleccion: col, id: d.id, campos: pendientes });
        }
      });
    }

    setJobs(encontrados);
    setFase('idle');
  };

  const traducirTodo = async () => {
    if (jobs.length === 0) return;
    setFase('traduciendo');
    setProgreso(0);
    const totalCampos = jobs.reduce((s, j) => s + j.campos.length, 0);
    setTotal(totalCampos);

    const res: Resultado[] = [];
    let done = 0;

    for (const job of jobs) {
      const updates: Record<string, string> = {};

      for (const { campo, campoEU, textoES } of job.campos) {
        try {
          const traduccion = await traducirTexto(textoES);
          updates[campoEU] = traduccion;
          done++;
          setProgreso(done);
        } catch (err: any) {
          res.push({ id: job.id, coleccion: job.coleccion, ok: false, msg: `${campo}: ${err.message}` });
          done++;
          setProgreso(done);
        }
        await sleep(DELAY_MS);
      }

      if (Object.keys(updates).length > 0) {
        try {
          await updateDoc(doc(db, job.coleccion, job.id), updates);
          res.push({ id: job.id, coleccion: job.coleccion, ok: true, msg: Object.keys(updates).join(', ') });
        } catch (err: any) {
          res.push({ id: job.id, coleccion: job.coleccion, ok: false, msg: `Firestore: ${err.message}` });
        }
      }
    }

    setResultados(res);
    setJobs([]);
    setFase('done');
  };

  const totalCampos = jobs.reduce((s, j) => s + j.campos.length, 0);

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <div className="max-w-3xl mx-auto space-y-10">
        <header>
          <Link to="/staff" className="text-kalian-gold/40 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors">← Volver al Panel</Link>
          <h1 className="text-5xl kalian-poster-text text-kalian-gold mt-4 tracking-tight uppercase italic">Traducción <span className="text-kalian-cream">Automática EU</span></h1>
          <p className="text-kalian-gold/50 text-sm mt-2">Traduce automáticamente los campos en castellano al euskera usando MyMemory. Revisa siempre el resultado.</p>
        </header>

        {/* Opciones */}
        <div className="bg-black/40 p-6 rounded-[2rem] border border-kalian-gold/10 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={soloVacios}
              onChange={e => setSoloVacios(e.target.checked)}
              className="w-5 h-5 rounded accent-kalian-gold"
            />
            <span className="text-sm font-bold">Solo campos EU vacíos <span className="text-kalian-gold/40 font-normal">(desmarcar para sobreescribir traducciones existentes)</span></span>
          </label>

          <button
            onClick={escanear}
            disabled={fase !== 'idle' && fase !== 'done'}
            className="w-full bg-kalian-gold/10 border border-kalian-gold/20 text-kalian-gold p-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-kalian-gold hover:text-black transition-all disabled:opacity-40"
          >
            {fase === 'escaneando' ? '⏳ Escaneando...' : '🔍 Escanear contenido pendiente'}
          </button>
        </div>

        {/* Resultados del escaneo */}
        {jobs.length > 0 && (
          <div className="bg-black/40 p-6 rounded-[2rem] border border-kalian-gold/10 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-black uppercase tracking-widest text-kalian-gold text-sm">
                {jobs.length} documentos · {totalCampos} campos por traducir
              </h2>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {jobs.map(j => (
                <div key={`${j.coleccion}-${j.id}`} className="flex items-start justify-between bg-black/30 rounded-xl p-3 text-xs">
                  <div>
                    <span className="font-black text-kalian-gold uppercase">{j.coleccion}</span>
                    <span className="text-kalian-cream/50 mx-2">›</span>
                    <span className="text-kalian-cream/80">{j.id}</span>
                  </div>
                  <div className="text-kalian-gold/40 text-right">
                    {j.campos.map(c => c.campoEU).join(', ')}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={traducirTodo}
              disabled={fase === 'traduciendo'}
              className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20 disabled:opacity-40"
            >
              {fase === 'traduciendo'
                ? `Traduciendo... ${progreso}/${total}`
                : `Traducir todo (${totalCampos} campos)`}
            </button>

            {fase === 'traduciendo' && (
              <div className="w-full bg-black/40 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-kalian-gold transition-all duration-300"
                  style={{ width: `${total > 0 ? (progreso / total) * 100 : 0}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Resultados finales */}
        {fase === 'done' && resultados.length > 0 && (
          <div className="bg-black/40 p-6 rounded-[2rem] border border-kalian-gold/10 space-y-4">
            <h2 className="font-black uppercase tracking-widest text-kalian-gold text-sm">
              Resultados — {resultados.filter(r => r.ok).length} ok · {resultados.filter(r => !r.ok).length} errores
            </h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {resultados.map((r, i) => (
                <div key={i} className={`flex items-start justify-between rounded-xl p-3 text-xs ${r.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  <span>{r.ok ? '✓' : '✗'} <strong>{r.coleccion}</strong> › {r.id}</span>
                  <span className="text-right opacity-70">{r.msg}</span>
                </div>
              ))}
            </div>
            <button
              onClick={escanear}
              className="w-full bg-kalian-gold/10 border border-kalian-gold/20 text-kalian-gold p-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-kalian-gold hover:text-black transition-all"
            >
              Volver a escanear
            </button>
          </div>
        )}

        {fase === 'idle' && jobs.length === 0 && resultados.length === 0 && (
          <p className="text-center text-kalian-gold/20 kalian-poster-text text-2xl pt-10">Pulsa "Escanear" para empezar</p>
        )}
      </div>
    </div>
  );
};

export default AdminTraducirEU;
