import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Componentes Públicos
import HomePublica from './components/public/HomePublica';
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

function AppContent() {
  const { user, role, logoutAdmin } = useAuth();

  return (
    <Router>
      <Navbar />

      <Routes>
        {/* RUTAS PÚBLICAS */}
        <Route path="/" element={<HomePublica />} />
        <Route path="/login" element={<LoginSocio />} />

        {/* RUTA DE LOGIN DE ADMIN */}
        <Route path="/login-admin" element={role !== 'admin' ? <AdminLogin /> : <Navigate to="/admin" />} />

        {/* RUTA DE PERFIL DE SOCIO */}
        <Route path="/perfil" element={user ? <PerfilSocio /> : <Navigate to="/login" />} />

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

        {/* REDIRECCIÓN POR DEFECTO */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
