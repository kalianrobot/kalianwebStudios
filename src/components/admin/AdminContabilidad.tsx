import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  Download, Filter, Calendar, TrendingUp, GraduationCap, Users, ArrowLeft, Search, Ticket, Settings
} from 'lucide-react';
import { fetchConfig, updateConfig, subscribeToConfig } from '../../lib/configService';

interface Transaccion {
  id: string;
  fecha: Timestamp;
  monto: number;
  concepto: string;
  categoria: 'Socio' | 'Curso' | 'Evento' | 'Aportación Socio Local';
  metodo: 'Efectivo' | 'Tarjeta' | 'Transferencia';
  socio_id: string;
}

const AdminContabilidad = () => {
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [filtroMes, setFiltroMes] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [cuotaGlobal, setCuotaGlobal] = useState(15);
  const [showConfig, setShowConfig] = useState(false);
  const [nuevaCuota, setNuevaCuota] = useState(15);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  
  const mesesNombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  useEffect(() => {
    const q = query(collection(db, "finanzas"), orderBy("fecha", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Transaccion[];
      setTransacciones(data);
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
  }, []);

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

  const handleSyncHistory = async () => {
    setSyncMsg("🔍 Iniciando escaneo...");
    setSyncing(true);
    try {
      const batch = writeBatch(db);
      let count = 0;

      const localesSnap = await getDocs(collection(db, "locales"));
      const localesMap: Record<string, { id: string, nombre: string, socios: number }> = {};
      localesSnap.docs.forEach(d => {
        const data = d.data();
        localesMap[d.id] = {
          id: d.id,
          nombre: data.nombre,
          socios: data.inquilinos?.length || 0
        };
      });

      const q = query(collection(db, "finanzas"));
      const snap = await getDocs(q);
      
      setSyncMsg(`📊 Analizando ${snap.size} registros...`);

      for (const tDoc of snap.docs) {
        const data = tDoc.data();
        const monto = Number(data.monto) || 0;
        const concepto = data.concepto || "";
        const categoria = data.categoria || "";
        
        if (monto === 0 && (concepto.includes("Local") || categoria === 'Socio')) {
          let localId = data.local_id;
          if (!localId) {
            const localEncontrado = Object.values(localesMap).find(l => concepto.includes(l.nombre));
            if (localEncontrado) localId = localEncontrado.id;
          }

          if (localId && localesMap[localId]) {
            const infoLocal = localesMap[localId];
            const cuota = cuotaGlobal || 15;
            const nuevoMonto = infoLocal.socios * cuota;
            
            if (nuevoMonto > 0) {
              batch.update(tDoc.ref, {
                monto: nuevoMonto,
                categoria: 'Aportación Socio Local',
                concepto: concepto.includes("socios") ? concepto : `${concepto} (${infoLocal.socios} socios)`,
                local_id: localId
              });
              count++;
            }
          }
        }
      }

      if (count > 0) {
        await batch.commit();
        setSyncMsg(`✅ ¡Éxito! ${count} corregidos.`);
      } else {
        setSyncMsg("ℹ️ No se hallaron registros de 0€.");
      }
    } catch (err) {
      console.error(err);
      setSyncMsg("❌ Error en el proceso.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 5000);
    }
  };

  // Cálculos para el Mes Actual
  const transaccionesMesActual = transacciones.filter(t => {
    const fecha = t.fecha.toDate();
    const mesAnio = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    return mesAnio === filtroMes;
  });

  const totalMes = transaccionesMesActual.reduce((acc, t) => acc + t.monto, 0);
  const totalCursos = transaccionesMesActual.filter(t => t.categoria === 'Curso').reduce((acc, t) => acc + t.monto, 0);
  const totalSociosIndividual = transaccionesMesActual.filter(t => t.categoria === 'Socio').reduce((acc, t) => acc + t.monto, 0);
  const totalSociosLocales = transaccionesMesActual.filter(t => t.categoria === 'Aportación Socio Local').reduce((acc, t) => acc + t.monto, 0);
  const totalSocios = totalSociosIndividual + totalSociosLocales;
  const totalEventos = transaccionesMesActual.filter(t => t.categoria === 'Evento').reduce((acc, t) => acc + t.monto, 0);

  // Datos para el Gráfico (Últimos 4 meses)
  const getChartData = () => {
    const data = [];
    const hoy = new Date();
    for (let i = 3; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const mes = d.getMonth();
      const anio = d.getFullYear();
      const mesAnioStr = `${anio}-${String(mes + 1).padStart(2, '0')}`;
      
      const total = transacciones
        .filter(t => {
          const fecha = t.fecha.toDate();
          return fecha.getMonth() === mes && fecha.getFullYear() === anio;
        })
        .reduce((acc, t) => acc + t.monto, 0);
      
      data.push({
        name: `${mesesNombres[mes]}`,
        total: total,
        fullDate: mesAnioStr
      });
    }
    return data;
  };

  const chartData = getChartData();

  // Exportar a CSV
  const exportToCSV = () => {
    const headers = ["Fecha", "Concepto", "Categoría", "Método", "Monto", "Socio ID"];
    const rows = transaccionesMesActual
      .filter(t => filtroCategoria === 'todas' || t.categoria === filtroCategoria)
      .map(t => [
        t.fecha.toDate().toLocaleString(),
        t.concepto,
        t.categoria,
        t.metodo,
        `${t.monto}€`,
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
    link.setAttribute("download", `contabilidad_kalian_${filtroMes}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const transaccionesFiltradas = transaccionesMesActual.filter(t => 
    filtroCategoria === 'todas' || t.categoria === filtroCategoria
  );

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
          <div className="flex gap-4">
            <div className="flex items-center gap-3 bg-black/40 border border-kalian-gold/20 px-4 py-2 rounded-2xl">
              <Calendar size={16} className="text-kalian-gold" />
              <input 
                type="month" 
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className="bg-transparent text-kalian-gold font-bold outline-none cursor-pointer text-sm"
              />
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
            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.4em] mb-4">Total Mes Actual</p>
            <h2 className="text-5xl kalian-poster-text text-kalian-gold leading-none">{totalMes.toFixed(2)}€</h2>
            <div className="mt-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <p className="text-[8px] font-bold text-kalian-cream/40 uppercase tracking-widest">Ingresos validados</p>
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
            </div>
          </div>

          <div className="bg-black/40 border border-kalian-gold/10 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-kalian-gold/40 transition-all duration-500">
            <div className="absolute -right-4 -top-4 text-kalian-gold/5 group-hover:text-kalian-gold/10 transition-colors">
              <Ticket size={120} />
            </div>
            <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.4em] mb-4">Ingresos Eventos</p>
            <h2 className="text-5xl kalian-poster-text text-kalian-cream leading-none">{totalEventos.toFixed(2)}€</h2>
            <div className="mt-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <p className="text-[8px] font-bold text-kalian-cream/40 uppercase tracking-widest">Puerta y Reservas</p>
            </div>
          </div>
        </div>

        {/* GRÁFICO Y FILTROS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          <div className="lg:col-span-8 bg-black/40 border border-kalian-gold/10 p-10 rounded-[3rem]">
            <h3 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest mb-10 italic">Evolución Ingresos (4 Meses)</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
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
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.fullDate === filtroMes ? '#d4af37' : '#d4af3730'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 bg-black/40 border border-kalian-gold/10 p-10 rounded-[3rem] flex flex-col justify-center">
            <h3 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest mb-8 italic">Filtros de Listado</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-[9px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] ml-4">Categoría</p>
                <div className="grid grid-cols-2 gap-2">
                  {['todas', 'Socio', 'Aportación Socio Local', 'Curso', 'Evento'].map(cat => (
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
              <div className="p-6 bg-kalian-gold/5 rounded-2xl border border-kalian-gold/10">
                <p className="text-[10px] font-bold text-kalian-gold/60 leading-relaxed italic">
                  "Usa estos filtros para refinar el listado inferior y la exportación a CSV."
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* TABLA DE MOVIMIENTOS */}
        <div className="bg-black/40 border border-kalian-gold/10 rounded-[3rem] overflow-hidden">
          <div className="p-8 border-b border-kalian-gold/10 flex justify-between items-center">
            <h3 className="text-xl kalian-poster-text text-kalian-gold/40 uppercase tracking-widest italic">Últimos Movimientos</h3>
            <span className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-widest">{transaccionesFiltradas.length} Transacciones</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-black text-kalian-gold/40 uppercase tracking-widest border-b border-kalian-gold/10">
                  <th className="p-6">Fecha</th>
                  <th className="p-6">Concepto</th>
                  <th className="p-6">Categoría</th>
                  <th className="p-6">Método</th>
                  <th className="p-6">Socio ID</th>
                  <th className="p-6 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {transaccionesFiltradas.map((t) => (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                    <td className="p-6 text-[10px] font-mono text-kalian-cream/40">{t.fecha.toDate().toLocaleString()}</td>
                    <td className="p-6">
                      <p className="text-sm font-bold text-kalian-cream group-hover:text-kalian-gold transition-colors">{t.concepto}</p>
                    </td>
                    <td className="p-6">
                      <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full border ${
                        t.categoria === 'Socio' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                        t.categoria === 'Aportación Socio Local' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                        t.categoria === 'Curso' ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' :
                        'bg-rose-500/10 text-rose-500 border-rose-500/20'
                      }`}>
                        {t.categoria === 'Aportación Socio Local' ? 'Local' : t.categoria}
                      </span>
                    </td>
                    <td className="p-6 text-[10px] font-black text-kalian-cream/60 uppercase tracking-widest">{t.metodo}</td>
                    <td className="p-6 text-[10px] font-mono text-kalian-gold/40">{t.socio_id}</td>
                    <td className="p-6 text-right">
                      <span className={`text-lg kalian-poster-text ${t.monto >= 0 ? 'text-kalian-gold' : 'text-rose-500'}`}>
                        {t.monto >= 0 ? '+' : ''}{t.monto.toFixed(2)}€
                      </span>
                    </td>
                  </tr>
                ))}
                {transaccionesFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-20 text-center">
                      <p className="text-kalian-gold/20 kalian-poster-text text-3xl uppercase">No hay movimientos registrados</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

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

                <div className="pt-6 border-t border-kalian-gold/10">
                  <p className="text-[8px] font-black text-kalian-gold/40 uppercase tracking-[0.3em] mb-4">Herramientas de Datos</p>
                  <button 
                    onClick={handleSyncHistory}
                    disabled={syncing}
                    className="w-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 p-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                  >
                    {syncing ? 'SINCRONIZANDO...' : '🔄 SINCRONIZAR APORTACIONES 0€'}
                  </button>
                  {syncMsg && (
                    <p className="mt-4 text-center text-[10px] font-black uppercase text-kalian-gold animate-pulse">
                      {syncMsg}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminContabilidad;
