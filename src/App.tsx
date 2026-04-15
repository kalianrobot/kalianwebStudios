import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';

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
const AdminContabilidad = lazy(() => import('./components/admin/AdminContabilidad'));
const AdminExposiciones = lazy(() => import('./components/admin/AdminExposiciones'));
const AdminConfig = lazy(() => import('./components/admin/AdminConfig'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));

// Componentes Teacher
const TeacherDashboard = lazy(() => import('./components/teacher/TeacherDashboard'));
const TeacherLogin = lazy(() => import('./pages/TeacherLogin'));

const ProgramacionPublica = lazy(() => import('./pages/ProgramacionPublica'));
const GaleriaPublica = lazy(() => import('./pages/GaleriaPublica'));
const AdminSolicitudes = lazy(() => import('./components/admin/AdminSolicitudes'));
const ControlAcceso = lazy(() => import('./components/admin/ControlAcceso'));
const PuertaAccess = lazy(() => import('./components/admin/PuertaAccess'));

// Loading component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-black">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold"></div>
  </div>
);

function AppContent() {
  const { user, role, socioData } = useAuth();
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const isPuerta = location.pathname === '/puerta';
  const isLogin = ['/login', '/profesor/login', '/staff/login'].includes(location.pathname);

  // Bloqueo de Panel para socios inactivos
  const isSocioArea = ['/home', '/perfil'].includes(location.pathname);
  if (user && socioData?.estado === 'inactivo' && isSocioArea) {
    return <Navigate to="/" state={{ msg: "Tu suscripción de socio no está activa. Apúntate a un curso para recuperar el acceso a las ventajas de socio." }} replace />;
  }

  return (
    <>
      {!isLanding && !isLogin && !isPuerta && <Navbar />}

      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* LANDING PAGE */}
        <Route path="/" element={<LandingPage />} />
        
        {/* RUTAS PÚBLICAS */}
        <Route path="/login" element={<LoginSocio />} />
        <Route path="/programacion" element={<ProgramacionPublica />} />
        <Route path="/galeria" element={<GaleriaPublica />} />
        <Route path="/newsletter-kalian-privado" element={<NewsletterPage />} />

        {/* RUTAS STAFF (ADMIN) */}
        <Route path="/staff/login" element={
          (role === 'admin' || role === 'portero') ? (
            <Navigate to={role === 'admin' ? "/staff" : "/control-acceso"} />
          ) : (
            <AdminLogin />
          )
        } />
        <Route path="/admin" element={<Navigate to="/staff" />} />
        <Route path="/login-admin" element={<Navigate to="/staff/login" />} />
        
        <Route path="/staff" element={
          role === 'admin' ? (
            <AdminDashboard />
          ) : (
            <Navigate to="/staff/login" />
          )
        } />

        <Route path="/staff/eventos" element={role === 'admin' ? <AdminEventos /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/cursos" element={role === 'admin' ? <AdminCursos /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/socios" element={role === 'admin' ? <AdminSocios /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/profesores" element={role === 'admin' ? <AdminProfesores /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/locales" element={role === 'admin' ? <AdminLocales /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/academias" element={role === 'admin' ? <AdminAcademias /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/staff" element={role === 'admin' ? <AdminStaff /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/solicitudes" element={role === 'admin' ? <AdminSolicitudes /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/contabilidad" element={role === 'admin' ? <AdminContabilidad /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/galeria" element={role === 'admin' ? <AdminExposiciones /> : <Navigate to="/staff/login" />} />
        <Route path="/staff/config" element={role === 'admin' ? <AdminConfig /> : <Navigate to="/staff/login" />} />

        {/* RUTA CONTROL ACCESO (PORTERO) */}
        <Route path="/control-acceso" element={
          (role === 'admin' || role === 'portero') ? (
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
  </>
);
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Router>
          <AppContent />
        </Router>
      </LanguageProvider>
    </AuthProvider>
  );
}
