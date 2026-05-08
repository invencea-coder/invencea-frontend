import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ManagerDirectory from './pages/manager/ManagerDirectory.jsx';
import AuditLogs from './pages/manager/AuditLogs.jsx';
// Layout
import DashboardLayout from './components/layout/DashboardLayout.jsx';

// Auth pages
import LoginSelect from './pages/auth/LoginSelect.jsx';
import AdminLogin from './pages/auth/AdminLogin.jsx';
import FacultyLogin from './pages/auth/FacultyLogin.jsx';
import OTPVerification from './pages/auth/OTPVerification.jsx';
import StudentLogin from './pages/auth/StudentLogin.jsx';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import Inventory from './pages/admin/Inventory.jsx';
import Requests from './pages/admin/Requests.jsx';
import Reports from './pages/admin/Reports.jsx';
import RoomSettings from './pages/admin/RoomSettings.jsx';
import ReturnScanner from './pages/admin/ReturnScanner.jsx';

// Faculty pages
import FacultyDashboard from './pages/faculty/FacultyDashboard.jsx';
import FacultyMyRequest from './pages/faculty/MyRequest.jsx';

// Student pages
import StudentDashboard from './pages/student/StudentDashboard.jsx';
import StudentMyRequest from './pages/shared/MyRequest.jsx';

// Shared pages
import NewRequest from './pages/shared/NewRequest.jsx';

// Manager pages
import ManagerDashboard from './pages/manager/ManagerDashboard.jsx';

// Kiosk pages
import KioskStatus from './pages/kiosk/KioskStatus.jsx';

// ── ProtectedRoute ──────────────────────────────────────────────
const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();

  if (loading) return <SpinnerPage />;
  if (!user) return <Navigate to="/" replace />;

  if (role && user.role?.toLowerCase() !== role.toLowerCase()) {
    return <Navigate to={`/${user.role?.toLowerCase() || ''}`} replace />;
  }

  return children;
};

// ── Spinner ─────────────────────────────────────────────────────
const SpinnerPage = () => (
  <div className="flex items-center justify-center h-screen bg-surface">
    <div className="neu-spinner" />
  </div>
);

// ── AppContent ───────────────────────────────────────────────────
const AppContent = () => {
  const { user, loading } = useAuth();

  if (loading) return <SpinnerPage />;

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/"
        element={user?.role ? <Navigate to={`/${user.role.toLowerCase()}`} replace /> : <LoginSelect />}
      />
      <Route path="/login/admin"        element={<AdminLogin />} />
      <Route path="/login/faculty"      element={<FacultyLogin />} />
      <Route path="/login/faculty/otp"  element={<OTPVerification />} />
      <Route path="/login/student"      element={<StudentLogin />} />

      {/* Kiosk Status — public, no login required */}
      <Route path="/kiosk/status" element={<KioskStatus />} />

      {/* Manager routes */}
      <Route
        path="/manager/*"
        element={
          <ProtectedRoute role="manager">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ManagerDashboard />} />
        <Route path="directory" element={<ManagerDirectory />} /> {/* ADD THIS LINE */}
        <Route path="audits" element={<AuditLogs />} />
      </Route>
      {/* Dean routes (Reports Only) */}
      <Route
        path="/dean/*"
        element={
          <ProtectedRoute role="dean">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="reports" replace />} />
        <Route path="reports" element={<Reports />} />
      </Route>

      {/* Admin routes */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute role="admin">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="inventory"      element={<Inventory />} />
        <Route path="requests"       element={<Requests />} />
        <Route path="return-scanner" element={<ReturnScanner />} />
        <Route path="reports"        element={<Reports />} />
        <Route path="rooms"          element={<RoomSettings />} />
      </Route>

      {/* Faculty routes */}
      <Route
        path="/faculty/*"
        element={
          <ProtectedRoute role="faculty">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<FacultyDashboard />} />
        <Route path="new-request"  element={<NewRequest />} />
        <Route path="my-requests"  element={<FacultyMyRequest />} />
      </Route>

      {/* Student routes */}
      <Route
        path="/student/*"
        element={
          <ProtectedRoute role="student">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<StudentDashboard />} />
        <Route path="new-request"  element={<NewRequest />} />
        <Route path="my-requests"  element={<StudentMyRequest />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
        <Toaster 
          position="top-right" 
          containerStyle={{
            zIndex: 99999, // 🔥 Forces toasts above modals (z-[100])
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
