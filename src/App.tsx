import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { MASTER_EMAIL } from './lib/constants';

// Componentes Públicos
const LandingPage = lazy(() => import('./pages/LandingPage'));
const NewsletterPage = lazy(() => import('./pages/NewsletterPage'));
const HomeSocio = lazy(() => import('./components/socio/HomeSocio'));
import Navbar from './components/public/Navbar';
const LoginSocio = lazy(() => import('./components/auth/LoginSocio'));
const PerfilSocio = lazy(() => import('./components/socio/PerfilSocio'));

// Componentes Admin
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const AdminEventos = lazy(() => import('./components/admin/AdminEventos'));
const AdminCursos = lazy(() => import('./components/admin/AdminCursos'));
const AdminSocios = lazy(() => import('./components/admin/AdminSocios'));
const AdminLocales = lazy(() => import('./components/admin/AdminLocales'));
const AdminProfesores = lazy(() => import('./components/admin/AdminProfesores'));
const AdminAcademias = lazy(() => import('./components/admin/AdminAcademias'));
const AdminStaff = lazy(() => import('./components/admin/AdminStaff'));
const AdminNewsletter = lazy(() => import('./components/admin/AdminNewsletter'));
const AdminContabilidad = lazy(() => import('./components/admin/AdminContabilidad'));
const AdminReservas = lazy(() => import('./components/admin/AdminReservas'));
const AdminExposiciones = lazy(() => import('./components/admin/AdminExposiciones'));
const AdminConfig = lazy(() => import('./components/admin/AdminConfig'));
const AdminTraducirEU = lazy(() => import('./components/admin/AdminTraducirEU'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));

// Componentes Teacher
const TeacherDashboard = lazy(() => import('./components/teacher/TeacherDashboard'));
const TeacherLogin = lazy(() => import('./pages/TeacherLogin'));

const ProgramacionPublica = lazy(() => import('./pages/ProgramacionPublica'));
const EventPage = lazy(() => import('./pages/EventPage'));
const GaleriaPublica = lazy(() => import('./pages/GaleriaPublica'));
const DonacionesPage = lazy(() => import('./pages/DonacionesPage'));
const AdminSolicitudes = lazy(() => import('./components/admin/AdminSolicitudes'));
const ControlAcceso = lazy(() => import('./components/admin/ControlAcceso'));
const PuertaAccess = lazy(() => import('./components/admin/PuertaAccess'));

// Loading component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-black">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold"></div>
  </div>
);

import { ErrorBoundary } from 'react-error-boundary';

const ErrorFallback = ({ error, resetErrorBoundary }: any) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-10 text-center">
    <div className="text-6xl mb-8">😱</div>
    <h1 className="text-4xl kalian-poster-text text-kalian-gold mb-4 uppercase italic">Vaya, algo se ha roto</h1>
    <p className="text-kalian-cream/60 max-w-md mb-8 italic text-sm">
      Ha ocurrido un error inesperado. Este tipo de fallos suelen ocurrir al intentar acceder a datos sin permisos suficientes o por una inestabilidad temporal.
    </p>
    <div className="bg-black/40 p-6 rounded-2xl border border-red-500/20 text-left mb-8 w-full max-w-xl overflow-auto max-h-40">
      <code className="text-red-400 text-[10px] font-mono break-all">{error.message}</code>
    </div>
    <div className="flex gap-4">
      <button 
        onClick={() => window.location.href = '/'}
        className="bg-kalian-gold text-black px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-kalian-gold/10 transition-all hover:scale-105"
      >
        Ir al Inicio
      </button>
      <button 
        onClick={resetErrorBoundary}
        className="bg-kalian-cream text-black px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all hover:scale-105"
      >
        Reintentar
      </button>
    </div>
  </div>
);

