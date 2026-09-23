import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, where, getDocs, writeBatch, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import {
  Download, Filter, Calendar, TrendingUp, GraduationCap, Users, ArrowLeft, Search, Ticket, Settings, PieChart as PieIcon, BarChart3, ChevronRight, ChevronDown
} from 'lucide-react';
import { fetchConfig, updateConfig, subscribeToConfig } from '../../lib/configService';
import { registrarIngreso, MetodoPago } from '../../lib/finanzas';

interface Transaccion {
  id: string;
  fecha: Timestamp;
  monto: number;
  concepto: string;
  categoria: 'Socio' | 'Curso' | 'Evento' | 'Aportación Socio Local' | 'Cierre Aportación Curso' | 'Pago Artista';
  metodo: 'Efectivo' | 'Tarjeta' | 'Transferencia';
  socio_id: string;
  eventoId?: string;
  cursoId?: string;
  local_id?: string;
  mes?: number;
  anio?: number;
  /** Solo entradas de evento (categoria == 'Evento'). Fallback si faltan: bruto = monto, artista = 0. */
  monto_bruto?: number;
  monto_artista?: number;
}

interface DetalleSocio {
  dni: string;
  nombre: string;
  monto: number;
  profesorId?: string;
}

type Fila =
  | { tipo: 'individual'; t: Transaccion }
  | { tipo: 'grupo'; id: string; titulo: string; total: number; totalBruto: number; totalArtista: number; totalPagadoArtista: number; pendienteArtista: number; ultima: Timestamp; hijos: Transaccion[]; metodo: string };

