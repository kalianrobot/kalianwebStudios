import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { formatDate } from '../i18n/dateFormat';
import {
  consultarReserva,
  cancelarReservaInvitado,
  editarAcompanantesInvitado,
  ResumenReserva,
} from '../lib/reservaInvitado';

const MiReserva = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error' | 'cancelada'>('cargando');
  const [reserva, setReserva] = useState<ResumenReserva | null>(null);
  const [msg, setMsg] = useState('');
  const [accionCargando, setAccionCargando] = useState(false);

  useEffect(() => {
    if (!token) {
      setMsg(t('miReserva.noToken'));
      setEstado('error');
      return;
    }
    consultarReserva(token)
      .then(res => {
        if (res.ok && res.reserva) {
          setReserva(res.reserva);
          setEstado('ok');
        } else {
          setEstado('error');
        }
      })
      .catch(() => setEstado('error'));
  }, [token]);

  const fechaLegible = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return formatDate(d, language, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const cambiarAcompanantes = async (delta: number) => {
    if (!reserva) return;
    const nuevo = reserva.acompanantes + delta;
    if (nuevo < 0) return;
    if (nuevo > reserva.maxAcompanantes) {
      setMsg(t('reserva.manage.maxGuests', { n: reserva.maxAcompanantes }));
      return;
    }
    setAccionCargando(true);
    setMsg('');
    try {
      const res = await editarAcompanantesInvitado(token, nuevo);
      if (res.reserva) setReserva(res.reserva);
      setMsg(t('miReserva.updated'));
    } catch (err: any) {
      setMsg(err?.message || t('miReserva.error'));
    }
    setAccionCargando(false);
  };

  const cancelar = async () => {
    if (!window.confirm(t('miReserva.confirmCancel'))) return;
    setAccionCargando(true);
    setMsg('');
    try {
      await cancelarReservaInvitado(token);
      setEstado('cancelada');
    } catch (err: any) {
      setMsg(err?.message || t('miReserva.error'));
      setAccionCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-kalian-dark flex flex-col items-center justify-center p-6 text-kalian-cream font-sans">
      <div className="w-full max-w-lg bg-black/40 rounded-[2.5rem] border border-kalian-gold/15 shadow-2xl p-10 space-y-8">
        <h1 className="text-4xl kalian-poster-text italic uppercase text-kalian-gold text-center tracking-tight">
          {t('miReserva.title')}
        </h1>

        {estado === 'cargando' && (
          <p className="text-center text-kalian-cream/50 font-bold uppercase text-xs tracking-widest animate-pulse">
            {t('miReserva.loading')}
          </p>
        )}

        {estado === 'error' && (
          <div className="space-y-6 text-center">
            <p className="text-kalian-cream/70 text-sm leading-relaxed">{msg || t('miReserva.notFound')}</p>
            <button
              onClick={() => navigate('/programacion')}
              className="bg-kalian-gold text-black px-8 py-4 rounded-2xl kalian-poster-text tracking-widest hover:bg-white transition-all"
            >
              {t('miReserva.backToProgram')}
            </button>
          </div>
        )}

        {estado === 'cancelada' && (
          <div className="space-y-6 text-center">
            <p className="text-emerald-400 font-bold text-sm leading-relaxed">{t('miReserva.cancelled')}</p>
            <button
              onClick={() => navigate('/programacion')}
              className="bg-kalian-gold text-black px-8 py-4 rounded-2xl kalian-poster-text tracking-widest hover:bg-white transition-all"
            >
              {t('miReserva.backToProgram')}
            </button>
          </div>
        )}

        {estado === 'ok' && reserva && (
          <div className="space-y-8">
            <div className="space-y-4 bg-black/30 rounded-[1.5rem] p-6 border border-kalian-gold/10">
              <div>
                <p className="text-[10px] font-black uppercase text-kalian-gold/40 tracking-[0.3em]">{t('miReserva.activity')}</p>
                <p className="text-lg font-bold">{reserva.eventoTitulo}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-kalian-gold/40 tracking-[0.3em]">{t('miReserva.date')}</p>
                <p className="text-sm text-kalian-cream/80">{fechaLegible(reserva.fechaActividad)}</p>
              </div>
            </div>

            {!reserva.esCurso && (
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-kalian-gold/40 tracking-[0.3em] text-center">{t('miReserva.guests')}</p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => cambiarAcompanantes(-1)}
                    disabled={accionCargando || reserva.acompanantes <= 0}
                    className="w-12 h-12 rounded-2xl bg-black/40 border border-kalian-gold/20 text-2xl font-black text-kalian-gold disabled:opacity-30 hover:bg-kalian-gold/10 transition-colors"
                  >−</button>
                  <span className="text-sm font-black min-w-[9rem] text-center">
                    {t('miReserva.guestsCount', { n: reserva.acompanantes })}
                  </span>
                  <button
                    onClick={() => cambiarAcompanantes(1)}
                    disabled={accionCargando}
                    className="w-12 h-12 rounded-2xl bg-black/40 border border-kalian-gold/20 text-2xl font-black text-kalian-gold disabled:opacity-30 hover:bg-kalian-gold/10 transition-colors"
                  >+</button>
                </div>
              </div>
            )}

            <button
              onClick={cancelar}
              disabled={accionCargando}
              className="w-full bg-red-500/10 text-red-400 p-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-red-500 hover:text-white disabled:opacity-40 transition-all"
            >
              {t('miReserva.cancelBooking')}
            </button>

            {msg && <p className="text-center text-xs font-bold text-kalian-cream/70">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default MiReserva;
