import React, { useState, useEffect, useRef } from 'react';
import { db, auth as firebaseAuth } from '../../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, increment, onSnapshot, getDoc, addDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Users, Ticket, UserPlus, LogOut, CreditCard, Banknote, Landmark, Calculator, FileDown } from 'lucide-react';
import { registrarIngreso, MetodoPago } from '../../lib/finanzas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const ControlAcceso = ({ isPuertaMode = false }: { isPuertaMode?: boolean }) => {
  const { role, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  
  const [eventos, setEventos] = useState<any[]>([]);
  const [eventoSeleccionado, setEventoSeleccionado] = useState<any>(null);
  const [busqueda, setBusqueda] = useState('');
  const [reservaEncontrada, setReservaEncontrada] = useState<any>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('Efectivo');
  const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mostrarScanner, setMostrarScanner] = useState(false);
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [resumenHoy, setResumenHoy] = useState({ total: 0, count: 0 });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Verificación de socio por slot
  const [verificarSocioSlot, setVerificarSocioSlot] = useState<number | null>(null);
  const [verifDni, setVerifDni] = useState('');
  const [verifMostrarScanner, setVerifMostrarScanner] = useState(false);
  const verifScannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!isPuertaMode && role !== 'admin' && role !== 'portero') {
      navigate('/');
    }
  }, [role, navigate, isPuertaMode]);

  // Lógica del Escáner
  useEffect(() => {
    if (mostrarScanner) {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      const onScan = (decodedText: string) => {
        setBusqueda(decodedText);
        setMostrarScanner(false);
        // B3: en lugar de manipular el DOM con setTimeout(btn.click), invocamos la
        // búsqueda directamente con el valor escaneado (no dependemos del state).
        buscarReserva(decodedText);
      };

      html5QrCode.start({ facingMode: "environment" }, config, onScan, () => {})
        .catch(() => {
          html5QrCode.start({ facingMode: "user" }, config, onScan, () => {})
            .catch(e => { if (import.meta.env.DEV) console.error("Scanner error", e); });
        });

      return () => {
        if (scannerRef.current) {
          const scanner = scannerRef.current;
          if (scanner.isScanning) {
            scanner.stop().then(() => scanner.clear()).catch(e => console.error(e));
          } else {
            scanner.clear();
          }
        }
      };
    }
  }, [mostrarScanner]);

  // Escáner del modal de verificación de socio (lee QR del carnet)
  useEffect(() => {
    if (verifMostrarScanner && verificarSocioSlot !== null) {
      const html5QrCode = new Html5Qrcode("verif-reader");
      verifScannerRef.current = html5QrCode;
      const config = { fps: 10, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 };
      const onScan = (decodedText: string) => {
        setVerifMostrarScanner(false);
        verificarSlotComoSocio(verificarSocioSlot, decodedText);
      };
      html5QrCode.start({ facingMode: "environment" }, config, onScan, () => {})
        .catch(() => {
          html5QrCode.start({ facingMode: "user" }, config, onScan, () => {})
            .catch(e => { if (import.meta.env.DEV) console.error("Verif scanner error", e); });
        });
      return () => {
        if (verifScannerRef.current) {
          const s = verifScannerRef.current;
          if (s.isScanning) s.stop().then(() => s.clear()).catch(() => {});
          else s.clear();
        }
      };
    }
  }, [verifMostrarScanner, verificarSocioSlot]);

  // Cargar eventos de HOY (rango: fecha empieza con YYYY-MM-DD de hoy)
  useEffect(() => {
    const hoy = new Date().toISOString().split('T')[0];
    const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const q = query(collection(db, "eventos"), where("fecha", ">=", hoy), where("fecha", "<", manana));

    if (!user) return;

    const unsubscribe = onSnapshot(q, (snap) => {
      const evs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEventos(evs);
      if (evs.length === 1 && !eventoSeleccionado) {
        setEventoSeleccionado(evs[0]);
      }
    }, (err) => {
      console.error("ControlAcceso: Error en onSnapshot:", err.message);
    });

    return () => unsubscribe();
  }, [eventoSeleccionado, user]);

  // Construye slots virtuales para reservas legacy sin el campo `slots`
  const slotsDesdeReserva = (r: any) => {
    if (Array.isArray(r.slots) && r.slots.length > 0) return r.slots;
    const total = 1 + (r.acompañantes || 0);
    const precioBase = r.precioPorPersona || r.totalPagado / Math.max(1, total) || 0;
    const titular = {
      tipo: 'titular',
      nombre: r.nombreTitular,
      dni: r.dniTitular,
      email: r.emailTitular,
      estado: r.esSocio ? 'validado_socio' : 'pendiente',
      precio: precioBase,
      ingresado: false
    };
    const acomps = Array.from({ length: total - 1 }, () => ({
      tipo: 'acompañante', estado: 'pendiente', precio: precioBase, ingresado: false
    }));
    return [titular, ...acomps];
  };

  const buscarReserva = async (override?: string) => {
    const raw = (override ?? busqueda).trim();
    if (!raw) return;
    setCargando(true);
    setMsg('');
    setReservaEncontrada(null);
    setSocioEncontrado(null);

    try {
      const term = raw.toUpperCase();
      // Extraer ticketID si viene en formato KALIAN-RES-XXXXXX
      const ticketMatch = term.match(/^KALIAN-RES-([A-Z0-9]+)$/);
      const ticketID = ticketMatch ? ticketMatch[1] : (term.length === 6 ? term : null);

      // 1. Si parece un ticketID, buscar globalmente (sin atarse al evento seleccionado)
      if (ticketID) {
        const qTicket = query(collection(db, "reservas"), where("ticketID", "==", ticketID));
        const snapTicket = await getDocs(qTicket);
        if (!snapTicket.empty) {
          const encontrada = { id: snapTicket.docs[0].id, ...snapTicket.docs[0].data() } as any;
          const eventoDeReserva = eventos.find(e => e.id === encontrada.eventoId);
          if (!eventoDeReserva) {
            setMsg(`❌ Esta reserva es para "${encontrada.eventoTitulo}" el ${encontrada.fechaActividad}, no para hoy.`);
            setCargando(false);
            return;
          }
          // Asegurar que el evento de la reserva es el seleccionado
          if (eventoSeleccionado?.id !== eventoDeReserva.id) {
            setEventoSeleccionado(eventoDeReserva);
          }
          const slots = slotsDesdeReserva(encontrada);
          if (slots.every((s: any) => s.ingresado)) {
            setMsg("❌ CUPO COMPLETO: Ya han entrado todos los asistentes de esta reserva");
          } else {
            setReservaEncontrada({ ...encontrada, slots });
          }
          setCargando(false);
          return;
        }
      }

      // 2. Si no era ticketID o no se encontró, buscar dentro del evento seleccionado
      if (eventoSeleccionado) {
        const q = query(collection(db, "reservas"), where("eventoId", "==", eventoSeleccionado.id));
        const snap = await getDocs(q);
        const todas = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        const encontrada = todas.find(r =>
          r.ticketID === term ||
          r.dniTitular === term ||
          r.uidTitular === raw
        );
        if (encontrada) {
          const slots = slotsDesdeReserva(encontrada);
          if (slots.every((s: any) => s.ingresado)) {
            setMsg("❌ CUPO COMPLETO: Ya han entrado todos los asistentes de esta reserva");
          } else {
            setReservaEncontrada({ ...encontrada, slots });
          }
          setCargando(false);
          return;
        }
      }

      // 3. Buscar como socio (QR de carnet). Requiere evento seleccionado.
      if (!eventoSeleccionado) {
        setMsg("⚠️ Selecciona un evento para registrar la entrada de soci@.");
        setCargando(false);
        return;
      }
      let socioSnap = await getDoc(doc(db, "socios", term));
      if (!socioSnap.exists()) {
        const qSocio = query(collection(db, "socios"), where("uid", "==", raw));
        const snapSocio = await getDocs(qSocio);
        if (!snapSocio.empty) socioSnap = snapSocio.docs[0];
      }

      if (socioSnap.exists()) {
        const sData = socioSnap.data();
        const asistenciaRef = doc(db, "asistencia_eventos", `${eventoSeleccionado.id}_${socioSnap.id}`);
        const asistenciaSnap = await getDoc(asistenciaRef);
        if (asistenciaSnap.exists()) {
          setMsg("❌ ERROR: Carnet ya utilizado para este evento");
        } else {
          setSocioEncontrado({ id: socioSnap.id, ...sData });
        }
      } else {
        setMsg("❌ No se encontró reserva ni soci@ con ese identificador");
      }
    } catch (err) {
      console.error(err);
      setMsg("❌ Error en la búsqueda");
    }
    setCargando(false);
  };

  const registrarAsistenciaSocio = async () => {
    if (!socioEncontrado || !eventoSeleccionado) return;
    
    const libres = getLibresReales();
    if (libres <= 0) {
      alert("⚠️ AFORO COMPLETO. No se puede permitir más entradas.");
      return;
    }

    setCargando(true);
    try {
      const hoy = new Date().toISOString().split('T')[0];
      const expData = socioEncontrado.membresias || {};
      let tieneDescuento = false;

      if (eventoSeleccionado.categoria === 'musica') {
        tieneDescuento = (expData['musica'] || '') >= hoy || (expData['local'] || '') >= hoy;
      } else if (eventoSeleccionado.categoria === 'danza') {
        tieneDescuento = (expData['danza'] || '') >= hoy;
      }

      const precio = tieneDescuento ? (eventoSeleccionado.precio_descuento || 0) : (eventoSeleccionado.precio_estandar || 0);

      // Registrar asistencia
      await addDoc(collection(db, "asistencia_eventos"), {
        eventoId: eventoSeleccionado.id,
        socioId: socioEncontrado.id,
        nombre: socioEncontrado.nombre,
        fecha: serverTimestamp(),
        precio: precio,
        tipo: 'socio_carnet'
      });

      // Sumar a caja
      const mesAnio = new Date().toISOString().substring(0, 7);
      await setDoc(doc(db, "caja_eventos", mesAnio), {
        total: increment(precio),
        ultimaActualizacion: serverTimestamp()
      }, { merge: true });

      // Registrar en Finanzas
      if (precio > 0) {
        await registrarIngreso({
          monto: precio,
          concepto: `Entrada Evento: ${eventoSeleccionado.titulo} (Soci@)`,
          categoria: 'Evento',
          metodo: metodoPago,
          socio_id: socioEncontrado.id,
          staff_id: user?.uid
        });
      }

      // Incrementar aforo_actual
      await updateDoc(doc(db, "eventos", eventoSeleccionado.id), {
        aforo_actual: increment(1)
      });

      setMsg(`✅ Acceso concedido a ${socioEncontrado.nombre}. Cobrado: ${precio}€`);
      setSocioEncontrado(null);
      setBusqueda('');
    } catch (err) {
      console.error(err);
      setMsg("❌ Error al registrar asistencia");
    }
    setCargando(false);
  };

  // Verifica un slot como socio: valida contra colección `socios` y aplica descuento.
  // identifier puede ser DNI (doc id de socios) o UID (campo `uid`).
  const verificarSlotComoSocio = async (slotIdx: number, identifier: string) => {
    if (!reservaEncontrada || !eventoSeleccionado) return;
    const term = identifier.trim().toUpperCase();
    if (!term) return;

    setCargando(true);
    try {
      let socioSnap = await getDoc(doc(db, "socios", term));
      if (!socioSnap.exists()) {
        const qSocio = query(collection(db, "socios"), where("uid", "==", identifier.trim()));
        const snapSocio = await getDocs(qSocio);
        if (!snapSocio.empty) socioSnap = snapSocio.docs[0];
      }
      if (!socioSnap.exists()) {
        alert("❌ No se encontró ese soci@.");
        setCargando(false);
        return;
      }
      const sData: any = socioSnap.data();
      const hoy = new Date().toISOString().split('T')[0];
      const exp = sData.membresias || {};
      const cat = eventoSeleccionado.categoria;
      let activo = false;
      if (cat === 'musica') activo = (exp['musica'] || '') >= hoy || (exp['local'] || '') >= hoy;
      else if (cat === 'danza') activo = (exp['danza'] || '') >= hoy;
      else activo = Object.values(exp).some((f: any) => (f || '') >= hoy);

      if (!activo) {
        alert(`⚠️ Soci@ ${sData.nombre} sin membresía activa para ${cat}. No se aplica descuento.`);
        setCargando(false);
        return;
      }

      const precioDescuento = eventoSeleccionado.precio_descuento || 0;
      const nuevosSlots = [...reservaEncontrada.slots];
      nuevosSlots[slotIdx] = {
        ...nuevosSlots[slotIdx],
        estado: 'validado_socio',
        precio: precioDescuento,
        socio_id: socioSnap.id,
        socio_nombre: sData.nombre
      };
      setReservaEncontrada({ ...reservaEncontrada, slots: nuevosSlots });
      setVerificarSocioSlot(null);
      setVerifDni('');
      setVerifMostrarScanner(false);
      setMsg(`✅ Soci@ verificado: ${sData.nombre}. Precio actualizado a ${precioDescuento}€.`);
    } catch (err) {
      console.error(err);
      alert("Error verificando soci@.");
    }
    setCargando(false);
  };

  // Confirma la entrada de un slot concreto: persiste, cobra, actualiza aforo.
  const entrarSlot = async (slotIdx: number) => {
    if (!reservaEncontrada || !eventoSeleccionado) return;
    const slot = reservaEncontrada.slots[slotIdx];
    if (!slot || slot.ingresado) return;

    setCargando(true);
    try {
      const nuevosSlots = [...reservaEncontrada.slots];
      nuevosSlots[slotIdx] = { ...slot, ingresado: true };
      const nuevosIngresados = nuevosSlots.filter((s: any) => s.ingresado).length;
      const total = nuevosSlots.length;

      // 1. Actualizar reserva
      await updateDoc(doc(db, "reservas", reservaEncontrada.id), {
        slots: nuevosSlots,
        asistentes_ingresados: nuevosIngresados,
        estado: nuevosIngresados >= total ? 'validado' : 'pendiente',
        ultimaEntrada: serverTimestamp()
      });

      // 2. Aforo del evento
      await updateDoc(doc(db, "eventos", eventoSeleccionado.id), {
        aforo_reservado: increment(-1),
        aforo_actual: increment(1)
      });

      // 3. Caja del mes
      const mesAnio = new Date().toISOString().substring(0, 7);
      await setDoc(doc(db, "caja_eventos", mesAnio), {
        total: increment(slot.precio || 0),
        ultimaActualizacion: serverTimestamp()
      }, { merge: true });

      // 4. Asistencia
      await addDoc(collection(db, "asistencia_eventos"), {
        eventoId: eventoSeleccionado.id,
        reservaId: reservaEncontrada.id,
        ticketID: reservaEncontrada.ticketID,
        slotTipo: slot.tipo,
        slotNombre: slot.nombre || null,
        slotDni: slot.dni || null,
        socioId: slot.socio_id || null,
        fecha: serverTimestamp(),
        precio: slot.precio || 0,
        tipo: slot.estado === 'validado_socio' ? 'reserva_socio' : 'reserva'
      });

      // 5. Finanzas
      if ((slot.precio || 0) > 0) {
        await registrarIngreso({
          monto: slot.precio,
          concepto: `Entrada Evento: ${eventoSeleccionado.titulo} (${slot.tipo}${slot.estado === 'validado_socio' ? ' Soci@' : ''})`,
          categoria: 'Evento',
          metodo: metodoPago,
          socio_id: slot.socio_id || 'anonimo',
          staff_id: user?.uid
        });
      }

      setReservaEncontrada({ ...reservaEncontrada, slots: nuevosSlots, asistentes_ingresados: nuevosIngresados });
      setMsg(`✅ Entrada registrada (${slot.precio || 0}€). ${nuevosIngresados}/${total}`);
    } catch (err) {
      console.error(err);
      setMsg("❌ Error al registrar entrada");
    }
    setCargando(false);
  };

  const entrarTodosPendientes = async () => {
    if (!reservaEncontrada) return;
    const pendientes = reservaEncontrada.slots
      .map((s: any, i: number) => ({ s, i }))
      .filter(({ s }: any) => !s.ingresado);
    for (const { i } of pendientes) {
      await entrarSlot(i);
    }
  };

  const walkInManual = async () => {
    if (!eventoSeleccionado) return;
    
    const aforoActual = eventoSeleccionado.aforo_actual || 0;
    const aforoReservado = eventoSeleccionado.aforo_reservado || 0;
    const aforoMax = eventoSeleccionado.aforo_maximo || 50;

    // Lógica Crítica: Respetar reservas pendientes
    if (aforoActual + aforoReservado + 1 > aforoMax) {
      alert("⚠️ AFORO COMPLETO (Considerando reservas pendientes). No se puede permitir entrada sin reserva.");
      return;
    }

    if (!window.confirm("¿Confirmar entrada manual (Walk-in)?")) return;

    setCargando(true);
    try {
      const precio = eventoSeleccionado.precio_estandar || 0;

      await updateDoc(doc(db, "eventos", eventoSeleccionado.id), {
        aforo_actual: increment(1)
      });

      // Registrar entrada manual
      await addDoc(collection(db, "asistencia_eventos"), {
        eventoId: eventoSeleccionado.id,
        tipo: 'walk-in',
        fecha: serverTimestamp(),
        staff: isAdmin ? 'admin' : 'portero',
        precio: precio
      });

      // Registrar en Finanzas
      if (precio > 0) {
        await registrarIngreso({
          monto: precio,
          concepto: `Entrada Puerta: ${eventoSeleccionado.titulo} (Walk-in)`,
          categoria: 'Evento',
          metodo: metodoPago,
          socio_id: 'anonimo',
          staff_id: user?.uid
        });
      }

      setMsg(`✅ Entrada manual registrada. Cobrado: ${precio}€`);
    } catch (err) {
      console.error(err);
      setMsg("❌ Error al registrar entrada");
    }
    setCargando(false);
  };

  const [socioEncontrado, setSocioEncontrado] = useState<any>(null);

  const getStatusColor = () => {
    if (!eventoSeleccionado) return 'text-kalian-gold';
    const totalOcupado = (eventoSeleccionado.aforo_actual || 0) + (eventoSeleccionado.aforo_reservado || 0);
    const ratio = totalOcupado / (eventoSeleccionado.aforo_maximo || 1);
    if (ratio >= 0.9) return 'text-red-500';
    if (ratio >= 0.7) return 'text-orange-500';
    return 'text-emerald-500';
  };

  const getLibresReales = () => {
    if (!eventoSeleccionado) return 0;
    const totalOcupado = (eventoSeleccionado.aforo_actual || 0) + (eventoSeleccionado.aforo_reservado || 0);
    return Math.max(0, (eventoSeleccionado.aforo_maximo || 0) - totalOcupado);
  };

  const handleLogoutPuerta = async () => {
    await signOut(firebaseAuth);
    window.location.reload();
  };

  const verResumenHoy = async () => {
    setCargando(true);
    try {
      const hoy = new Date();
      hoy.setHours(0,0,0,0);
      
      const q = query(
        collection(db, "finanzas"),
        where("staff_id", "==", user?.uid),
        where("metodo", "==", "Efectivo")
      );
      
      const snap = await getDocs(q);
      let total = 0;
      let count = 0;
      
      snap.docs.forEach(d => {
        const data = d.data();
        const fecha = data.fecha?.toDate();
        if (fecha && fecha >= hoy) {
          total += data.monto || 0;
          count++;
        }
      });
      
      setResumenHoy({ total, count });
      setMostrarResumen(true);
    } catch (err) {
      console.error(err);
      alert("Error al cargar resumen");
    }
    setCargando(false);
  };

  const descargarListadoEmergencia = async () => {
    if (!eventoSeleccionado) return;
    setCargando(true);
    try {
      // 1. Obtener todas las reservas del evento
      const q = query(collection(db, "reservas"), where("eventoId", "==", eventoSeleccionado.id));
      const snap = await getDocs(q);
      const reservas = snap.docs.map(d => d.data());

      // 2. Crear PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Cabecera
      doc.setFontSize(22);
      doc.setTextColor(212, 175, 55); // Kalian Gold
      doc.text("LISTADO DE EMERGENCIA - KALIAN", 14, 20);
      
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text(eventoSeleccionado.titulo.toUpperCase(), 14, 30);
      
      doc.setFontSize(10);
      doc.text(`Fecha: ${new Date(eventoSeleccionado.fecha).toLocaleString()}`, 14, 38);
      doc.text(`Ubicación: ${eventoSeleccionado.sala || 'Kalian Hub'}`, 14, 43);
      doc.text(`Aforo Máx: ${eventoSeleccionado.aforo_maximo}`, 14, 48);

      // Tabla de Asistentes
      const totalAcomp = reservas.reduce((s: number, r: any) => s + Number(r.acompañantes || 0), 0);
      const totalPersonas = reservas.reduce((s: number, r: any) => s + Number(r.numPersonas || (1 + Number(r.acompañantes || 0))), 0);
      doc.text(`Reservas: ${reservas.length} • Titulares: ${reservas.length} • Acompañantes: ${totalAcomp} • Total personas: ${totalPersonas}`, 14, 53);

      const tableData = reservas.map((r: any) => [
        r.nombreTitular || 'N/A',
        r.dniTitular || 'N/A',
        r.esSocio ? 'SOCIO' : 'NO SOCIO',
        String(r.acompañantes ?? Math.max(0, Number(r.numPersonas || 1) - 1)),
        String(r.numPersonas ?? (1 + Number(r.acompañantes || 0))),
        `${r.montoPagado || 0}€ (${r.estado === 'validado' ? 'PAGADO' : 'PENDIENTE'})`,
        r.ticketID || '',
        '' // Check Manual
      ]);

      autoTable(doc, {
        startY: 60,
        head: [['Nombre Completo', 'DNI', 'Categoría', 'Acomp.', 'Total Pax', 'Estado Pago', 'Ticket ID', 'Check Manual']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: [212, 175, 55] },
        styles: { fontSize: 8 },
        columnStyles: { 3: { halign: 'center', cellWidth: 14 }, 4: { halign: 'center', cellWidth: 16 }, 7: { cellWidth: 25 } }
      });

      // Filas de Registro Manual
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text("REGISTRO MANUAL (Acompañantes / Venta en Puerta)", 14, finalY);

      const manualRows = Array.from({ length: 15 }, () => ['', '', '', '', '', '']);
      autoTable(doc, {
        startY: finalY + 5,
        head: [['Nombre Completo', 'DNI', 'Categoría', 'Monto', 'Método', 'Check']],
        body: manualRows,
        theme: 'grid',
        styles: { fontSize: 8, minCellHeight: 10 }
      });

      doc.save(`EMERGENCIA_${eventoSeleccionado.titulo.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Error al generar PDF");
    }
    setCargando(false);
  };

  return (
    <div className="min-h-screen bg-kalian-dark p-4 md:p-8 text-kalian-cream font-sans">
      <header className="max-w-7xl mx-auto mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl md:text-5xl kalian-poster-text text-kalian-gold">CONTROL <span className="text-kalian-cream">ACCESO</span></h1>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-kalian-gold/40 mt-1">Staff de Puerta • Kalian Hub</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={verResumenHoy}
            className="bg-kalian-gold/10 hover:bg-kalian-gold text-kalian-gold hover:text-black border border-kalian-gold/20 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
          >
            <Calculator size={14} /> Resumen de Hoy
          </button>
          {isPuertaMode && (
            <button 
              onClick={handleLogoutPuerta}
              className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
            >
              <LogOut size={14} /> Cerrar Sesión
            </button>
          )}
          <button 
            onClick={() => navigate('/')}
            className="bg-white/5 hover:bg-white/10 border border-white/10 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {/* SELECCIÓN DE EVENTO */}
        <section className="bg-black/40 border border-kalian-gold/20 rounded-[2rem] p-6 mb-8">
          <label className="block text-[10px] font-black uppercase tracking-widest text-kalian-gold/60 mb-4">Seleccionar Evento Activo</label>
          <div className="flex flex-wrap gap-3">
            {eventos.map(ev => (
              <button
                key={ev.id}
                onClick={() => setEventoSeleccionado(ev)}
                className={`px-5 py-3 rounded-xl kalian-poster-text text-lg transition-all border ${eventoSeleccionado?.id === ev.id ? 'bg-kalian-gold text-black border-kalian-gold shadow-2xl shadow-kalian-gold/20' : 'bg-white/5 text-kalian-cream border-white/10 hover:border-kalian-gold/40'}`}
              >
                {ev.titulo}
              </button>
            ))}
          </div>
        </section>

        {eventoSeleccionado ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* COLUMNA IZQUIERDA: ESTADÍSTICAS */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-black/40 border border-kalian-gold/10 rounded-[2.5rem] p-6 flex flex-col items-center text-center justify-center min-h-[160px]">
                <Users size={32} className="text-kalian-gold/40 mb-3" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 opacity-60">Aforo Real</p>
                <h2 className={`text-5xl kalian-poster-text leading-none ${getStatusColor()}`}>
                  {eventoSeleccionado.aforo_actual || 0}
                  <span className="text-xl opacity-40 ml-2">/ {eventoSeleccionado.aforo_maximo}</span>
                </h2>
              </div>

              <div className="bg-black/40 border border-kalian-gold/10 rounded-[2.5rem] p-6 flex flex-col items-center text-center justify-center min-h-[160px]">
                <Ticket size={32} className="text-kalian-gold/40 mb-3" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 text-kalian-gold/60">Comprometidas</p>
                <h2 className="text-5xl kalian-poster-text leading-none text-kalian-cream">
                  {eventoSeleccionado.aforo_reservado || 0}
                </h2>
              </div>

              {/* Botón de Emergencia PDF */}
              <button 
                onClick={descargarListadoEmergencia}
                disabled={cargando}
                className="w-full bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 p-6 rounded-[2.5rem] flex flex-col items-center gap-2 transition-all group"
              >
                <FileDown size={32} className="group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest">Listado de Emergencia (PDF)</span>
              </button>

              {/* Selector de Método de Pago */}
              <div className="bg-kalian-gold/5 border border-kalian-gold/20 rounded-[2.5rem] p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 text-kalian-gold text-center">Método de Cobro en Puerta</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'Efectivo', icon: <Banknote size={16} />, disabled: false },
                    { id: 'Tarjeta', icon: <CreditCard size={16} />, disabled: true }
                  ].map(m => (
                    <button
                      key={m.id}
                      disabled={m.disabled}
                      onClick={() => setMetodoPago(m.id as MetodoPago)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${m.disabled ? 'opacity-30 cursor-not-allowed border-white/5' : (metodoPago === m.id ? 'bg-kalian-gold text-black border-kalian-gold' : 'bg-black/40 text-kalian-gold/40 border-kalian-gold/10 hover:border-kalian-gold/30')}`}
                    >
                      {m.icon}
                      <span className="text-[8px] font-black uppercase">{m.id} {m.disabled && '(Próximamente)'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* COLUMNA DERECHA: ACCIÓN */}
            <div className="lg:col-span-8 space-y-8">
              
              {/* ESCÁNER Y BÚSQUEDA */}
              <section className="bg-kalian-cream rounded-[3rem] p-8 md:p-12 text-black shadow-2xl">
                <div className="flex flex-col md:flex-row gap-6 mb-8">
                  {!mostrarScanner ? (
                    <button 
                      onClick={() => setMostrarScanner(true)}
                      className="flex-1 bg-black text-kalian-gold p-8 rounded-[2rem] flex flex-col items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-xl"
                    >
                      <Camera size={40} />
                      <span className="kalian-poster-text text-2xl uppercase">Activar Escáner QR</span>
                    </button>
                  ) : (
                    <div className="flex-1 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-black/40">Cámara Activa</span>
                        <button onClick={() => setMostrarScanner(false)} className="text-red-500 font-black text-[10px] uppercase tracking-widest flex items-center gap-1">
                          <X size={14} /> Cerrar
                        </button>
                      </div>
                      <div id="reader" className="overflow-hidden rounded-[2rem] border-4 border-black/5 bg-black/5 aspect-square max-w-sm mx-auto"></div>
                    </div>
                  )}

                  <div className="flex-1 flex flex-col justify-center">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-black/40 mb-4">Búsqueda Manual</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="DNI O LOCALIZADOR..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && buscarReserva()}
                        className="flex-1 bg-black/5 border border-black/10 rounded-2xl px-6 py-4 font-bold uppercase tracking-widest text-sm focus:outline-none focus:border-kalian-gold transition-all"
                      />
                      <button
                        onClick={() => buscarReserva()}
                        disabled={cargando}
                        className="bg-black text-kalian-gold px-6 rounded-2xl kalian-poster-text text-xl hover:bg-kalian-gold hover:text-black transition-all"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </div>

                {msg && <p className="text-center font-black uppercase tracking-widest text-xs mb-8 py-3 px-6 bg-black/5 rounded-full">{msg}</p>}

                {/* TARJETA DE VALIDACIÓN RESERVA */}
                {reservaEncontrada && (
                  <div className="bg-white border-4 border-kalian-gold rounded-[2.5rem] p-8 md:p-10 animate-in fade-in zoom-in duration-300 shadow-2xl">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-[10px] font-black text-black/40 uppercase tracking-widest mb-1">Titular de la Reserva</p>
                        <h4 className="text-4xl md:text-5xl kalian-poster-text uppercase leading-none">{reservaEncontrada.nombreTitular}</h4>
                        <p className="text-xs font-bold text-black/60 mt-3 uppercase tracking-widest">{reservaEncontrada.dniTitular}</p>
                        <p className="text-[10px] font-black text-kalian-gold mt-2 uppercase tracking-widest">{reservaEncontrada.eventoTitulo} • {reservaEncontrada.fechaActividad}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-black/40 uppercase tracking-widest mb-1">Total</p>
                        <p className="text-6xl kalian-poster-text text-kalian-gold">{reservaEncontrada.slots.length}</p>
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-3">
                        <span>Progreso</span>
                        <span>{reservaEncontrada.slots.filter((s: any) => s.ingresado).length} de {reservaEncontrada.slots.length}</span>
                      </div>
                      <div className="w-full h-4 bg-black/5 rounded-full overflow-hidden border-2 border-black/5">
                        <div className="h-full bg-kalian-gold transition-all duration-700 ease-out"
                             style={{ width: `${(reservaEncontrada.slots.filter((s: any) => s.ingresado).length / reservaEncontrada.slots.length) * 100}%` }}></div>
                      </div>
                    </div>

                    <div className="space-y-3 mb-6">
                      {reservaEncontrada.slots.map((slot: any, idx: number) => {
                        const esSocio = slot.estado === 'validado_socio';
                        const yaEntro = !!slot.ingresado;
                        const label = slot.tipo === 'titular' ? 'Titular' : `Acompañante ${idx}`;
                        return (
                          <div key={idx} className={`rounded-2xl border-2 p-4 ${yaEntro ? 'bg-emerald-50 border-emerald-200' : 'bg-black/5 border-black/10'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex-1 min-w-[140px]">
                                <p className="text-[9px] font-black uppercase tracking-widest text-black/40">{label}</p>
                                <p className="text-base font-black uppercase">{slot.nombre || (slot.tipo === 'titular' ? reservaEncontrada.nombreTitular : '—')}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {esSocio ? (
                                    <span className="bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full">SOCIO ✓ {slot.socio_nombre ? `(${slot.socio_nombre})` : ''}</span>
                                  ) : (
                                    <span className="bg-black/10 text-black/60 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full">Precio normal</span>
                                  )}
                                  <span className="text-lg kalian-poster-text">{(slot.precio || 0)}€</span>
                                </div>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {yaEntro ? (
                                  <span className="bg-emerald-600 text-white px-4 py-3 rounded-xl kalian-poster-text text-base">✓ ENTRÓ</span>
                                ) : (
                                  <>
                                    {!esSocio && (
                                      <button
                                        onClick={() => { setVerificarSocioSlot(idx); setVerifDni(''); setVerifMostrarScanner(false); }}
                                        disabled={cargando}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                      >
                                        Verificar Socio
                                      </button>
                                    )}
                                    <button
                                      onClick={() => entrarSlot(idx)}
                                      disabled={cargando}
                                      className="bg-black hover:bg-emerald-600 text-kalian-gold hover:text-white px-5 py-3 rounded-xl kalian-poster-text text-lg transition-all"
                                    >
                                      ENTRAR
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => setReservaEncontrada(null)}
                        className="flex-1 text-[10px] font-black uppercase tracking-widest text-black/40 hover:text-black transition-colors"
                      >
                        Cancelar
                      </button>
                      {reservaEncontrada.slots.some((s: any) => !s.ingresado) && (
                        <button
                          onClick={entrarTodosPendientes}
                          disabled={cargando}
                          className="flex-[3] bg-black text-kalian-gold py-6 rounded-2xl kalian-poster-text text-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-2xl"
                        >
                          ENTRAR TODOS LOS PENDIENTES
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* TARJETA DE VALIDACIÓN SOCIO (SIN RESERVA) */}
                {socioEncontrado && (
                  <div className="bg-white border-4 border-indigo-500 rounded-[2.5rem] p-8 md:p-10 animate-in fade-in zoom-in duration-300 shadow-2xl">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Soci@s Identificado</p>
                        <h4 className="text-5xl kalian-poster-text uppercase leading-none">{socioEncontrado.nombre}</h4>
                        <p className="text-xs font-bold text-black/60 mt-3 uppercase tracking-widest">{socioEncontrado.id}</p>
                      </div>
                      <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${socioEncontrado.estado === 'activo' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                        {socioEncontrado.estado}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                      {['musica', 'danza', 'local'].map(cat => {
                        const exp = socioEncontrado.membresias?.[cat];
                        const hoy = new Date().toISOString().split('T')[0];
                        const activo = exp && exp >= hoy;
                        return (
                          <div key={cat} className={`p-4 rounded-2xl border text-center ${activo ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <p className="text-[8px] font-black uppercase tracking-widest text-black/40 mb-1">{cat}</p>
                            <p className={`text-[10px] font-bold ${activo ? 'text-emerald-600' : 'text-red-600'}`}>{activo ? 'ACTIVO' : 'CADUCADO'}</p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-4">
                      <button 
                        onClick={() => setSocioEncontrado(null)}
                        className="flex-1 text-[10px] font-black uppercase tracking-widest text-black/40 hover:text-black transition-colors"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={registrarAsistenciaSocio}
                        disabled={cargando || socioEncontrado.estado !== 'activo'}
                        className="flex-[3] bg-indigo-600 text-white py-6 rounded-2xl kalian-poster-text text-3xl hover:bg-indigo-700 transition-all shadow-2xl"
                      >
                        CONFIRMAR ACCESO
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* ENTRADA SIN RESERVA (WALK-IN MANUAL) */}
              <section className="flex flex-col md:flex-row gap-6 items-center justify-between bg-black/40 border border-kalian-gold/20 rounded-[2.5rem] p-10">
                <div className="text-center md:text-left">
                  <div className="flex items-center gap-3 mb-2 justify-center md:justify-start">
                    <UserPlus size={24} className="text-kalian-gold" />
                    <h3 className="text-3xl kalian-poster-text text-kalian-cream uppercase leading-none">Entrada sin Reserva</h3>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-kalian-cream/40">Solo si el aforo real + reservas lo permite</p>
                </div>
                <button 
                  onClick={walkInManual}
                  disabled={cargando || getLibresReales() <= 0}
                  className={`px-10 py-5 rounded-2xl kalian-poster-text text-2xl transition-all shadow-xl border ${getLibresReales() > 0 ? 'bg-kalian-gold/10 hover:bg-kalian-gold text-kalian-gold hover:text-black border-kalian-gold/30' : 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed'}`}
                >
                  {getLibresReales() > 0 ? '+ AÑADIR WALK-IN' : 'AFORO COMPLETO'}
                </button>
              </section>
            </div>
          </div>
        ) : (
          <div className="text-center py-32 bg-black/20 rounded-[4rem] border border-white/5">
            <p className="kalian-poster-text text-5xl text-kalian-gold/20">Selecciona un evento para empezar</p>
          </div>
        )}
      </main>

      {/* MODAL RESUMEN HOY */}
      {mostrarResumen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="bg-kalian-dark border border-kalian-gold/30 rounded-[3rem] p-10 max-w-md w-full shadow-2xl animate-in zoom-in duration-300">
            <div className="text-center mb-8">
              <Calculator size={48} className="text-kalian-gold mx-auto mb-4" />
              <h2 className="text-4xl kalian-poster-text text-kalian-gold uppercase">Resumen de Turno</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-kalian-gold/40 mt-2">Solo cobros en efectivo hoy</p>
            </div>
            
            <div className="space-y-6 mb-10">
              <div className="bg-black/40 p-8 rounded-[2rem] border border-kalian-gold/10 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-kalian-gold/40 mb-2">Total en Cajón</p>
                <h3 className="text-6xl kalian-poster-text text-kalian-cream leading-none">{resumenHoy.total.toFixed(2)}€</h3>
              </div>
              
              <div className="flex justify-between items-center px-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-kalian-gold/40">Operaciones:</p>
                <p className="text-xl kalian-poster-text text-kalian-gold">{resumenHoy.count}</p>
              </div>
            </div>

            <button
              onClick={() => setMostrarResumen(false)}
              className="w-full bg-kalian-gold text-black py-5 rounded-2xl kalian-poster-text text-xl hover:bg-white transition-all"
            >
              ENTENDIDO
            </button>
          </div>
        </div>
      )}

      {/* MODAL VERIFICAR SOCIO (acompañante) */}
      {verificarSocioSlot !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="bg-kalian-dark border border-indigo-500/30 rounded-[3rem] p-8 max-w-md w-full shadow-2xl">
            <div className="text-center mb-6">
              <h2 className="text-3xl kalian-poster-text text-indigo-400 uppercase">Verificar Soci@</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400/40 mt-2">Aplica descuento a esta entrada</p>
            </div>

            {verifMostrarScanner ? (
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-kalian-cream/60 text-center">Apunta al QR del carnet</p>
                <div id="verif-reader" className="overflow-hidden rounded-2xl bg-black/50 aspect-square max-w-xs mx-auto"></div>
                <button onClick={() => setVerifMostrarScanner(false)} className="w-full text-[10px] font-black uppercase tracking-widest text-kalian-cream/40 hover:text-kalian-cream py-3">
                  Cancelar escáner
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => setVerifMostrarScanner(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-5 rounded-2xl kalian-poster-text text-xl uppercase flex items-center justify-center gap-3"
                >
                  <Camera size={20} /> Escanear QR Carnet
                </button>
                <div className="text-center text-[10px] font-black uppercase tracking-widest text-kalian-cream/40">o</div>
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-kalian-cream/60">DNI del Soci@</p>
                  <input
                    type="text"
                    value={verifDni}
                    onChange={(e) => setVerifDni(e.target.value)}
                    placeholder="12345678A"
                    className="w-full p-4 bg-white/5 rounded-xl border border-white/10 text-kalian-cream text-center uppercase tracking-widest focus:border-indigo-500 outline-none"
                  />
                  <button
                    onClick={() => verificarSlotComoSocio(verificarSocioSlot, verifDni)}
                    disabled={cargando || !verifDni.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white p-4 rounded-xl kalian-poster-text uppercase tracking-widest"
                  >
                    Comprobar DNI
                  </button>
                </div>
                <button
                  onClick={() => { setVerificarSocioSlot(null); setVerifDni(''); }}
                  className="w-full text-[10px] font-black uppercase tracking-widest text-kalian-cream/40 hover:text-kalian-cream py-3"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlAcceso;
