import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types/database";

// Auth
const LoginPage = lazy(() => import("./LoginPage"));

// Owner
const OwnerDashboard   = lazy(() => import("@/components/owner/OwnerDashboard"));
const ReportDetail     = lazy(() => import("@/components/owner/ReportDetail"));
const ReportsPage      = lazy(() => import("./owner/ReportsPage"));
const AssetsPage       = lazy(() => import("./owner/AssetsPage"));
const TechniciansPage  = lazy(() => import("./owner/TechniciansPage"));
const AnalyticsPage    = lazy(() => import("./owner/AnalyticsPage"));
const SettingsPage     = lazy(() => import("./owner/SettingsPage"));

// Technician
const TechnicianReports = lazy(() => import("@/components/technician/TechnicianReports"));
const CreateReport      = lazy(() => import("@/components/technician/CreateReport"));

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f172a" }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Cargando...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}) {
  const { user, loading } = useAuthStore();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.profile.role))
    return <Navigate to={user.profile.role === "technician" ? "/technician" : "/owner"} replace />;
  return <>{children}</>;
}

function RoleRedirect() {
  const { user, loading } = useAuthStore();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.profile.role === "technician" ? "/technician" : "/owner"} replace />;
}

export default function App() {
  const { initialize } = useAuthStore();
  useEffect(() => { initialize(); }, [initialize]);

  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
        <Routes>
          {/* Público */}
          <Route path="/login" element={<LoginPage />} />

          {/* ── Owner / Admin ─────────────────────────── */}
          <Route path="/owner" element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <OwnerDashboard />
            </ProtectedRoute>
          } />
          <Route path="/owner/reports" element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <ReportsPage />
            </ProtectedRoute>
          } />
          <Route path="/owner/reports/:id" element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <ReportDetail />
            </ProtectedRoute>
          } />
          <Route path="/owner/assets" element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <AssetsPage />
            </ProtectedRoute>
          } />
          <Route path="/owner/technicians" element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <TechniciansPage />
            </ProtectedRoute>
          } />
          <Route path="/owner/analytics" element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <AnalyticsPage />
            </ProtectedRoute>
          } />
          <Route path="/owner/settings" element={
            <ProtectedRoute allowedRoles={["owner", "admin"]}>
              <SettingsPage />
            </ProtectedRoute>
          } />

          {/* ── Técnico ───────────────────────────────── */}
          <Route path="/technician" element={
            <ProtectedRoute allowedRoles={["technician", "admin", "owner"]}>
              <TechnicianReports />
            </ProtectedRoute>
          } />
          <Route path="/technician/reports/new" element={
            <ProtectedRoute allowedRoles={["technician", "admin", "owner"]}>
              <CreateReport />
            </ProtectedRoute>
          } />
          <Route path="/report/:qrCode" element={
            <ProtectedRoute>
              <CreateReport />
            </ProtectedRoute>
          } />

          {/* Redirect raíz */}
          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
