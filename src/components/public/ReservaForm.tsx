import React, { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
import { collection, addDoc, query, where, getDocs, doc, getDoc, DocumentData } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ReservaFormProps {
  item: any; // Evento o Curso
  alCerrar: () => void;
}

const ReservaForm = ({ item, alCerrar }: ReservaFormProps) => {
  const { socioData, esSocioActivo } = useAuth();
  const [form, setForm] = useState({ dni: '', nombre: '', email: '', acompañantes: 0 });
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ ticketID: string, qrUrl: string, nombre: string } | null>(null);
  const [emailEnvio, setEmailEnvio] = useState('');
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [precioCalculado, setPrecioCalculado] = useState({ total: 0, esSocio: false });
  const navigate = useNavigate();
  
  const esCurso = item.fechaFin !== undefined;
  const categoriaActividad = item.categoria || 'musica';
  const precioBase = Number(item.precio_base || item.precio || 0);

  useEffect(() => {
    if (socioData) {
      setForm(f => ({ ...f, dni: socioData.dni, nombre: socioData.nombre, email: socioData.email || '' }));
    }
  }, [socioData]);

  // Cálculo de precio en tiempo real
  useEffect(() => {
    const calcular = async () => {
      let socio = esSocioActivo(categoriaActividad);
      const dniUpper = form.dni.trim().toUpperCase();

      if (!socio && dniUpper && !esCurso) {
        try {
          const snap = await getDoc(doc(db, "socios", dniUpper));
          if (snap.exists()) {
            const hoy = new Date().toISOString().split('T')[0];
            const exp = snap.data().expiraciones?.[categoriaActividad] || '';
            if (exp >= hoy) socio = true;
          }
        } catch (e) { console.error(e); }
      }

      // BDD1: Descuento socio solo aplica a eventos, no a cursos
      const socioParaPrecio = esCurso ? false : socio;
      const total = (socioParaPrecio ? 0 : precioBase) + (Number(form.acompañantes) * precioBase);
      setPrecioCalculado({ total, esSocio: socioParaPrecio });
    };
    calcular();
  }, [form.dni, form.acompañantes, socioData, esCurso, categoriaActividad, precioBase]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;

    // BDD3: Cursos -> DNI, Nombre y Email obligatorios.
    if (esCurso) {
      if (!form.dni || !form.nombre || !form.email) {
        setMensaje("⚠️ Para inscribirte en un curso, el DNI, Nombre y Email son obligatorios.");
        return;
      }
    }

    setCargando(true);
    setMensaje('');
    try {
      const dniUpper = form.dni.trim().toUpperCase();

      // 1. VALIDACIÓN DE UNICIDAD (Solo si hay DNI)
      if (dniUpper) {
        const snapDuplicado = await getDocs(query(collection(db, "reservas"), where("eventoId", "==", item.id)));
        const yaExiste = snapDuplicado.docs.some(d => d.data().dniTitular === dniUpper);
        
        if (yaExiste) {
          setMensaje("⚠️ Este DNI ya tiene una reserva para este evento.");
          setCargando(false);
          return;
        }

        // 1.1 VALIDACIÓN DE AFORO
        const aforoMax = Number(item.aforo_max || item.aforo_total || 0);
        let ocupacionActual = 0;
        snapDuplicado.docs.forEach(d => {
          const rData = d.data();
          ocupacionActual += (1 + (rData.acompañantes || 0));
        });

        const nuevosSolicitados = 1 + Number(form.acompañantes);
        if (ocupacionActual + nuevosSolicitados > aforoMax) {
          setMensaje(`❌ Lo sentimos, no hay aforo suficiente. Quedan ${aforoMax - ocupacionActual} plazas.`);
          setCargando(false);
          return;
        }
      }

      // 2. VERIFICACIÓN DE SOCIO (Ya calculada en precioCalculado)
      const esSocioReal = precioCalculado.esSocio;

      // 3. CÁLCULO DE SLOTS
      const slots = [];
      slots.push({
        dni: dniUpper || 'INVITADO',
        nombre: form.nombre,
        email: form.email, // Guardamos el email para el admin
        tipo: 'titular',
        estado: esSocioReal ? 'validado_socio' : 'pendiente',
        precio: esSocioReal ? 0 : precioBase
      });

      if (!esCurso) {
        for (let i = 0; i < Number(form.acompañantes); i++) {
          slots.push({ tipo: 'acompañante', estado: 'pendiente', precio: precioBase });
        }
      }

      // 4. GUARDAR RESERVA
      const tID = Math.random().toString(36).substring(2, 8).toUpperCase();
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=KALIAN-RES-${tID}`;

      const reservaData = {
        eventoId: item.id,
        eventoTitulo: item.titulo,
        categoria: categoriaActividad,
        uidTitular: user?.uid || 'invitado',
        dniTitular: dniUpper,
        emailTitular: form.email,
        ticketID: tID,
        qrUrl: qrUrl,
        fechaReserva: new Date().toISOString(),
        fechaActividad: item.fecha || item.fechaFin || '', // Guardamos la fecha del evento/curso
        slots: slots,
        totalPendiente: slots.reduce((acc, s) => acc + (s.estado === 'pendiente' ? s.precio : 0), 0),
        esCurso: esCurso,
        acompañantes: Number(form.acompañantes)
      };

      await addDoc(collection(db, "reservas"), reservaData);

      if (esCurso) {
        setMensaje("✅ Solicitud enviada. Debes pasarte por el local para ultimar los detalles y finalizar tu alta al curso (que será tu alta de socio).");
        setTimeout(alCerrar, 6000);
      } else {
        setResultado({ ticketID: tID, qrUrl: qrUrl, nombre: form.nombre });
        // Pre-rellenar email para el envío del QR si el usuario lo puso en el form
        if (form.email) setEmailEnvio(form.email);
      }

    } catch (err: any) {
      console.error("Error en Firestore:", err);
      setMensaje("Error al guardar: " + err.message);
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
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full text-center space-y-6 animate-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
        <h2 className="text-3xl font-black italic uppercase text-emerald-600">¡Reserva Lista!</h2>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Presenta este código en la entrada</p>
        
        <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-emerald-100 inline-block">
          <img src={resultado.qrUrl} alt="QR Ticket" className="w-48 h-48 mx-auto" />
          <p className="mt-4 font-mono font-black text-2xl text-slate-900 tracking-[0.3em]">{resultado.ticketID}</p>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={descargarTicket}
            className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-500 transition-all flex items-center justify-center gap-2"
          >
            📥 Descargar Ticket
          </button>

          {!emailEnviado ? (
            <div className="bg-slate-50 p-4 rounded-2xl space-y-3">
              <p className="text-[9px] font-black uppercase text-slate-400">¿Quieres recibirlo por email?</p>
              <div className="flex gap-2">
                <input 
                  type="email" 
                  placeholder="tu@email.com" 
                  className="flex-1 p-3 bg-white rounded-xl text-xs outline-none border border-slate-200"
                  value={emailEnvio}
                  onChange={e => setEmailEnvio(e.target.value)}
                />
                <button 
                  onClick={enviarEmailManual}
                  disabled={cargando || !emailEnvio}
                  className="bg-slate-900 text-white px-4 rounded-xl font-bold text-[10px] uppercase disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 p-4 rounded-2xl text-emerald-600 font-bold text-xs uppercase">
              ✅ Email enviado con éxito
            </div>
          )}
        </div>

        <button 
          onClick={alCerrar}
          className="w-full bg-slate-200 text-slate-600 p-5 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-300 transition-all"
        >Cerrar</button>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-[3rem] shadow-2xl max-w-md w-full relative text-slate-900 border-t-[12px] border-indigo-600">
      <button onClick={alCerrar} className="absolute top-6 right-6 text-slate-300 font-bold text-2xl hover:text-slate-500">✕</button>
      
      <h2 className="text-3xl font-black italic uppercase leading-tight mb-2 tracking-tighter">{item.titulo}</h2>
      <p className="text-[10px] font-bold text-indigo-600 uppercase mb-8 tracking-[0.2em]">
        {esCurso ? '📚 Inscripción Curso' : '🎟️ Reserva de Evento'}
      </p>

      {mensaje ? (
        <div className="bg-slate-900 text-white p-12 rounded-[2.5rem] text-center font-bold italic text-xl animate-in fade-in zoom-in">
          {mensaje}
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-4">
              {esCurso ? 'DNI (Obligatorio)' : 'Tu Identificación (DNI si eres socio)'}
            </label>
            <input 
              type="text" placeholder={esCurso ? "DNI OBLIGATORIO" : "DNI PARA DESCUENTO"} 
              className="w-full p-5 bg-slate-100 rounded-2xl font-black uppercase outline-none focus:ring-2 ring-indigo-500 transition-all text-xl" 
              value={form.dni} 
              onChange={e => setForm({...form, dni: e.target.value.toUpperCase()})} 
              disabled={!!socioData}
              required={esCurso}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Nombre Completo</label>
            <input 
              type="text" placeholder="NOMBRE Y APELLIDOS" 
              className="w-full p-5 bg-slate-100 rounded-2xl font-bold outline-none focus:ring-2 ring-indigo-500 transition-all" 
              value={form.nombre} 
              onChange={e => setForm({...form, nombre: e.target.value})} 
              required 
              disabled={!!socioData}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-4">
              Email {esCurso ? '(Obligatorio)' : '(Opcional para recibir el QR)'}
            </label>
            <input 
              type="email" placeholder="tu@email.com" 
              className="w-full p-5 bg-slate-100 rounded-2xl font-bold outline-none focus:ring-2 ring-indigo-500 transition-all" 
              value={form.email} 
              onChange={e => setForm({...form, email: e.target.value})} 
              required={esCurso}
              disabled={!!socioData}
            />
          </div>

          {!esCurso && (
            <div className="flex justify-between items-center bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-400 block mb-1">Acompañantes</span>
                <span className="text-xs text-indigo-900/50 font-bold italic">Máximo 4 personas</span>
              </div>
              <input 
                type="number" min="0" max="4"
                className="w-20 bg-white p-3 rounded-xl text-center font-black text-2xl text-indigo-600 shadow-sm outline-none" 
                value={form.acompañantes} 
                onChange={e => setForm({...form, acompañantes: Number(e.target.value)})} 
              />
            </div>
          )}

          {/* DESGLOSE DE PRECIO */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-2">
            <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
              <span>Precio Base</span>
              <span>{precioBase}€</span>
            </div>
            {precioCalculado.esSocio && (
              <div className="flex justify-between items-center text-[10px] font-black uppercase text-emerald-500">
                <span>Descuento Socio</span>
                <span>-100%</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-xs font-black uppercase text-slate-900">Total a pagar</span>
              <span className="text-2xl font-black italic text-indigo-600">{precioCalculado.total}€</span>
            </div>
            <p className="text-[8px] text-slate-400 font-bold uppercase text-center pt-1">
              {precioCalculado.esSocio ? '✓ Descuento aplicado por ser socio activo' : 'Regístrate como socio para obtener descuentos'}
            </p>
          </div>

          <button 
            disabled={cargando}
            className="w-full bg-slate-900 text-white p-6 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 active:scale-95"
          >
            {cargando ? 'Procesando...' : (esCurso ? 'Consultar Inscripción' : 'Confirmar Reserva')}
          </button>
          
          <p className="text-center text-[9px] text-slate-400 font-bold uppercase tracking-widest">
            El pago se realizará en efectivo en el centro
          </p>
        </form>
      )}
    </div>
  );
};

export default ReservaForm;