// Extrae el título del evento del concepto: "Entrada Evento: KALIAN JAZZ (Titular)" → "KALIAN JAZZ"
const extraerTituloEvento = (concepto: string): string | null => {
  const m = concepto.match(/^Entrada (?:Evento|Puerta): (.+?) \(/);
  return m ? m[1] : null;
};

// Extrae el sufijo en paréntesis: "Entrada Evento: X (Titular Soci@)" → "Titular Soci@"
const extraerSufijo = (concepto: string): string => {
  const m = concepto.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : concepto;
};

// Cuánto entró/salió en caja/banco por este movimiento. Para 'Evento', `monto` es el
// neto Kalian (la parte del artista es una deuda a pagar, no ingreso propio), así que
// el cuadre de caja usa el bruto cobrado. 'Pago Artista' ya es un importe plano
// (negativo) y el resto de categorías no tienen split.
const montoCaja = (t: Transaccion): number => t.categoria === 'Evento' ? (t.monto_bruto ?? t.monto) : t.monto;

// 'Evento' (venta de entrada) y 'Pago Artista' (liquidación) se agrupan juntos por
// evento para poder ver, en la misma fila, cuánto se vendió y cuánto se ha pagado ya.
const esMovimientoDeEvento = (t: Transaccion): boolean => t.categoria === 'Evento' || t.categoria === 'Pago Artista';

const agruparMovimientos = (rows: Transaccion[]): Fila[] => {
  const grupos = new Map<string, Transaccion[]>();
  const individuales: Transaccion[] = [];

  for (const t of rows) {
    if (!esMovimientoDeEvento(t)) {
      individuales.push(t);
      continue;
    }
    const key = t.eventoId || extraerTituloEvento(t.concepto) || t.id;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(t);
  }

  const filas: Fila[] = [];
  for (const [id, hijos] of grupos) {
    const entradas = hijos.filter(t => t.categoria === 'Evento');
    const pagosArtista = hijos.filter(t => t.categoria === 'Pago Artista');
    const tituloBase = entradas[0] || hijos[0];
    const titulo = extraerTituloEvento(tituloBase.concepto) || tituloBase.concepto;
    const total = entradas.reduce((a, t) => a + t.monto, 0);
    const totalBruto = entradas.reduce((a, t) => a + (t.monto_bruto ?? t.monto), 0);
    const totalArtista = entradas.reduce((a, t) => a + (t.monto_artista ?? 0), 0);
    const totalPagadoArtista = pagosArtista.reduce((a, t) => a + Math.abs(t.monto), 0);
    const pendienteArtista = totalArtista - totalPagadoArtista;
    const ultima = hijos.reduce((max, t) => (t.fecha.toMillis() > max.toMillis() ? t.fecha : max), hijos[0].fecha);
    const metodos = new Set(hijos.map(h => h.metodo));
    const metodo = metodos.size === 1 ? [...metodos][0] : 'Varios';
    filas.push({ tipo: 'grupo', id, titulo, total, totalBruto, totalArtista, totalPagadoArtista, pendienteArtista, ultima, hijos, metodo });
  }
  for (const t of individuales) filas.push({ tipo: 'individual', t });

  filas.sort((a, b) => {
    const fa = a.tipo === 'grupo' ? a.ultima.toMillis() : a.t.fecha.toMillis();
    const fb = b.tipo === 'grupo' ? b.ultima.toMillis() : b.t.fecha.toMillis();
    return fb - fa;
  });
  return filas;
};

const AdminContabilidad = () => {
  const { user } = useAuth();
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  
  // Selectores de Fecha
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<'mensual' | 'anual'>('mensual');

  const [cuotaGlobal, setCuotaGlobal] = useState(15);
  const [showConfig, setShowConfig] = useState(false);
  const [nuevaCuota, setNuevaCuota] = useState(15);
  const [pagoArtista, setPagoArtista] = useState<{ eventoId: string; titulo: string; pendiente: number } | null>(null);
  const [pagoArtistaImporte, setPagoArtistaImporte] = useState('');
  const [pagoArtistaMetodo, setPagoArtistaMetodo] = useState<MetodoPago>('Efectivo');
  const [guardandoPagoArtista, setGuardandoPagoArtista] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [detalleModal, setDetalleModal] = useState<{ t: Transaccion; detalles: DetalleSocio[] } | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const abrirDetalle = async (t: Transaccion) => {
    if (!t.mes || !t.anio) return;
    const esCierreCurso = t.categoria === 'Cierre Aportación Curso';
    const esAportacionLocal = t.categoria === 'Aportación Socio Local';
    const filterField = esCierreCurso ? 'cursoId' : esAportacionLocal ? 'localId' : null;
    const filterValue = esCierreCurso ? t.cursoId : esAportacionLocal ? t.local_id : null;
    if (!filterField || !filterValue) return;

    setLoadingDetalle(true);
    setDetalleModal({ t, detalles: [] });
    try {
      const q = query(
        collection(db, "pagos_mensuales"),
        where(filterField, "==", filterValue),
        where("mes", "==", t.mes),
        where("anio", "==", t.anio),
        where("pagado", "==", true)
      );
      const snap = await getDocs(q);
      const dnis = snap.docs.map(d => d.data().socioId).filter(Boolean);
      const sociosMap: Record<string, string> = {};
      const dnisBorrados = new Set<string>();
      // Firestore 'in' soporta hasta 30 — para más, partimos.
      for (let i = 0; i < dnis.length; i += 30) {
        const chunk = dnis.slice(i, i + 30);
        if (chunk.length === 0) continue;
        const sQ = query(collection(db, "socios"), where("dni", "in", chunk));
        const sSnap = await getDocs(sQ);
        sSnap.docs.forEach(d => {
          const data = d.data();
          sociosMap[data.dni] = data.nombre || '';
          if (data.deletedAt) dnisBorrados.add(data.dni);
        });
      }
      const detalles: DetalleSocio[] = snap.docs
        .filter(d => {
          const sid = d.data().socioId;
          if (dnisBorrados.has(sid)) return false;        // socio con deletedAt
          if (sociosMap[sid] === undefined) return false; // socio hard-deleted u huérfano
          return true;
        })
        .map(d => {
          const data = d.data();
          return {
            dni: data.socioId,
            nombre: sociosMap[data.socioId] || '—',
            monto: data.monto || 0,
            profesorId: data.profesorId
          };
        }).sort((a, b) => a.nombre.localeCompare(b.nombre));
      setDetalleModal({ t, detalles });
    } catch (err) {
      console.error("Error cargando detalle:", err);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const softDeleteMovimiento = async (t: Transaccion) => {
    const monto = `${t.monto >= 0 ? '+' : ''}${t.monto.toFixed(2)}€`;
    if (!window.confirm(`¿Borrar este movimiento como ajuste manual?\n\n${t.concepto}\n${t.fecha.toDate().toLocaleString()} · ${monto}\n\nSe hace soft-delete: la fila desaparece de la tabla y deja de sumar. La traza queda en Firestore con deletedAt.`)) return;
    try {
      await updateDoc(doc(db, "finanzas", t.id), { deletedAt: serverTimestamp() });
    } catch (err: any) {
      console.error(err);
      alert("Error al borrar movimiento: " + (err.message || "desconocido"));
    }
  };

  const abrirPagoArtista = (fila: Extract<Fila, { tipo: 'grupo' }>) => {
    setPagoArtista({ eventoId: fila.id, titulo: fila.titulo, pendiente: fila.pendienteArtista });
    setPagoArtistaImporte(fila.pendienteArtista > 0 ? fila.pendienteArtista.toFixed(2) : '');
    setPagoArtistaMetodo('Efectivo');
  };

  const guardarPagoArtista = async () => {
    if (!pagoArtista) return;
    const importe = Number(pagoArtistaImporte);
    if (!Number.isFinite(importe) || importe <= 0) {
      alert('Introduce un importe válido (> 0).');
      return;
    }
    setGuardandoPagoArtista(true);
    try {
      await registrarIngreso({
        monto: -importe,
        concepto: `Pago artista: ${pagoArtista.titulo}`,
        categoria: 'Pago Artista',
        metodo: pagoArtistaMetodo,
        eventoId: pagoArtista.eventoId,
        staff_id: user?.uid,
      });
      setPagoArtista(null);
      setPagoArtistaImporte('');
    } catch (err: any) {
      console.error(err);
      alert('Error al registrar el pago: ' + (err.message || 'desconocido'));
    } finally {
      setGuardandoPagoArtista(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  
  const getMesesNombres = () => {
    const formatter = new Intl.DateTimeFormat('es', { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => {
      const name = formatter.format(new Date(2024, i, 1));
      return name.charAt(0).toUpperCase() + name.slice(1);
    });
  };
  const mesesNombres = getMesesNombres();
  const mesesCortos = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  useEffect(() => {
    if (!user) return;
    let q;
    if (viewMode === 'mensual') {
      const inicioMes = new Date(selectedYear, selectedMonth, 1);
      const finMes = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      q = query(
        collection(db, "finanzas"), 
        where("fecha", ">=", Timestamp.fromDate(inicioMes)),
        where("fecha", "<=", Timestamp.fromDate(finMes))
      );
    } else {
      const inicioAnio = new Date(selectedYear, 0, 1);
      const finAnio = new Date(selectedYear, 11, 31, 23, 59, 59);
      q = query(
        collection(db, "finanzas"), 
        where("fecha", ">=", Timestamp.fromDate(inicioAnio)),
        where("fecha", "<=", Timestamp.fromDate(finAnio))
      );
    }

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Transaccion[];
      const filtered = data.filter((t: any) => !t.deletedAt);
      filtered.sort((a, b) => b.fecha.toMillis() - a.fecha.toMillis());
      setTransacciones(filtered);
      setLoading(false);
    }, (err) => {
      console.error("AdminContabilidad: Error en onSnapshot:", err.message);
      setLoading(false);
    });

    const unsubConfig = subscribeToConfig((conf) => {
      setCuotaGlobal(conf.cuotaMensualSocio);
      setNuevaCuota(conf.cuotaMensualSocio);
    });

    return () => {
      unsubscribe();
      unsubConfig();
    };
  }, [selectedMonth, selectedYear, viewMode, user]);

  const handleSaveConfig = async () => {
    if (window.confirm("⚠️ ¿Confirmas el cambio de cuota? La nueva cuota se aplicará a todos los cálculos a partir de ahora.")) {
      try {
        await updateConfig({ cuotaMensualSocio: nuevaCuota });
        setShowConfig(false);
        alert("✅ Configuración actualizada.");
      } catch (err) {
        console.error(err);
        alert("Error al actualizar la configuración.");
      }
    }
  };

  // Cálculos de Resumen. Eventos (entradas + pagos a artista) se lleva como
  // caja aparte (ver card "Caja Eventos" más abajo): su bruto incluye la
  // parte del artista, que es una deuda pendiente de liquidar y no ingreso
  // de Socios/Cursos, así que no suma al total general ni a sus gráficos.
  const totalPeriodo = transacciones.filter(t => !esMovimientoDeEvento(t)).reduce((acc, t) => acc + montoCaja(t), 0);
  const totalCursos = transacciones.filter(t => t.categoria === 'Curso').reduce((acc, t) => acc + t.monto, 0);
  const totalSociosIndividual = transacciones.filter(t => t.categoria === 'Socio').reduce((acc, t) => acc + t.monto, 0);
  const totalSociosLocales = transacciones.filter(t => t.categoria === 'Aportación Socio Local').reduce((acc, t) => acc + t.monto, 0);
  const totalCierresCurso = transacciones.filter(t => t.categoria === 'Cierre Aportación Curso').reduce((acc, t) => acc + t.monto, 0);
  const totalSocios = totalSociosIndividual + totalSociosLocales + totalCierresCurso;
  const entradasTransacciones = transacciones.filter(t => t.categoria === 'Evento');
  const pagosArtistaTransacciones = transacciones.filter(t => t.categoria === 'Pago Artista');
  // Caja Eventos = bruto de entradas + pagos ya hechos al artista (negativos): lo que queda de esa caja.
  const totalEventos = entradasTransacciones.reduce((acc, t) => acc + montoCaja(t), 0)
    + pagosArtistaTransacciones.reduce((acc, t) => acc + t.monto, 0);
  const totalEventosKalian = entradasTransacciones.reduce((acc, t) => acc + t.monto, 0);
  const totalEventosArtista = entradasTransacciones.reduce((acc, t) => acc + (t.monto_artista ?? 0), 0);
  const totalEventosPagadoArtista = pagosArtistaTransacciones.reduce((acc, t) => acc + Math.abs(t.monto), 0);
  const totalEventosPendienteArtista = totalEventosArtista - totalEventosPagadoArtista;

  // Datos para el Gráfico Anual (Barras por mes). Excluye Eventos: caja aparte.
  const getAnnualChartData = () => {
    const data = mesesCortos.map((nombre, i) => {
      const total = transacciones
        .filter(t => !esMovimientoDeEvento(t) && t.fecha.toDate().getMonth() === i)
        .reduce((acc, t) => acc + montoCaja(t), 0);
      return { name: nombre, total };
    });
    return data;
  };

  // Datos para el Gráfico de Tarta. Solo Caja General (Cursos/Socios); Eventos es caja aparte.
  const getPieData = () => [
    { name: 'Cursos', value: totalCursos, color: '#6366f1' },
    { name: 'Socios', value: totalSocios, color: '#f59e0b' }
  ];

  // Datos para el Gráfico Mensual (Últimos 4 meses - solo si estamos en modo mensual)
  const getMonthlyChartData = () => {
    const data = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(selectedYear, selectedMonth - i, 1);
      const mes = d.getMonth();
      const anio = d.getFullYear();
      
      // Nota: Aquí solo tenemos los datos del mes seleccionado si usamos el query filtrado.
      // Para mostrar 4 meses necesitaríamos un query más amplio.
      // Por simplicidad y eficiencia según el prompt, mostraremos solo el mes actual en el gráfico si está filtrado,
      // o ajustaremos el query. Pero el prompt pide "actualizar automáticamente todos los gráficos con los datos de ese mes específico".
      // Así que en modo mensual, el gráfico de barras mostrará el mes seleccionado.
      
      const total = transacciones
        .filter(t => {
          const fecha = t.fecha.toDate();
          return !esMovimientoDeEvento(t) && fecha.getMonth() === mes && fecha.getFullYear() === anio;
        })
        .reduce((acc, t) => acc + montoCaja(t), 0);
      
      data.push({
        name: mesesCortos[mes],
        total: total,
        isCurrent: mes === selectedMonth && anio === selectedYear
      });
    }
    return data;
  };

  const annualChartData = getAnnualChartData();
  const pieData = getPieData();
  const monthlyChartData = getMonthlyChartData();

  // Exportar a CSV
  const exportToCSV = () => {
    const headers = ["Fecha", "Concepto", "Categoría", "Método", "Bruto", "Kalian", "Artista", "Socio ID"];
    const rows = transacciones
      .filter(t => filtroCategoria === 'todas' || t.categoria === filtroCategoria)
      .map(t => [
        t.fecha.toDate().toLocaleString(),
        t.concepto,
        t.categoria,
        t.metodo,
        `${montoCaja(t)}€`,
        t.categoria === 'Evento' ? `${t.monto}€` : '',
        t.categoria === 'Evento' ? `${t.monto_artista ?? 0}€` : t.categoria === 'Pago Artista' ? `${-Math.abs(t.monto)}€` : '',
        t.socio_id
      ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const filename = viewMode === 'mensual' 
      ? `contabilidad_kalian_${selectedYear}_${selectedMonth + 1}.csv`
      : `contabilidad_kalian_anual_${selectedYear}.csv`;
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const transaccionesFiltradas = transacciones.filter(t =>
    filtroCategoria === 'todas' || t.categoria === filtroCategoria
  );
  const filasAgrupadas = agruparMovimientos(transaccionesFiltradas);

  return (
    <div className="min-h-screen bg-kalian-dark p-6 md:p-12 text-kalian-cream font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <Link to="/staff" className="text-kalian-gold/40 font-black text-[10px] uppercase tracking-[0.3em] hover:text-kalian-gold transition-colors flex items-center gap-2">
              <ArrowLeft size={12} /> Volver al Panel
            </Link>
            <h1 className="text-6xl kalian-poster-text text-kalian-gold mt-4 tracking-tight">CONTABILIDAD <span className="text-kalian-cream">KALIAN</span></h1>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            {/* Toggle Modo de Vista */}
            <div className="flex bg-black/40 p-1 rounded-2xl border border-kalian-gold/20">
              <button 
                onClick={() => setViewMode('mensual')}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'mensual' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/40 hover:text-kalian-gold'}`}
              >
                Mensual
              </button>
              <button 
                onClick={() => setViewMode('anual')}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'anual' ? 'bg-kalian-gold text-black' : 'text-kalian-gold/40 hover:text-kalian-gold'}`}
              >
                Anual
              </button>
            </div>

            <div className="flex items-center gap-3 bg-black/40 border border-kalian-gold/20 px-4 py-2 rounded-2xl">
              <Calendar size={16} className="text-kalian-gold" />
              {viewMode === 'mensual' && (
                <select 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-transparent text-kalian-gold font-bold outline-none cursor-pointer text-sm appearance-none"
                >
                  {mesesNombres.map((nombre, i) => (
                    <option key={i} value={i} className="bg-kalian-dark">{nombre}</option>
                  ))}
                </select>
              )}
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-kalian-gold font-bold outline-none cursor-pointer text-sm appearance-none"
              >
                {[2026, 2027, 2028, 2029, 2030].map(anio => (
                  <option key={anio} value={anio} className="bg-kalian-dark">{anio}</option>
                ))}
              </select>
            </div>
            
            <button 
              onClick={exportToCSV}
              className="bg-kalian-gold text-black px-6 py-3 rounded-2xl kalian-poster-text text-lg tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/10 flex items-center gap-2"
            >
              <Download size={20} /> EXPORTAR CSV
            </button>
            <button 
              onClick={() => setShowConfig(true)}
              className="bg-black/40 border border-kalian-gold/20 text-kalian-gold p-3 rounded-2xl hover:bg-kalian-gold/10 transition-all"
              title="Ajustes Globales"
            >
              <Settings size={24} />
            </button>
          </div>
        </header>

        {/* RESUMEN DE CAJA */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-black/40 border border-kalian-gold/10 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-kalian-gold/40 transition-all duration-500">
            <div className="absolute -right-4 -top-4 text-kalian-gold/5 group-hover:text-kalian-gold/10 transition-colors">
              <TrendingUp size={120} />
            </div>
            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.4em] mb-4">
              {viewMode === 'mensual' ? `Caja General ${mesesNombres[selectedMonth]}` : `Caja General ${selectedYear}`}
            </p>
            <h2 className="text-5xl kalian-poster-text text-kalian-gold leading-none">{totalPeriodo.toFixed(2)}€</h2>
            <div className="mt-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <p className="text-[8px] font-bold text-kalian-cream/40 uppercase tracking-widest">Soci@s + Cursos (sin eventos)</p>
            </div>
          </div>

          <div className="bg-black/40 border border-kalian-gold/10 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-kalian-gold/40 transition-all duration-500">
            <div className="absolute -right-4 -top-4 text-kalian-gold/5 group-hover:text-kalian-gold/10 transition-colors">
              <GraduationCap size={120} />
            </div>
            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.4em] mb-4">Ingresos Cursos</p>
            <h2 className="text-5xl kalian-poster-text text-kalian-cream leading-none">{totalCursos.toFixed(2)}€</h2>
            <div className="mt-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <p className="text-[8px] font-bold text-kalian-cream/40 uppercase tracking-widest">Formación</p>
            </div>
          </div>

          <div className="bg-black/40 border border-kalian-gold/10 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-kalian-gold/40 transition-all duration-500">
            <div className="absolute -right-4 -top-4 text-kalian-gold/5 group-hover:text-kalian-gold/10 transition-colors">
              <Users size={120} />
            </div>
            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.4em] mb-4">Ingresos Soci@s</p>
            <h2 className="text-5xl kalian-poster-text text-kalian-gold leading-none">{totalSocios.toFixed(2)}€</h2>
            <div className="mt-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <p className="text-[8px] font-bold text-kalian-cream/40 uppercase tracking-widest">Cuotas</p>
            </div>
            <div className="mt-2 pt-2 border-t border-kalian-gold/10 space-y-1">
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                <span className="text-kalian-gold/40">Individuales:</span>
                <span className="text-kalian-cream">{totalSociosIndividual.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                <span className="text-kalian-gold/40">Locales:</span>
                <span className="text-kalian-cream">{totalSociosLocales.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                <span className="text-kalian-gold/40">Cierre Curso:</span>
                <span className="text-kalian-cream">{totalCierresCurso.toFixed(2)}€</span>
              </div>
            </div>
          </div>

          <div className="bg-black/40 border border-kalian-gold/10 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-kalian-gold/40 transition-all duration-500">
            <div className="absolute -right-4 -top-4 text-kalian-gold/5 group-hover:text-kalian-gold/10 transition-colors">
              <Ticket size={120} />
            </div>
            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.4em] mb-4">Caja Eventos (aparte)</p>
            <h2 className="text-5xl kalian-poster-text text-kalian-cream leading-none">{totalEventos.toFixed(2)}€</h2>
            <div className="mt-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <p className="text-[8px] font-bold text-kalian-cream/40 uppercase tracking-widest">Puerta y Reservas (bruto)</p>
            </div>
            <div className="mt-2 pt-2 border-t border-kalian-gold/10 space-y-1">
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                <span className="text-kalian-gold/40">Kalian:</span>
                <span className="text-kalian-cream">{totalEventosKalian.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                <span className="text-kalian-gold/40">Artista (total):</span>
                <span className="text-kalian-cream">{totalEventosArtista.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                <span className="text-kalian-gold/40">Pagado al artista:</span>
                <span className="text-kalian-cream">{totalEventosPagadoArtista.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                <span className="text-rose-500/70">Pendiente:</span>
                <span className={totalEventosPendienteArtista > 0 ? 'text-rose-500' : 'text-kalian-cream'}>{totalEventosPendienteArtista.toFixed(2)}€</span>
              </div>
            </div>
          </div>
        </div>

        {/* GRÁFICO Y FILTROS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          <div className={`${viewMode === 'anual' ? 'lg:col-span-12' : 'lg:col-span-8'} bg-black/40 border border-kalian-gold/10 p-10 rounded-[3rem]`}>
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest italic">
                {viewMode === 'mensual' ? `Evolución Caja General (${mesesNombres[selectedMonth]})` : `Caja General Mensual ${selectedYear}`}
              </h3>
              <div className="flex items-center gap-2 text-kalian-gold/40">
                <BarChart3 size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">Gráfico de Barras</span>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={viewMode === 'mensual' ? monthlyChartData : annualChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#ffffff40" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tick={{ fontWeight: 'bold', letterSpacing: '0.1em' }}
                  />
                  <YAxis 
                    stroke="#ffffff40" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => `${value}€`}
                  />
                  <Tooltip 
                    cursor={{ fill: '#ffffff05' }}
                    contentStyle={{ 
                      backgroundColor: '#000', 
                      border: '1px solid #d4af3740', 
                      borderRadius: '1rem',
                      fontSize: '12px',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  />
                  <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                    {(viewMode === 'mensual' ? monthlyChartData : annualChartData).map((entry: any, index: number) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.isCurrent || viewMode === 'anual' ? '#d4af37' : '#d4af3730'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {viewMode === 'mensual' ? (
            <div className="lg:col-span-4 bg-black/40 border border-kalian-gold/10 p-10 rounded-[3rem] flex flex-col justify-center">
              <h3 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest mb-8 italic">Filtros de Listado</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Categoría</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['todas', 'Socio', 'Aportación Socio Local', 'Cierre Aportación Curso', 'Curso', 'Evento', 'Pago Artista'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setFiltroCategoria(cat)}
                        className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${filtroCategoria === cat ? 'bg-kalian-gold text-black border-kalian-gold' : 'bg-white/5 text-kalian-cream/60 border-white/10 hover:border-kalian-gold/40'}`}
                      >
                        {cat === 'Aportación Socio Local' ? 'Locales' : cat === 'Cierre Aportación Curso' ? 'Cierre Curso' : cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-6 bg-kalian-gold/5 rounded-2xl border border-kalian-gold/10">
                  <p className="text-[10px] font-bold text-kalian-gold/60 leading-relaxed italic">
                    "Usa estos filtros para refinar el listado inferior y la exportación a CSV."
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-black/40 border border-kalian-gold/10 p-10 rounded-[3rem]">
                <div className="flex justify-between items-center mb-10">
                  <h3 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest italic">Desglose Caja General ({selectedYear})</h3>
                  <PieIcon size={16} className="text-kalian-gold/40" />
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#000', 
                          border: '1px solid #d4af3740', 
                          borderRadius: '1rem',
                          fontSize: '12px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-6 mt-4">
                    {pieData.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-kalian-cream/60">{entry.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-black/40 border border-kalian-gold/10 p-10 rounded-[3rem] flex flex-col justify-center">
                <h3 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest mb-8 italic">Filtros de Listado</h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Categoría</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['todas', 'Socio', 'Aportación Socio Local', 'Curso', 'Evento', 'Pago Artista'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setFiltroCategoria(cat)}
                          className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${filtroCategoria === cat ? 'bg-kalian-gold text-black border-kalian-gold' : 'bg-white/5 text-kalian-cream/60 border-white/10 hover:border-kalian-gold/40'}`}
                        >
                          {cat === 'Aportación Socio Local' ? 'Locales' : cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* TABLA DE MOVIMIENTOS */}
        <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] overflow-hidden">
          <div className="p-8 border-b border-kalian-gold/10 flex justify-between items-center">
            <h3 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest italic">Últimos Movimientos</h3>
            <span className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-widest">
              {filasAgrupadas.length} {filasAgrupadas.length === 1 ? 'Línea' : 'Líneas'} · {transaccionesFiltradas.length} Transacciones
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-widest border-b border-kalian-gold/10">
                  <th className="p-6 w-8"></th>
                  <th className="p-6">Fecha</th>
                  <th className="p-6">Concepto</th>
                  <th className="p-6">Categoría</th>
                  <th className="p-6 text-center">#</th>
                  <th className="p-6">Método</th>
                  <th className="p-6">Socio ID</th>
                  <th className="p-6 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filasAgrupadas.map((fila) => {
                  if (fila.tipo === 'individual') {
                    const t = fila.t;
                    const esCierreCurso = t.categoria === 'Cierre Aportación Curso';
                    const esAportacionLocal = t.categoria === 'Aportación Socio Local' && t.monto >= 0 && !!t.local_id;
                    const clickable = esCierreCurso || esAportacionLocal;
                    return (
                      <tr
                        key={t.id}
                        onClick={clickable ? () => abrirDetalle(t) : undefined}
                        className={`border-b border-white/5 hover:bg-white/5 transition-colors group ${clickable ? 'cursor-pointer hover:bg-kalian-gold/5' : ''}`}
                      >
                        <td className="p-6">{clickable && <ChevronRight size={14} className="text-kalian-gold/40" />}</td>
                        <td className="p-6 text-[10px] font-mono text-kalian-cream/40">{t.fecha.toDate().toLocaleString()}</td>
                        <td className="p-6">
                          <p className="text-sm font-bold text-kalian-cream group-hover:text-kalian-gold transition-colors">{t.concepto}</p>
                          {clickable && (
                            <p className="text-[9px] font-black uppercase tracking-widest text-kalian-gold/40 mt-1">
                              {esCierreCurso ? 'Click para ver alumnos →' : 'Click para ver soci@s →'}
                            </p>
                          )}
                        </td>
                        <td className="p-6">
                          <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full border ${
                            t.categoria === 'Socio' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                            t.categoria === 'Aportación Socio Local' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                            t.categoria === 'Cierre Aportación Curso' ? 'bg-kalian-gold/10 text-kalian-gold border-kalian-gold/30' :
                            t.categoria === 'Curso' ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' :
                            'bg-rose-500/10 text-rose-500 border-rose-500/20'
                          }`}>
                            {t.categoria === 'Aportación Socio Local' ? 'Local' : t.categoria === 'Cierre Aportación Curso' ? 'Cierre Curso' : t.categoria}
                          </span>
                        </td>
                        <td className="p-6 text-center text-kalian-cream/20">—</td>
                        <td className="p-6 text-[10px] font-black text-kalian-cream/60 uppercase tracking-widest">{t.metodo}</td>
                        <td className="p-6 text-[10px] font-mono text-kalian-gold/40">{t.socio_id}</td>
                        <td className="p-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className={`text-lg kalian-poster-text ${t.monto >= 0 ? 'text-kalian-gold' : 'text-rose-500'}`}>
                              {t.monto >= 0 ? '+' : ''}{t.monto.toFixed(2)}€
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); softDeleteMovimiento(t); }}
                              title="Eliminar este movimiento (ajuste manual)"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500/40 hover:text-red-500 text-sm leading-none px-1"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  // fila.tipo === 'grupo'
                  const abierto = expandidos.has(fila.id);
                  return (
                    <React.Fragment key={fila.id}>
                      <tr
                        onClick={() => toggleExpand(fila.id)}
                        className="border-b border-white/5 hover:bg-kalian-gold/5 transition-colors group cursor-pointer"
                      >
                        <td className="p-6 text-kalian-gold/60">
                          {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </td>
                        <td className="p-6 text-[10px] font-mono text-kalian-cream/40">{fila.ultima.toDate().toLocaleString()}</td>
                        <td className="p-6">
                          <p className="text-sm font-bold text-kalian-cream group-hover:text-kalian-gold transition-colors">{fila.titulo}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-kalian-gold/40 mt-1">
                            Bruto {fila.totalBruto.toFixed(2)}€ · Kalian {fila.total.toFixed(2)}€ · Artista {fila.totalArtista.toFixed(2)}€
                            {fila.totalArtista > 0 && (
                              <> · Pagado {fila.totalPagadoArtista.toFixed(2)}€ · <span className={fila.pendienteArtista > 0 ? 'text-rose-500' : ''}>Pendiente {fila.pendienteArtista.toFixed(2)}€</span></>
                            )}
                          </p>
                        </td>
                        <td className="p-6">
                          <span className="text-[8px] font-black uppercase px-3 py-1 rounded-full border bg-rose-500/10 text-rose-500 border-rose-500/20">
                            Evento
                          </span>
                        </td>
                        <td className="p-6 text-center">
                          <span className="text-sm font-black text-kalian-gold">{fila.hijos.length}</span>
                        </td>
                        <td className="p-6 text-[10px] font-black text-kalian-cream/60 uppercase tracking-widest">{fila.metodo}</td>
                        <td className="p-6">
                          {fila.pendienteArtista > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); abrirPagoArtista(fila); }}
                              className="text-[9px] font-black uppercase tracking-widest text-kalian-gold/60 hover:text-kalian-gold border border-kalian-gold/20 hover:border-kalian-gold/60 rounded-full px-3 py-1 transition-all whitespace-nowrap"
                            >
                              + Pago artista
                            </button>
                          )}
                        </td>
                        <td className="p-6 text-right">
                          <span className="text-lg kalian-poster-text text-kalian-gold">
                            +{fila.totalBruto.toFixed(2)}€
                          </span>
                        </td>
                      </tr>
                      {abierto && fila.hijos.map(h => (
                        <tr key={h.id} className="border-b border-white/5 bg-black/30 text-kalian-cream/70">
                          <td className="p-3"></td>
                          <td className="p-3 pl-10 text-[10px] font-mono text-kalian-cream/40">{h.fecha.toDate().toLocaleString()}</td>
                          <td className="p-3 text-[12px] font-bold">
                            {h.categoria === 'Pago Artista' ? h.concepto : extraerSufijo(h.concepto)}
                            {h.categoria === 'Pago Artista' ? (
                              <span className="block text-[9px] font-black uppercase tracking-widest text-rose-500/60 mt-0.5">Liquidación al artista</span>
                            ) : (
                              <span className="block text-[9px] font-black uppercase tracking-widest text-kalian-cream/30 mt-0.5">
                                Bruto {(h.monto_bruto ?? h.monto).toFixed(2)}€ · Kalian {h.monto.toFixed(2)}€ · Artista {(h.monto_artista ?? 0).toFixed(2)}€
                              </span>
                            )}
                          </td>
                          <td className="p-3"></td>
                          <td className="p-3"></td>
                          <td className="p-3 text-[10px] font-black uppercase tracking-widest text-kalian-cream/50">{h.metodo}</td>
                          <td className="p-3 text-[10px] font-mono text-kalian-gold/40">{h.socio_id}</td>
                          <td className="p-3 text-right">
                            <span className={`text-sm kalian-poster-text ${h.categoria === 'Pago Artista' ? 'text-rose-500' : 'text-kalian-cream'}`}>
                              {h.categoria === 'Pago Artista' ? `-${Math.abs(h.monto).toFixed(2)}` : (h.monto_bruto ?? h.monto).toFixed(2)}€
                            </span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                {filasAgrupadas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-20 text-center">
                      <p className="text-kalian-gold/20 kalian-poster-text text-3xl uppercase">No hay movimientos registrados</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL DETALLE (Cierre Curso / Aportación Local) */}
        {detalleModal && (() => {
          const esLocal = detalleModal.t.categoria === 'Aportación Socio Local';
          const titulo = esLocal ? 'Detalle Aportación Local' : 'Detalle del Cierre';
          const etiquetaPersona = esLocal ? 'Soci@' : 'Alumno';
          const etiquetaTotal = esLocal ? 'soci@s' : 'alumnos';
          const vacioMsg = esLocal
            ? 'No hay pagos activos (¿aportación revertida?)'
            : 'No hay pagos asociados (¿cierre revertido?)';
          return (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetalleModal(null)}>
            <div className="bg-kalian-dark border border-kalian-gold/30 w-full max-w-2xl rounded-[3rem] shadow-2xl p-10 relative max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <button onClick={() => setDetalleModal(null)} className="absolute top-8 right-8 text-kalian-gold/40 hover:text-kalian-gold text-2xl">×</button>
              <h3 className="text-2xl kalian-poster-text text-kalian-gold mb-2 italic uppercase">{titulo}</h3>
              <p className="text-sm text-kalian-cream/70 mb-6">{detalleModal.t.concepto}</p>

              {loadingDetalle ? (
                <p className="text-center py-10 text-kalian-gold/40 font-black uppercase tracking-widest animate-pulse">Cargando…</p>
              ) : detalleModal.detalles.length === 0 ? (
                <p className="text-center py-10 text-kalian-gold/40 font-black uppercase tracking-widest italic">{vacioMsg}</p>
              ) : (
                <>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-widest border-b border-kalian-gold/10">
                        <th className="py-3">{etiquetaPersona}</th>
                        <th className="py-3">DNI</th>
                        <th className="py-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalleModal.detalles.map(d => (
                        <tr key={d.dni} className="border-b border-white/5">
                          <td className="py-3 text-kalian-cream font-bold">{d.nombre}</td>
                          <td className="py-3 text-[10px] font-mono text-kalian-gold/40">{d.dni}</td>
                          <td className="py-3 text-right text-kalian-cream">{d.monto.toFixed(2)}€</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-kalian-gold/20">
                        <td colSpan={2} className="py-4 text-[10px] font-black uppercase tracking-widest text-kalian-gold/60">Total ({detalleModal.detalles.length} {etiquetaTotal})</td>
                        <td className="py-4 text-right text-xl kalian-poster-text text-kalian-gold">
                          {detalleModal.detalles.reduce((a, d) => a + d.monto, 0).toFixed(2)}€
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </div>
          </div>
          );
        })()}

        {/* MODAL PAGO ARTISTA */}
        {pagoArtista && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !guardandoPagoArtista && setPagoArtista(null)}>
            <div className="bg-kalian-dark border border-kalian-gold/30 w-full max-w-md rounded-[3rem] shadow-2xl p-10 relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => !guardandoPagoArtista && setPagoArtista(null)} className="absolute top-8 right-8 text-kalian-gold/40 hover:text-kalian-gold text-2xl">×</button>
              <h3 className="text-2xl kalian-poster-text text-kalian-gold mb-2 italic uppercase">Pago al artista</h3>
              <p className="text-sm text-kalian-cream/70 mb-6">{pagoArtista.titulo}</p>

              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">
                    Pendiente de liquidar: {pagoArtista.pendiente.toFixed(2)}€
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    autoFocus
                    className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold text-kalian-gold font-bold text-2xl kalian-poster-text"
                    value={pagoArtistaImporte}
                    onChange={(e) => setPagoArtistaImporte(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Método</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Efectivo', 'Tarjeta', 'Transferencia'] as MetodoPago[]).map(m => (
                      <button
                        key={m}
                        onClick={() => setPagoArtistaMetodo(m)}
                        className={`px-3 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${pagoArtistaMetodo === m ? 'bg-kalian-gold text-black border-kalian-gold' : 'bg-white/5 text-kalian-cream/60 border-white/10 hover:border-kalian-gold/40'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-kalian-gold/5 rounded-2xl border border-kalian-gold/10">
                  <p className="text-[10px] font-bold text-kalian-gold/60 leading-relaxed italic">
                    "Registra el importe que Kalian ya ha entregado al artista para este evento. Se resta de la caja del evento y reduce lo pendiente de liquidar."
                  </p>
                </div>

                <button
                  onClick={guardarPagoArtista}
                  disabled={guardandoPagoArtista}
                  className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20 disabled:opacity-50"
                >
                  {guardandoPagoArtista ? 'GUARDANDO…' : 'REGISTRAR PAGO'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CONFIGURACIÓN */}
        {showConfig && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-kalian-dark border border-kalian-gold/20 w-full max-w-md rounded-[3rem] shadow-2xl p-10 relative">
              <button onClick={() => setShowConfig(false)} className="absolute top-8 right-8 text-kalian-gold/40 hover:text-kalian-gold text-2xl">×</button>
              <h3 className="text-3xl kalian-poster-text text-kalian-gold mb-8 italic uppercase">Ajustes Globales</h3>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Cuota Mensual Estándar (€)</p>
                  <input 
                    type="number" 
                    className="w-full p-5 bg-kalian-gold/5 rounded-2xl outline-none border border-kalian-gold/10 focus:border-kalian-gold text-kalian-gold font-bold text-2xl kalian-poster-text"
                    value={nuevaCuota}
                    onChange={(e) => setNuevaCuota(Number(e.target.value))}
                  />
                </div>
                
                <div className="p-6 bg-kalian-gold/5 rounded-2xl border border-kalian-gold/10">
                  <p className="text-[10px] font-bold text-kalian-gold/60 leading-relaxed italic">
                    "Este valor se utiliza para calcular las aportaciones de locales y los descuentos en cursos. Solo debe ser modificado por administradores."
                  </p>
                </div>

                <button 
                  onClick={handleSaveConfig}
                  className="w-full bg-kalian-gold text-black p-5 rounded-2xl kalian-poster-text text-xl tracking-widest hover:bg-white transition-all shadow-xl shadow-kalian-gold/20"
                >
                  GUARDAR CAMBIOS
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminContabilidad;
