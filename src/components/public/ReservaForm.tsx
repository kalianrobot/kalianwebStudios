import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
import { collection, addDoc, query, where, getDocs, doc, getDoc, DocumentData, runTransaction, increment } from 'firebase/firestore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

interface ReservaFormProps {
  item: any; // Evento o Curso
  alCerrar: () => void;
}

const ReservaForm = ({ item, alCerrar }: ReservaFormProps) => {
  const { socioData, esSocioActivo } = useAuth();
  const { t, tField, language } = useLanguage();
  const itemTitulo = tField(item, 'titulo');
  const [searchParams] = useSearchParams();
  const cuponUrl = searchParams.get('cupon') || '';
  
  const [form, setForm] = useState({ dni: '', nombre: '', email: '', acompañantes: 0 });
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ ticketID: string, qrUrl: string, nombre: string } | null>(null);
  const [emailEnvio, setEmailEnvio] = useState('');
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [claveInput, setClaveInput] = useState(cuponUrl.toUpperCase());
  const [claveValida, setClaveValida] = useState(false);
  const [precioCalculado, setPrecioCalculado] = useState({ total: 0, esSocio: false, esClave: false });
  const navigate = useNavigate();
  
  const [mensajeBloqueo, setMensajeBloqueo] = useState('');

  const esCurso = item.fechaFin !== undefined;
  const categoriaActividad = item.categoria || 'musica';
  const precioBase = Number(item.precio_estandar || item.precio || 0);

  const getNombreCategoria = (cat: string) => {
    if (cat === 'musica') return 'Music Is Cool';
    if (cat === 'danza') return 'Club de Baile';
    return cat;
  };

  useEffect(() => {
    if (socioData) {
      setForm(f => ({ ...f, dni: socioData.dni, nombre: socioData.nombre, email: socioData.email || '' }));
    }
  }, [socioData]);

  // Cálculo de precio en tiempo real
  useEffect(() => {
    const calcular = async () => {
      let socio = false;
      
      // Lógica de Descuentos Cruzados (Arquitecto):
      if (categoriaActividad === 'musica') {
        // Music Is Cool se aplica si tiene musica O local
        socio = esSocioActivo('musica') || esSocioActivo('local');
      } else if (categoriaActividad === 'danza') {
        // Club de Baile solo si tiene danza
        socio = esSocioActivo('danza');
      } else {
        // Otros casos (ej. local o ninguno)
        socio = esSocioActivo(categoriaActividad);
      }
      
      const dniUpper = form.dni.trim().toUpperCase();

      if (!socio && dniUpper && !esCurso) {
        try {
          const snap = await getDoc(doc(db, "socios", dniUpper));
          if (snap.exists()) {
            const hoy = new Date().toISOString().split('T')[0];
            const expData = snap.data().membresias || {};
            
            if (categoriaActividad === 'musica') {
              const expM = expData['musica'] || '';
              const expL = expData['local'] || '';
              if (expM >= hoy || expL >= hoy) socio = true;
            } else {
              const exp = expData[categoriaActividad] || '';
              if (exp >= hoy) socio = true;
            }
          }
        } catch (e) { console.error(e); }
      }

      const esClaveValida = item.cupon && claveInput.trim().toUpperCase() === item.cupon.toUpperCase();
      setClaveValida(!!esClaveValida);

      let precioTitular = precioBase;
      let aplicadoSocio = false;
      let aplicadoClave = false;

      // Lógica de Descuentos NO Acumulables (Arquitecto: Elegir el mejor precio)
      const pSocio = item.tiene_descuento ? Number(item.precio_descuento) : precioBase;
      const pClave = (esClaveValida && item.precioCupon) ? Number(item.precioCupon) : precioBase;

      // Determinamos cuál es el mejor precio disponible para el titular
      if (socio && pSocio < precioTitular) {
        precioTitular = pSocio;
        aplicadoSocio = true;
      }

      if (esClaveValida && pClave < precioTitular) {
        precioTitular = pClave;
        aplicadoClave = true;
        aplicadoSocio = false; // Priorizamos el mejor precio, si la clave es mejor que el de socio
      }
      
      let total = 0;
      if (esCurso) {
        total = precioTitular;
      } else {
        total = precioTitular + (Number(form.acompañantes) * precioBase);
      }
      
      setPrecioCalculado({ total, esSocio: aplicadoSocio, esClave: aplicadoClave });

      // BLOQUEO POR FECHA (Arquitecto)
      if (!esCurso) {
        const ahora = new Date();
        const esSocio = aplicadoSocio || !!socioData;
        const usaCuponApertura = item.cupon && claveInput.trim().toUpperCase() === item.cupon.toUpperCase();

        const fechaSocio = item.apertura_socios ? new Date(item.apertura_socios) : null;
        const fechaCupon = item.fechaCupon ? new Date(item.fechaCupon) : null;
        const fechaGral = item.apertura_general ? new Date(item.apertura_general) : null;

        const puedeCupon = usaCuponApertura && (!fechaCupon || ahora >= fechaCupon);
        const puedeSocio = esSocio && (!fechaSocio || ahora >= fechaSocio);
        const puedeGral = !fechaGral || ahora >= fechaGral;

        if (puedeCupon || puedeSocio || puedeGral) {
          setMensajeBloqueo('');
        } else {
          const locale = language === 'eu' ? 'eu-ES' : 'es-ES';
          if (usaCuponApertura && fechaCupon && ahora < fechaCupon) {
            setMensajeBloqueo(t('reserva.cuponOpens', { date: fechaCupon.toLocaleString(locale) }));
          } else if (esSocio && fechaSocio && ahora < fechaSocio) {
            setMensajeBloqueo(t('reserva.memberOpens', { date: fechaSocio.toLocaleString(locale) }));
          } else if (fechaGral && ahora < fechaGral) {
            setMensajeBloqueo(t('reserva.generalOpens', { date: fechaGral.toLocaleString(locale) }));
          } else {
            setMensajeBloqueo('');
          }
        }
      }
    };
    calcular();
  }, [form.dni, form.acompañantes, claveInput, socioData, esCurso, categoriaActividad, precioBase, item.tiene_descuento, item.precio_descuento, item.cupon, item.precioCupon, item.fechaCupon, item.apertura_general]);

  const handleFirestoreError = (error: unknown, operationType: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    return new Error(JSON.stringify(errInfo));
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;

    // BDD3: Cursos -> DNI, Nombre y Email obligatorios.
    if (esCurso) {
      if (!form.dni || !form.nombre || !form.email) {
        setMensaje(t('reserva.missingFields'));
        return;
      }
    }

    setCargando(true);
    setMensaje('');
    try {
      const dniUpper = form.dni.trim().toUpperCase();

      // VALIDACIÓN DE FECHA DE APERTURA ESCALONADA (Arquitecto)
      if (!esCurso) {
        const ahora = new Date();
        const esSocio = precioCalculado.esSocio || !!socioData;
        const usaCuponApertura = item.cupon && claveInput.trim().toUpperCase() === item.cupon.toUpperCase();
        
        const fechaSocio = item.apertura_socios ? new Date(item.apertura_socios) : null;
        const fechaCupon = item.fechaCupon ? new Date(item.fechaCupon) : null;
        const fechaGral = item.apertura_general ? new Date(item.apertura_general) : null;

        const puedeCupon = usaCuponApertura && (!fechaCupon || ahora >= fechaCupon);
        const puedeSocio = esSocio && (!fechaSocio || ahora >= fechaSocio);
        const puedeGral = !fechaGral || ahora >= fechaGral;

        if (!puedeCupon && !puedeSocio && !puedeGral) {
          const locale = language === 'eu' ? 'eu-ES' : 'es-ES';
          if (usaCuponApertura && fechaCupon) {
            setMensaje(`⚠️ ${t('reserva.cuponOpens', { date: fechaCupon.toLocaleString(locale) })}`);
          } else if (esSocio && fechaSocio) {
            setMensaje(`⚠️ ${t('reserva.memberOpens', { date: fechaSocio.toLocaleString(locale) })}`);
          } else if (fechaGral) {
            if (item.cupon) {
              setMensaje(`⚠️ ${t('reserva.generalOpensCoupon', { date: fechaGral.toLocaleString(locale) })}`);
            } else {
              setMensaje(`⚠️ ${t('reserva.generalOpens', { date: fechaGral.toLocaleString(locale) })}`);
            }
          }
          setCargando(false);
          return;
        }
      }

      // 1.0 VALIDACIÓN DE ACOMPAÑANTES (Arquitecto)
      const maxPermitidos = Number(item.max_acompanantes || 4);
      if (Number(form.acompañantes) > maxPermitidos) {
        setMensaje(t('reserva.aforo.tooMany', { n: maxPermitidos }));
        setCargando(false);
        return;
      }

      // 1. VALIDACIÓN DE UNICIDAD (Solo si hay DNI)
      if (dniUpper) {
        let snapDuplicado;
        try {
          const q = user 
            ? query(collection(db, "reservas"), where("eventoId", "==", item.id), where("uidTitular", "==", user.uid))
            : query(collection(db, "reservas"), where("eventoId", "==", item.id), where("dniTitular", "==", dniUpper));
          snapDuplicado = await getDocs(q);
        } catch (err) {
          throw handleFirestoreError(err, 'list', 'reservas');
        }
        
        if (!snapDuplicado.empty) {
          setMensaje(t('reserva.alreadyBooked'));
          setCargando(false);
          return;
        }

        // 1.1 VALIDACIÓN DE AFORO DINÁMICO
        const aMax = Number(item.aforo_maximo || item.aforo_max || item.aforo_total || 0);
        const aRes = Number(item.aforo_reservado || 0);
        const nuevosSolicitados = 1 + Number(form.acompañantes);

        if (!esCurso && (aRes + nuevosSolicitados > aMax)) {
          setMensaje(t('reserva.aforo.notEnough', { n: Math.max(0, aMax - aRes) }));
          setCargando(false);
          return;
        }

        const aforoDisponibleManual = item.aforo_disponible !== false;
        if (!aforoDisponibleManual) {
          setMensaje(t('reserva.aforo.courseNoCapacity'));
          setCargando(false);
          return;
        }
      }

      // 2. VERIFICACIÓN DE SOCIO (Ya calculada en precioCalculado)
      const esSocioReal = precioCalculado.esSocio;

      // 3. CÁLCULO DE SLOTS
      const slots = [];
      const precioSocio = item.tiene_descuento ? Number(item.precio_descuento) : 0;
      const precioTitular = esSocioReal ? precioSocio : precioBase;

      slots.push({
        dni: dniUpper || 'INVITADO',
        nombre: form.nombre,
        email: form.email, // Guardamos el email para el admin
        tipo: 'titular',
        estado: esSocioReal ? 'validado_socio' : 'pendiente',
        precio: precioTitular
      });

      if (!esCurso) {
        for (let i = 0; i < Number(form.acompañantes); i++) {
          slots.push({ tipo: 'acompañante', estado: 'pendiente', precio: precioBase });
        }
      }

      // 4. GUARDAR RESERVA (TRANSACCIÓN ATÓMICA)
      const tID = Math.random().toString(36).substring(2, 8).toUpperCase();
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=KALIAN-RES-${tID}`;

      const reservaData = {
        eventoId: item.id,
        eventoTitulo: item.titulo,
        categoria: categoriaActividad,
        uidTitular: user?.uid || 'invitado',
        dniTitular: dniUpper,
        nombreTitular: form.nombre,
        emailTitular: form.email,
        ticketID: tID,
        qrUrl: qrUrl,
        numPersonas: 1 + Number(form.acompañantes),
        totalPagar: precioCalculado.total,
        fechaReserva: new Date().toISOString(),
        fechaActividad: item.fecha || item.fechaFin || '',
        slots: slots,
        totalPendiente: slots.reduce((acc, s) => acc + (s.estado === 'pendiente' ? s.precio : 0), 0),
        esCurso: esCurso,
        acompañantes: Number(form.acompañantes),
        asistentes_ingresados: 0,
        cuponUsado: claveValida ? claveInput : null,
        esSocio: esSocioReal
      };

      try {
        await runTransaction(db, async (transaction) => {
          const eventRef = doc(db, esCurso ? "cursos" : "eventos", item.id);
          const eventDoc = await transaction.get(eventRef);
          
          if (!eventDoc.exists()) throw new Error("El evento ya no existe.");
          
          if (!esCurso) {
            const eData = eventDoc.data();
            const currentMax = Number(eData.aforo_maximo || eData.aforo_max || 0);
            const currentRes = Number(eData.aforo_reservado || 0);
            const totalNuevos = 1 + Number(form.acompañantes);

            if (currentRes + totalNuevos > currentMax) {
              throw new Error(`AFORO_FULL|${Math.max(0, currentMax - currentRes)}`);
            }

            transaction.update(eventRef, {
              aforo_reservado: increment(totalNuevos)
            });
          }

          const newResRef = doc(collection(db, "reservas"));
          transaction.set(newResRef, reservaData);
        });
      } catch (err: any) {
        if (err.message?.includes("AFORO_FULL") || err.message === "El evento ya no existe.") {
          throw err;
        }
        throw handleFirestoreError(err, 'write', `eventos/${item.id} + reservas (transacción)`);
      }

      if (esCurso) {
        setMensaje(t('reserva.courseSuccess'));
        setTimeout(alCerrar, 6000);
      } else {
        setResultado({ ticketID: tID, qrUrl: qrUrl, nombre: form.nombre });
        // Pre-rellenar email para el envío del QR si el usuario lo puso en el form
        if (form.email) setEmailEnvio(form.email);
      }

    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("AFORO_FULL")) {
        const plazas = err.message.split("|")[1] || "0";
        setMensaje(t('reserva.aforo.raceCondition', { n: plazas }));
      } else {
        setMensaje(t('reserva.error', { msg: err.message }));
      }
    }
    setCargando(false);
  };

  const enviarEmailManual = async () => {
    if (!emailEnvio || !resultado) return;
    setCargando(true);
    try {
      await addDoc(collection(db, "mail"), {
        to: emailEnvio,
        message: {
          subject: `Confirmación Kalian: ${item.titulo}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
              <h2 style="color: #4f46e5; text-transform: uppercase;">¡Reserva Confirmada!</h2>
              <p>Hola <b>${resultado.nombre}</b>,</p>
              <p>Tu reserva para <b>${item.titulo}</b> ha sido registrada con éxito.</p>
              <div style="background: #f9fafb; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
                <p style="font-size: 10px; color: #9ca3af; text-transform: uppercase; margin-bottom: 10px;">ID de Ticket</p>
                <p style="font-size: 32px; font-weight: 900; letter-spacing: 5px; margin: 0;">${resultado.ticketID}</p>
                <img src="${resultado.qrUrl}" alt="QR" style="margin-top: 20px; width: 200px;">
              </div>
              <p style="font-size: 12px; color: #6b7280;">Presenta este código en la entrada. El pago de los acompañantes (si los hay) se realizará en efectivo.</p>
            </div>
          `
        }
      });
      setEmailEnviado(true);
    } catch (err) {
      console.error(err);
    }
    setCargando(false);
  };

  const descargarTicket = async () => {
    if (!resultado) return;
    try {
      const response = await fetch(resultado.qrUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Ticket-Kalian-${resultado.ticketID}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error al descargar:", err);
      // Fallback simple si falla el fetch (CORS)
      window.open(resultado.qrUrl, '_blank');
    }
  };

  if (resultado) {
    return (
      <div className="bg-white rounded-[3rem] shadow-2xl max-w-lg w-full text-center p-10 space-y-6 animate-in zoom-in duration-300 overflow-y-auto max-h-[90vh] relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500 rounded-t-[3rem]"></div>
        <h2 className="text-4xl kalian-poster-text italic uppercase text-emerald-600 tracking-tight">{t('reserva.bookingReady')}</h2>
        <p className="text-slate-500 font-black uppercase text-[10px] tracking-[0.4em]">{t('reserva.showAtEntrance')}</p>
        
        <div className="bg-slate-50 p-10 rounded-[3rem] border-2 border-emerald-100 inline-block shadow-inner">
          <img src={resultado.qrUrl} alt="QR Ticket" className="w-56 h-56 mx-auto" />
          <p className="mt-6 font-mono font-black text-3xl text-slate-900 tracking-[0.4em]">{resultado.ticketID}</p>
        </div>

        <div className="flex flex-col gap-4 max-w-sm mx-auto">
          <button
            onClick={descargarTicket}
            className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-500 transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20"
          >
            {t('reserva.download')}
          </button>

          {!emailEnviado ? (
            <div className="bg-slate-50 p-6 rounded-[2rem] space-y-4 border border-slate-100">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t('reserva.emailPrompt')}</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="tu@email.com"
                  className="flex-1 p-4 bg-white rounded-xl text-xs outline-none border border-slate-200 focus:border-indigo-500 transition-colors"
                  value={emailEnvio}
                  onChange={e => setEmailEnvio(e.target.value)}
                />
                <button
                  onClick={enviarEmailManual}
                  disabled={cargando || !emailEnvio}
                  className="bg-slate-900 text-white px-6 rounded-xl font-black text-[10px] uppercase disabled:opacity-50 hover:bg-black transition-colors"
                >
                  {t('reserva.send')}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 p-6 rounded-[2rem] text-emerald-600 font-black text-xs uppercase tracking-widest border border-emerald-100">
              {t('reserva.emailSent')}
            </div>
          )}
        </div>

        <button
          onClick={alCerrar}
          className="w-full bg-slate-100 text-slate-500 p-6 rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] hover:bg-slate-200 transition-all"
        >{t('reserva.close')}</button>
      </div>
    );
  }

  return (
    <div className="bg-kalian-dark rounded-[2.5rem] shadow-2xl max-w-lg w-full relative text-kalian-cream border border-kalian-gold/20 flex flex-col max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
      {/* CABECERA CON IMAGEN */}
      <div className="relative h-56 flex-shrink-0">
        {item.imagenUrl ? (
          <img
            src={item.imagenUrl}
            alt={itemTitulo}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full bg-kalian-gold/5 flex items-center justify-center">
            <span className="text-8xl kalian-poster-text text-kalian-gold/10 uppercase italic">{itemTitulo.charAt(0)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-kalian-dark via-kalian-dark/40 to-transparent"></div>
        <button 
          onClick={alCerrar} 
          className="absolute top-6 right-6 w-10 h-10 bg-black/40 backdrop-blur-md text-kalian-gold rounded-full flex items-center justify-center font-black text-xl hover:bg-kalian-gold hover:text-black transition-all z-20"
        >
          ✕
        </button>
        
        <div className="absolute bottom-6 left-8 right-8 z-10">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.3em] bg-kalian-gold/10 px-3 py-1 rounded-full border border-kalian-gold/20 backdrop-blur-sm">
              {esCurso ? t('reserva.course') : t('reserva.event')}
            </span>
            <span
              className="text-[10px] font-black text-white uppercase tracking-[0.3em] px-3 py-1 rounded-full border border-white/20 backdrop-blur-sm flex items-center gap-2"
              style={{ backgroundColor: (item.sala || 'SALA GRANDE') === 'Estudio' ? '#f59e0b44' : ((item.sala || 'SALA GRANDE') === 'Local Pequeño' ? '#10b98144' : '#3b82f644') }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: (item.sala || 'SALA GRANDE') === 'Estudio' ? '#f59e0b' : ((item.sala || 'SALA GRANDE') === 'Local Pequeño' ? '#10b981' : '#3b82f6') }}
              ></div>
              {item.sala || 'SALA GRANDE'}
            </span>
            {item.tiene_descuento && (
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20 backdrop-blur-sm">
                {t('reserva.discountTag', { cat: getNombreCategoria(categoriaActividad) })}
              </span>
            )}
          </div>
          <h2 className="text-4xl md:text-5xl kalian-poster-text text-kalian-gold leading-none tracking-tight uppercase italic drop-shadow-2xl">{itemTitulo}</h2>
        </div>
      </div>

      {/* CONTENIDO SCROLLABLE */}
      <div className="flex-1 overflow-y-auto p-8 md:p-10 space-y-10 custom-scrollbar">
        
        {/* BLOQUE IMPORTANTE (REGLAS) */}
        {tField(item, 'reglas') && (
          <div className="bg-kalian-gold/5 p-8 rounded-[2.5rem] border border-kalian-gold/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-kalian-gold/5 rounded-full blur-2xl -mr-12 -mt-12"></div>
            <h3 className="text-[10px] font-black text-kalian-gold uppercase tracking-[0.5em] mb-6 flex items-center gap-3">
              <span className="w-2 h-2 bg-kalian-gold rounded-full animate-pulse"></span>
              {t('event.important')}
            </h3>
            <ul className="space-y-4">
              {tField(item, 'reglas').split('\n').filter((r: string) => r.trim()).map((regla: string, idx: number) => (
                <li key={idx} className="text-xs text-kalian-cream/90 font-bold leading-relaxed flex gap-4">
                  <span className="text-kalian-gold flex-shrink-0 mt-1">✦</span>
                  <span>{regla}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* BLOQUE DESCRIPCIÓN */}
        {tField(item, 'descripcion') && (
          <div className="px-4">
            <h3 className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-[0.5em] mb-4">{t('event.description')}</h3>
            <p className="text-sm text-kalian-cream/70 font-medium leading-relaxed whitespace-pre-line">
              {tField(item, 'descripcion')}
            </p>
          </div>
        )}

      {/* SECCIÓN DE RESERVA / MENSAJE */}
      <div className="pt-4">
        {mensaje ? (
          <div className="bg-kalian-gold/5 border border-kalian-gold/20 text-kalian-gold p-10 rounded-[2.5rem] text-center font-black kalian-poster-text text-2xl animate-in fade-in zoom-in italic leading-tight">
            {mensaje}
          </div>
        ) : (
          <div className="space-y-8">
            {mensajeBloqueo && (
              <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-[2.5rem] text-center space-y-4">
                <p className="text-red-500 font-black kalian-poster-text text-xl italic uppercase leading-none">
                  ⚠️ {t('event.accessRestricted')}
                </p>
                <p className="text-kalian-cream/60 font-bold text-xs">
                  {mensajeBloqueo}
                </p>
                {item.cupon && (
                  <div className="pt-4 space-y-2">
                    <p className="text-[10px] font-black text-emerald-400/60 uppercase tracking-widest">{t('reserva.earlyAccessCoupon')}</p>
                    <input
                      type="text"
                      placeholder={t('reserva.enterCoupon')}
                      className="w-full p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-center font-black uppercase text-emerald-500 outline-none focus:border-emerald-500 transition-all"
                      value={claveInput}
                      onChange={e => setClaveInput(e.target.value.toUpperCase())}
                    />
                  </div>
                )}
              </div>
            )}

            {!mensajeBloqueo && (
              <form onSubmit={enviar} className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-kalian-gold/90 uppercase tracking-[0.3em] ml-4">
                    {esCurso ? t('reserva.dniRequired') : t('reserva.dniIfMember')}
                  </label>
                  <input
                    type="text" placeholder={esCurso ? t('reserva.dniRequired') : t('reserva.dniForDiscount')} 
                    className="w-full p-5 bg-kalian-gold/10 rounded-2xl font-black uppercase outline-none border border-kalian-gold/20 focus:border-kalian-gold transition-all text-xl text-kalian-gold placeholder:text-kalian-gold/40" 
                    value={form.dni} 
                    onChange={e => setForm({...form, dni: e.target.value.toUpperCase()})} 
                    disabled={!!socioData}
                    required={esCurso}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-kalian-gold/90 uppercase tracking-[0.3em] ml-4">{t('reserva.fullName')}</label>
                  <input
                    type="text" placeholder={t('reserva.fullNamePlaceholder')} 
                    className="w-full p-5 bg-kalian-gold/10 rounded-2xl font-bold outline-none border border-kalian-gold/20 focus:border-kalian-gold transition-all text-kalian-cream placeholder:text-kalian-cream/40" 
                    value={form.nombre} 
                    onChange={e => setForm({...form, nombre: e.target.value})} 
                    required 
                    disabled={!!socioData}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-kalian-gold/90 uppercase tracking-[0.3em] ml-4">
                    {esCurso ? t('reserva.emailRequired') : t('reserva.emailOptional')}
                  </label>
                  <input 
                    type="email" placeholder="tu@email.com" 
                    className="w-full p-5 bg-kalian-gold/10 rounded-2xl font-bold outline-none border border-kalian-gold/20 focus:border-kalian-gold transition-all text-kalian-cream placeholder:text-kalian-cream/40" 
                    value={form.email} 
                    onChange={e => setForm({...form, email: e.target.value})} 
                    required={esCurso}
                    disabled={!!socioData}
                  />
                </div>

                {!esCurso && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-kalian-gold/90 uppercase tracking-[0.3em] ml-4">{t('reserva.discountCode')}</label>
                    <div className="relative">
                      <input
                        type="text" placeholder={t('reserva.hasCoupon')} 
                        className={`w-full p-5 bg-kalian-gold/10 rounded-2xl font-black uppercase outline-none border transition-all text-xl placeholder:text-kalian-gold/40 ${claveValida ? 'border-emerald-500 text-emerald-500' : 'border-kalian-gold/20 focus:border-kalian-gold text-kalian-gold'}`} 
                        value={claveInput} 
                        onChange={e => setClaveInput(e.target.value.toUpperCase())} 
                      />
                      {claveValida && <span className="absolute right-5 top-1/2 -translate-y-1/2 text-emerald-500 text-xl">✓</span>}
                    </div>
                  </div>
                )}

                {!esCurso && (
                  <div className="flex justify-between items-center bg-kalian-gold/5 p-6 rounded-3xl border border-kalian-gold/10">
                    <div>
                      <span className="text-[9px] font-black uppercase text-kalian-gold/80 block mb-1 tracking-widest">{t('reserva.companions')}</span>
                      <span className="text-[10px] text-kalian-gold/60 font-bold italic uppercase">{t('reserva.maxPersons', { n: item.max_acompanantes || 4 })}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        type="button"
                        onClick={() => setForm(f => ({...f, acompañantes: Math.max(0, f.acompañantes - 1)}))}
                        className="w-10 h-10 bg-kalian-gold/10 rounded-xl text-kalian-gold font-black text-xl hover:bg-kalian-gold hover:text-black transition-all"
                      >-</button>
                      <span className="text-2xl font-black text-kalian-gold w-8 text-center">{form.acompañantes}</span>
                      <button 
                        type="button"
                        onClick={() => setForm(f => ({...f, acompañantes: Math.min(item.max_acompanantes || 4, f.acompañantes + 1)}))}
                        className="w-10 h-10 bg-kalian-gold/10 rounded-xl text-kalian-gold font-black text-xl hover:bg-kalian-gold hover:text-black transition-all"
                      >+</button>
                    </div>
                  </div>
                )}
              </div>

              {/* DESGLOSE DE PRECIO */}
              <div className="bg-black/40 p-8 rounded-[2.5rem] border border-kalian-gold/10 space-y-4 shadow-inner">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-kalian-gold/90 tracking-[0.2em]">
                  <span>{esCurso ? t('reserva.monthlyContrib') : t('reserva.baseContrib')}</span>
                  <span>{precioBase}€{esCurso ? '/mes' : ''}</span>
                </div>
                {precioCalculado.esSocio && (
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-kalian-gold/90 tracking-[0.2em]">
                  <span>{t('reserva.memberDiscount')}</span>
                  <span>{item.precio_descuento}€{esCurso ? '/mes' : ''}</span>
                </div>
                )}
                {precioCalculado.esClave && (
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-emerald-400 tracking-[0.2em]">
                  <span>{t('reserva.couponDiscount')}</span>
                  <span>{item.precioCupon}€{esCurso ? '/mes' : ''}</span>
                </div>
                )}
                <div className="flex justify-between items-center pt-4 border-t border-kalian-gold/10">
                  <span className="text-sm font-black uppercase text-kalian-cream tracking-[0.3em]">{t('reserva.total')}</span>
                  <span className="text-5xl kalian-poster-text text-kalian-gold italic drop-shadow-lg">{precioCalculado.total}€{esCurso ? '/mes' : ''}</span>
                </div>
                <p className="text-[9px] text-kalian-gold/30 font-black uppercase text-center pt-2 tracking-widest leading-relaxed">
                  {precioCalculado.esSocio ? t('reserva.memberDiscountApplied', { cat: getNombreCategoria(categoriaActividad).toUpperCase() }) :
                   precioCalculado.esClave ? t('reserva.couponDiscountApplied') :
                   categoriaActividad !== 'ninguno' ? t('reserva.memberDiscountAvail', { cat: getNombreCategoria(categoriaActividad).toUpperCase() }) :
                   t('reserva.noDiscount')}
                </p>
              </div>

              <button 
                disabled={cargando}
                className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-2xl tracking-widest hover:bg-white transition-all flex items-center justify-center gap-4 active:scale-95 shadow-2xl shadow-kalian-gold/20 disabled:opacity-50"
              >
                {cargando ? t('reserva.processing') : (esCurso ? t('reserva.checkEnrollment') : t('reserva.confirmBooking'))}
              </button>
              
              </form>
            )}
            
            {!esCurso && !mensajeBloqueo && (
              <p className="text-center text-[9px] text-kalian-gold/20 font-black uppercase tracking-[0.4em]">
                {t('reserva.cashPayment')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);
};

export default ReservaForm;
