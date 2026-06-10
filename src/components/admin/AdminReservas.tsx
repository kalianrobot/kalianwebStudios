import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  increment,
  writeBatch,
  DocumentData
} from 'firebase/firestore';

type Reserva = DocumentData & { id: string };

const formatFecha = (iso: string | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const AdminReservas = () => {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [filtro, setFiltro] = useState('');
  const [soloFuturas, setSoloFuturas] = useState(true);
  const [limpiando, setLimpiando] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'reservas'), orderBy('fechaReserva', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Reserva[];
        setReservas(data);
        setLoading(false);
        setMsg('');
      },
      (err) => {
        console.error('AdminReservas: Error en onSnapshot:', err.message);
        setMsg('❌ Error de permisos: ' + err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const eliminarReserva = async (reserva: Reserva) => {
    const quien = reserva.nombreTitular || reserva.dniTitular || reserva.ticketID || 'esta reserva';
    if (!window.confirm(`¿Eliminar la reserva de ${quien}? Se devolverá el aforo automáticamente.`)) return;

    try {
      const esCurso = !!reserva.esCurso;
      const coleccionActividad = esCurso ? 'cursos' : 'eventos';
      const totalReserva = 1 + Number(reserva.acompañantes || 0);
      const yaIngresados = Number(reserva.asistentes_ingresados || 0);
      const pendientes = Math.max(0, totalReserva - yaIngresados);

      if (pendientes > 0 && reserva.eventoId) {
        try {
          await updateDoc(doc(db, coleccionActividad, reserva.eventoId), {
            aforo_reservado: increment(-pendientes)
          });
        } catch (e: any) {
          console.warn('No se pudo decrementar aforo (puede que el evento ya no exista):', e.message);
        }
      }

      await deleteDoc(doc(db, 'reservas', reserva.id));
      setMsg(`✅ Reserva de ${quien} eliminada. Aforo devuelto: ${pendientes}`);
      setTimeout(() => setMsg(''), 4000);
    } catch (err: any) {
      console.error(err);
      setMsg('❌ Error al eliminar: ' + err.message);
    }
  };

  const cambiarAcompañantes = async (reserva: Reserva, nuevoNum: number) => {
    if (nuevoNum < 0) return;

    const actuales = Number(reserva.acompañantes || 0);
    if (nuevoNum === actuales) return;

    const yaIngresados = Number(reserva.asistentes_ingresados || 0);
    const nuevoTotal = 1 + nuevoNum;
    if (nuevoTotal < yaIngresados) {
      setMsg(`❌ No se puede bajar de ${yaIngresados}: ya hay esos asistentes registrados como entrados.`);
      return;
    }

    if (!reserva.eventoId) {
      setMsg('❌ La reserva no tiene eventoId — no se puede actualizar el aforo.');
      return;
    }

    try {
      const esCurso = !!reserva.esCurso;
      const coleccionActividad = esCurso ? 'cursos' : 'eventos';
      const docRef = doc(db, coleccionActividad, reserva.eventoId);
      const snapDoc = await getDoc(docRef);

      if (!snapDoc.exists()) {
        setMsg('❌ La actividad ya no existe.');
        return;
      }

      const dataActividad = snapDoc.data();
      const aforoMax = Number(dataActividad.aforo_maximo || dataActividad.aforo_max || dataActividad.aforo_total || 0);
      const aforoRes = Number(dataActividad.aforo_reservado || 0);
      const diferencia = nuevoNum - actuales;

      if (!esCurso && aforoRes + diferencia > aforoMax) {
        setMsg(`❌ Sin aforo suficiente. Máx: ${aforoMax}, libres: ${Math.max(0, aforoMax - aforoRes)}.`);
        return;
      }

      const update: Record<string, any> = {
        acompañantes: nuevoNum,
        numPersonas: 1 + nuevoNum,
      };
      if (!esCurso) {
        const precioBase = Number(dataActividad.precio_estandar || dataActividad.precio || 0);
        const totalActual = Number(reserva.totalPagar || 0);
        const precioTitular = Math.max(0, totalActual - (actuales * precioBase));
        update.totalPagar = precioTitular + (nuevoNum * precioBase);
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'reservas', reserva.id), update);
      if (diferencia !== 0) {
        batch.update(docRef, { aforo_reservado: increment(diferencia) });
      }
      await batch.commit();

      setMsg(`✅ Acompañantes actualizados: ${actuales} → ${nuevoNum} (aforo ${diferencia >= 0 ? '+' : ''}${diferencia})`);
      setTimeout(() => setMsg(''), 4000);
    } catch (err: any) {
      console.error(err);
      setMsg('❌ Error al actualizar: ' + err.message);
    }
  };

  // Nota: lógica de purga manual; podría moverse a un Cloud Function onSchedule
  // si más adelante se quiere automatizar.
  const limpiarReservasPasadas = async () => {
    const umbral = new Date();
    umbral.setDate(umbral.getDate() - 90);
    const umbralIso = umbral.toISOString();
    const umbralLegible = umbral.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const candidatas = reservas.filter(r => r.fechaActividad && r.fechaActividad < umbralIso);

    if (candidatas.length === 0) {
      setMsg('No hay reservas con más de 90 días para limpiar.');
      setTimeout(() => setMsg(''), 4000);
      return;
    }

    const confirmado = window.confirm(
      `¿Borrar definitivamente ${candidatas.length} reserva(s) de actividades anteriores al ${umbralLegible}?\n\n` +
      `Esta acción no se puede deshacer. El registro de asistencia (asistencia_eventos) se conserva.`
    );
    if (!confirmado) return;

    setLimpiando(true);
    let borradas = 0;
    let errores = 0;

    try {
      for (let i = 0; i < candidatas.length; i += 500) {
        const lote = candidatas.slice(i, i + 500);
        const batch = writeBatch(db);
        lote.forEach(r => batch.delete(doc(db, 'reservas', r.id)));
        try {
          await batch.commit();
          borradas += lote.length;
        } catch (e: any) {
          console.error('Batch de limpieza falló:', e.message);
          errores += lote.length;
        }
      }
      const partes = [`✅ ${borradas} reservas eliminadas`];
      if (errores > 0) partes.push(`⚠️ ${errores} fallidas`);
      setMsg(partes.join(' · '));
      setTimeout(() => setMsg(''), 6000);
    } finally {
      setLimpiando(false);
    }
  };

  const hoyIso = new Date().toISOString().slice(0, 10);

  const filtradas = reservas.filter(r => {
    if (soloFuturas) {
      const fecha = (r.fechaActividad || '').slice(0, 10);
      if (!fecha || fecha < hoyIso) return false;
    }
    if (!filtro) return true;
    const f = filtro.toLowerCase();
    return (
      (r.nombreTitular || '').toLowerCase().includes(f) ||
      (r.dniTitular || '').toLowerCase().includes(f) ||
      (r.emailTitular || '').toLowerCase().includes(f) ||
      (r.uidTitular || '').toLowerCase().includes(f) ||
      (r.eventoTitulo || '').toLowerCase().includes(f) ||
      (r.ticketID || '').toLowerCase().includes(f)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-black italic uppercase">Reservas</h1>
          <Link
            to="/staff"
            className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all"
          >
            ← Volver al panel
          </Link>
        </div>

        {msg && (
          <div className="mb-6 p-4 bg-white rounded-2xl shadow text-sm font-bold text-slate-800">
            {msg}
          </div>
        )}

        <div className="mb-6 flex flex-col md:flex-row md:items-center gap-3">
          <input
            type="text"
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            placeholder="Buscar por nombre, DNI, email, UID, evento o ticket…"
            className="flex-1 px-5 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <label className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soloFuturas}
              onChange={e => setSoloFuturas(e.target.checked)}
              className="accent-slate-900"
            />
            Solo futuras
          </label>
          <button
            onClick={limpiarReservasPasadas}
            disabled={limpiando}
            className="bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
            title="Borra definitivamente reservas de actividades anteriores a hace 90 días"
          >
            🧹 {limpiando ? 'Limpiando…' : 'Limpiar > 90 días'}
          </button>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-900 text-white text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="p-4">Titular</th>
                  <th className="p-4">Contacto</th>
                  <th className="p-4">Actividad</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Plazas</th>
                  <th className="p-4">Ticket</th>
                  <th className="p-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400 text-sm">Cargando…</td></tr>
                ) : filtradas.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                    {reservas.length === 0 ? 'No hay reservas todavía.' : 'Ninguna reserva coincide con el filtro.'}
                  </td></tr>
                ) : filtradas.map(r => {
                  const esInvitado = !r.uidTitular || r.uidTitular === 'invitado';
                  const totalReserva = 1 + Number(r.acompañantes || 0);
                  const ingresados = Number(r.asistentes_ingresados || 0);
                  return (
                    <tr key={r.id} className="text-sm align-top">
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{r.nombreTitular || '—'}</div>
                        <div className="text-[11px] text-slate-500">{r.dniTitular || '—'}</div>
                        {r.uidTitular && r.uidTitular !== 'invitado' && (
                          <div className="text-[9px] text-slate-400 font-mono truncate max-w-[140px]" title={r.uidTitular}>uid: {r.uidTitular}</div>
                        )}
                        <div className="mt-1 flex gap-1 flex-wrap">
                          {esInvitado && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[9px] font-black uppercase">Invitado</span>
                          )}
                          {r.esSocio && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[9px] font-black uppercase">Socio</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-slate-700 text-[12px] break-all">{r.emailTitular || '—'}</td>
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{r.eventoTitulo || '—'}</div>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 rounded text-[9px] font-black uppercase text-slate-700">
                          {r.esCurso ? 'Curso' : 'Evento'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-700 text-[12px]">
                        <div><b>Actividad:</b> {formatFecha(r.fechaActividad)}</div>
                        <div className="text-slate-400"><b>Reservada:</b> {formatFecha(r.fechaReserva)}</div>
                      </td>
                      <td className="p-4 text-slate-700 text-[12px]">
                        <div>Total: <b>{totalReserva}</b></div>
                        <div className="text-slate-400">Entrados: {ingresados}</div>
                        <div className="mt-2 flex items-center gap-1">
                          <button
                            onClick={() => cambiarAcompañantes(r, Number(r.acompañantes || 0) - 1)}
                            disabled={Number(r.acompañantes || 0) <= 0}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed font-black text-slate-700"
                            title="Quitar un acompañante"
                          >−</button>
                          <span className="px-2 text-[11px] text-slate-600">
                            {Number(r.acompañantes || 0)} acomp.
                          </span>
                          <button
                            onClick={() => cambiarAcompañantes(r, Number(r.acompañantes || 0) + 1)}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-slate-700"
                            title="Añadir un acompañante"
                          >+</button>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-[11px] text-slate-600">{r.ticketID || '—'}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => eliminarReserva(r)}
                          className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                          Borrar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-[11px] text-slate-400 uppercase tracking-widest">
          {filtradas.length} de {reservas.length} reservas
        </div>
      </div>
    </div>
  );
};

export default AdminReservas;