function AppContent() {
  const { user, role, socioData } = useAuth();
  const location = useLocation();
  const isMaster = user?.email?.toLowerCase() === MASTER_EMAIL;
  const hasAdminAccess = role === 'admin' || isMaster;
  
  const isLanding = location.pathname === '/';
  const isPuerta = location.pathname === '/puerta';
  const isLogin = ['/login', '/profesor/login', '/staff/login'].includes(location.pathname);

  // Bloqueo de Panel para socios inactivos (solo aplica a usuarios con rol socio o invitado_registrado)
  const isSocioArea = ['/home', '/perfil'].includes(location.pathname);
  const needsActiveCheck = (role === 'socio' || role === 'invitado_registrado') && !isMaster;
  
  if (user && needsActiveCheck && socioData?.estado === 'inactivo' && isSocioArea) {
    return <Navigate to="/" state={{ msg: "Tu suscripción de socio no está activa. Apúntate a un curso para recuperar el acceso a las ventajas de socio." }} replace />;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
      {!isLanding && !isLogin && !isPuerta && <Navbar />}

      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* LANDING PAGE */}
        <Route path="/" element={<LandingPage />} />
        
        {/* RUTAS PÚBLICAS */}
        <Route path="/login" element={<LoginSocio />} />
        <Route path="/programacion" element={<ProgramacionPublica />} />
        <Route path="/eventos/:id" element={<EventPage />} />
        <Route path="/galeria" element={<GaleriaPublica />} />
        <Route path="/donaciones" element={<DonacionesPage />} />
        <Route path="/newsletter-kalian-privado" element={<NewsletterPage />} />

        {/* RUTAS STAFF (ADMIN) */}
        <Route path="/staff/login" element={
          (hasAdminAccess || role === 'portero') ? (
            <Navigate to={hasAdminAccess ? "/staff" : "/control-acceso"} />
          ) : (
            <AdminLogin />
          )
        } />
        <Route path="/admin" element={<Navigate to="/staff" />} />
        <Route path="/login-admin" element={<Navigate to="/staff/login" />} />
        
        <Route path="/staff" element={
          hasAdminAccess ? (
            <AdminDashboard />
          ) : (
            <Navigate to="/staff/login" />
          )
        } />

        <Route path="/staff/eventos" element={hasAdminAccess ? <AdminEventos /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/cursos" element={hasAdminAccess ? <AdminCursos /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/socios" element={hasAdminAccess ? <AdminSocios /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/profesores" element={hasAdminAccess ? <AdminProfesores /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/locales" element={hasAdminAccess ? <AdminLocales /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/academias" element={hasAdminAccess ? <AdminAcademias /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/staff" element={hasAdminAccess ? <AdminStaff /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/newsletter" element={hasAdminAccess ? <AdminNewsletter /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/solicitudes" element={hasAdminAccess ? <AdminSolicitudes /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/contabilidad" element={hasAdminAccess ? <AdminContabilidad /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/reservas" element={hasAdminAccess ? <AdminReservas /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/galeria" element={hasAdminAccess ? <AdminExposiciones /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/config" element={hasAdminAccess ? <AdminConfig /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/identidad" element={hasAdminAccess ? <AdminConfig /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/traducir-eu" element={hasAdminAccess ? <AdminTraducirEU /> : <Navigate to="/staff/login" />} />

        {/* RUTA CONTROL ACCESO (PORTERO) */}
        <Route path="/control-acceso" element={
          (hasAdminAccess || role === 'portero') ? (
            <ControlAcceso />
          ) : (
            <Navigate to="/staff/login" />
          )
        } />

        <Route path="/puerta" element={<PuertaAccess />} />

        {/* RUTAS PROFESORES (TEACHER) */}
        <Route path="/profesor/login" element={role !== 'teacher' ? <TeacherLogin /> : <Navigate to="/profesor" />} />
        <Route path="/login-teacher" element={<Navigate to="/profesor/login" />} />
        <Route path="/teacher" element={<Navigate to="/profesor" />} />
        <Route path="/staff/profesor" element={<Navigate to="/profesor" />} />
        
        <Route path="/profesor" element={role === 'teacher' ? <TeacherDashboard /> : <Navigate to="/profesor/login" />} />

        {/* RUTAS PRIVADAS SOCIO */}
        <Route path="/home" element={user ? <HomeSocio /> : <Navigate to="/" />} />
        <Route path="/perfil" element={user ? <PerfilSocio /> : <Navigate to="/" />} />

        {/* REDIRECCIÓN POR DEFECTO */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AuthProvider>
        <LanguageProvider>
          <Router>
            <AppContent />
          </Router>
        </LanguageProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
