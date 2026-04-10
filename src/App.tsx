import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Componentes Públicos
import LandingPage from './pages/LandingPage';
import NewsletterPage from './pages/NewsletterPage';
import HomeSocio from './components/socio/HomeSocio';
import Navbar from './components/public/Navbar';
import LoginSocio from './components/auth/LoginSocio';
import PerfilSocio from './components/socio/PerfilSocio';

// Componentes Admin
import AdminDashboard from './components/admin/AdminDashboard';
import AdminEventos from './components/admin/AdminEventos';
import AdminCursos from './components/admin/AdminCursos';
import AdminSocios from './components/admin/AdminSocios';
import AdminLocales from './components/admin/AdminLocales';
import AdminProfesores from './components/admin/AdminProfesores';
import AdminAcademias from './components/admin/AdminAcademias';
import AdminStaff from './components/admin/AdminStaff';
import AdminLogin from './pages/AdminLogin';

// Componentes Teacher
import TeacherDashboard from './components/teacher/TeacherDashboard';
import TeacherLogin from './pages/TeacherLogin';

import ProgramacionPublica from './pages/ProgramacionPublica';
import AdminSolicitudes from './components/admin/AdminSolicitudes';
import ControlAcceso from './components/admin/ControlAcceso';
import PuertaAccess from './components/admin/PuertaAccess';

function AppContent() {
  const { user, role, logoutAdmin } = useAuth();
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const isPuerta = location.pathname === '/puerta';
  const isLogin = ['/login', '/profesor/login', '/staff/login'].includes(location.pathname);

  return (
    <>
      {!isLanding && !isLogin && !isPuerta && <Navbar />}

      <Routes>
        {/* LANDING PAGE */}
        <Route path="/" element={<LandingPage />} />
        
        {/* RUTAS PÚBLICAS */}
        <Route path="/login" element={<LoginSocio />} />
        <Route path="/programacion" element={<ProgramacionPublica />} />
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
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}
