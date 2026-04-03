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
import AdminCheckIn from './components/admin/AdminCheckIn';
import AdminLocales from './components/admin/AdminLocales';
import AdminLogin from './pages/AdminLogin';

// Componentes Teacher
import TeacherDashboard from './components/teacher/TeacherDashboard';
import TeacherLogin from './pages/TeacherLogin';

function AppContent() {
  const { user, role, logoutAdmin } = useAuth();
  const location = useLocation();
  const isLanding = location.pathname === '/';

  return (
    <>
      {!isLanding && <Navbar />}

      <Routes>
        {/* LANDING PAGE */}
        <Route path="/" element={<LandingPage />} />
        
        {/* RUTAS PÚBLICAS */}
        <Route path="/login" element={<LoginSocio />} />
        <Route path="/newsletter-kalian-privado" element={<NewsletterPage />} />

        {/* RUTA DE LOGIN DE ADMIN */}
        <Route path="/login-admin" element={role !== 'admin' ? <AdminLogin /> : <Navigate to="/admin" />} />

        {/* RUTA DE LOGIN DE PROFESORES */}
        <Route path="/login-teacher" element={role !== 'teacher' ? <TeacherLogin /> : <Navigate to="/teacher" />} />

        {/* RUTAS PRIVADAS SOCIO */}
        <Route path="/home" element={user ? <HomeSocio /> : <Navigate to="/" />} />
        <Route path="/perfil" element={user ? <PerfilSocio /> : <Navigate to="/" />} />

        {/* RUTAS ADMIN */}
        <Route path="/admin" element={
          role === 'admin' ? (
            <AdminDashboard logout={logoutAdmin} />
          ) : (
            <Navigate to="/login-admin" />
          )
        } />

        <Route path="/admin/checkin" element={role === 'admin' ? <AdminCheckIn /> : <Navigate to="/login-admin" />} />
        <Route path="/admin/eventos" element={role === 'admin' ? <AdminEventos /> : <Navigate to="/login-admin" />} />
        <Route path="/admin/cursos" element={role === 'admin' ? <AdminCursos /> : <Navigate to="/login-admin" />} />
        <Route path="/admin/socios" element={role === 'admin' ? <AdminSocios /> : <Navigate to="/login-admin" />} />
        <Route path="/admin/locales" element={role === 'admin' ? <AdminLocales /> : <Navigate to="/login-admin" />} />

        {/* RUTAS TEACHER */}
        <Route path="/teacher" element={role === 'teacher' ? <TeacherDashboard /> : <Navigate to="/login-teacher" />} />

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
