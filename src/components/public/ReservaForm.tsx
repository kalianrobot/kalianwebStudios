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
  const precioBase = Number(item.precio_estandar || item.precio || 0);

  useEffect(() => {
    if (socioData) {
      setForm(f => ({ ...f, dni: socioData.dni, nombre: socioData.nombre, email: socioData.email || '' }));
    }
  }, [socioData]);

  // Cálculo de precio en tiempo real
  useEffect(() => {
    const calcular = async () => {
      let socio = esSocioActivo(categoriaActividad);
      
      // BDD: Socios de "local" tienen mismos descuentos que "musica"
      if (!socio && categoriaActividad === 'musica') {
        socio = esSocioActivo('local');
      }

      const dniUpper = form.dni.trim().toUpperCase();

      if (!socio && dniUpper && !esCurso) {
        try {
          const snap = await getDoc(doc(db, "socios", dniUpper));
          if (snap.exists()) {
            const hoy = new Date().toISOString().split('T')[0];
            const expData = snap.data().expiraciones || {};
            const exp = expData[categoriaActividad] || (categoriaActividad === 'musica' ? expData['local'] : '') || '';
            if (exp >= hoy) socio = true;
          }
        } catch (e) { console.error(e); }
      }

      // BDD1: Descuento socio aplica a eventos y cursos si tienen precio_descuento
      const socioParaPrecio = socio;
      
      let total = 0;
      const precioSocio = item.tiene_descuento ? Number(item.precio_descuento) : 0;
      const precioTitular = socioParaPrecio ? precioSocio : precioBase;

      if (esCurso) {
        total = precioTitular;
      } else {
        total = precioTitular + (Number(form.acompañantes) * precioBase);
      }
      
      setPrecioCalculado({ total, esSocio: socioParaPrecio });
    };
    calcular();
  }, [form.dni, form.acompañantes, socioData, esCurso, categoriaActividad, precioBase, item.tiene_descuento, item.precio_descuento]);

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
        const aforoDisponibleManual = item.aforo_disponible !== false; // Por defecto true si no existe el campo

        if (!aforoDisponibleManual) {
          setMensaje("❌ Lo sentimos, este curso no tiene plazas disponibles actualmente.");
          setCargando(false);
          return;
        }

        let ocupacionActual = 0;
        snapDuplicado.docs.forEach(d => {
          const rData = d.data();
          ocupacionActual += (1 + (rData.acompañantes || 0));
        });

        const nuevosSolicitados = 1 + Number(form.acompañantes);
        
        // BDD: Si es curso, el aforo total es orientativo, pero si el profesor lo cierra manualmente, se respeta.
        // Si no es curso (es evento), validamos aforo numérico estrictamente.
        if (!esCurso && (ocupacionActual + nuevosSolicitados > aforoMax)) {
          setMensaje(`❌ Lo sentimos, no hay aforo suficiente. Quedan ${aforoMax - ocupacionActual} plazas.`);
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
    <div className="bg-kalian-dark p-8 md:p-12 rounded-[3rem] shadow-2xl max-w-md w-full relative text-kalian-cream border border-kalian-gold/20 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-kalian-gold"></div>
      <button onClick={alCerrar} className="absolute top-8 right-8 text-kalian-gold/40 font-black text-2xl hover:text-kalian-gold transition-colors">✕</button>
      
      <h2 className="text-4xl kalian-poster-text text-kalian-gold leading-none mb-2 tracking-tight uppercase italic">{item.titulo}</h2>
      <p className="text-[10px] font-black text-kalian-gold/40 uppercase mb-10 tracking-[0.3em]">
        {esCurso ? '📚 INSCRIPCIÓN CURSO' : '🎟️ RESERVA DE EVENTO'}
      </p>

      {mensaje ? (
        <div className="bg-kalian-gold/5 border border-kalian-gold/20 text-kalian-gold p-12 rounded-[2.5rem] text-center font-black kalian-poster-text text-2xl animate-in fade-in zoom-in italic">
          {mensaje}
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">
              {esCurso ? 'DNI (OBLIGATORIO)' : 'TU IDENTIFICACIÓN (DNI SI ERES SOCIO)'}
            </label>
            <input 
              type="text" placeholder={esCurso ? "DNI OBLIGATORIO" : "DNI PARA DESCUENTO"} 
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl font-black uppercase outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-xl text-kalian-gold" 
              value={form.dni} 
              onChange={e => setForm({...form, dni: e.target.value.toUpperCase()})} 
              disabled={!!socioData}
              required={esCurso}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">NOMBRE COMPLETO</label>
            <input 
              type="text" placeholder="NOMBRE Y APELLIDOS" 
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl font-bold outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream" 
              value={form.nombre} 
              onChange={e => setForm({...form, nombre: e.target.value})} 
              required 
              disabled={!!socioData}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">
              EMAIL {esCurso ? '(OBLIGATORIO)' : '(OPCIONAL PARA RECIBIR EL QR)'}
            </label>
            <input 
              type="email" placeholder="tu@email.com" 
              className="w-full p-5 bg-kalian-gold/5 rounded-2xl font-bold outline-none border border-kalian-gold/10 focus:border-kalian-gold transition-all text-kalian-cream" 
              value={form.email} 
              onChange={e => setForm({...form, email: e.target.value})} 
              required={esCurso}
              disabled={!!socioData}
            />
          </div>

          {!esCurso && (
            <div className="flex justify-between items-center bg-kalian-gold/5 p-6 rounded-3xl border border-kalian-gold/10">
              <div>
                <span className="text-[9px] font-black uppercase text-kalian-gold/40 block mb-1 tracking-widest">Acompañantes</span>
                <span className="text-[10px] text-kalian-gold/20 font-bold italic uppercase">Máximo 4 personas</span>
              </div>
              <input 
                type="number" min="0" max="4"
                className="w-20 bg-kalian-gold/10 p-3 rounded-xl text-center font-black text-2xl text-kalian-gold shadow-sm outline-none border border-kalian-gold/20" 
                value={form.acompañantes} 
                onChange={e => setForm({...form, acompañantes: Number(e.target.value)})} 
              />
            </div>
          )}

          {/* DESGLOSE DE PRECIO */}
          <div className="bg-black/40 p-6 rounded-3xl border border-kalian-gold/10 space-y-3">
            <div className="flex justify-between items-center text-[9px] font-black uppercase text-kalian-gold/40 tracking-widest">
              <span>Aportación Base</span>
              <span>{precioBase}€</span>
            </div>
            {precioCalculado.esSocio && item.tiene_descuento && (
              <div className="flex justify-between items-center text-[9px] font-black uppercase text-kalian-gold tracking-widest">
                <span>Descuento Socio</span>
                <span>{item.precio_descuento}€</span>
              </div>
            )}
            {precioCalculado.esSocio && !item.tiene_descuento && (
              <div className="flex justify-between items-center text-[9px] font-black uppercase text-kalian-gold tracking-widest">
                <span>Descuento Socio</span>
                <span>-100%</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-3 border-t border-kalian-gold/10">
              <span className="text-xs font-black uppercase text-kalian-cream tracking-widest">Total</span>
              <span className="text-4xl kalian-poster-text text-kalian-gold italic">{precioCalculado.total}€</span>
            </div>
            <p className="text-[8px] text-kalian-gold/20 font-black uppercase text-center pt-1 tracking-widest">
              {precioCalculado.esSocio ? '✓ DESCUENTO APLICADO POR SER SOCIO ACTIVO' : 'REGÍSTRATE COMO SOCIO PARA OBTENER DESCUENTOS'}
            </p>
          </div>

          <button 
            disabled={cargando}
            className="w-full bg-kalian-gold text-black p-6 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all flex items-center justify-center gap-3 active:scale-95 shadow-2xl shadow-kalian-gold/20"
          >
            {cargando ? 'PROCESANDO...' : (esCurso ? 'CONSULTAR INSCRIPCIÓN' : 'CONFIRMAR RESERVA')}
          </button>
          
          <p className="text-center text-[9px] text-kalian-gold/20 font-black uppercase tracking-[0.2em]">
            El pago se realizará en efectivo en el centro
          </p>
        </form>
      )}
    </div>
  );
};

export default ReservaForm;
