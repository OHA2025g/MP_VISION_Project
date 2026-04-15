import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import SectorDetail from "@/pages/SectorDetail";
import KPIExplorer from "@/pages/KPIExplorer";
import DistrictComparison from "@/pages/DistrictComparison";
import DistrictDetail from "@/pages/DistrictDetail";
import DistrictMap from "@/pages/DistrictMap";
import VisionTimeline from "@/pages/VisionTimeline";
import AdminPanel from "@/pages/AdminPanel";
import Layout from "@/components/custom/Layout";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-mp-cream">
      <div className="animate-pulse text-mp-navy font-heading text-xl">Loading...</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-mp-cream">
      <div className="animate-pulse text-mp-navy font-heading text-xl">Loading...</div>
    </div>
  );
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="sectors/:code" element={<SectorDetail />} />
        <Route path="kpi-explorer" element={<KPIExplorer />} />
        <Route path="districts" element={<DistrictComparison />} />
        <Route path="districts/:name" element={<DistrictDetail />} />
        <Route path="district-map" element={<DistrictMap />} />
        <Route path="timeline" element={<VisionTimeline />} />
        <Route path="admin" element={<AdminPanel />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <AppRoutes />
          <Toaster position="top-right" />
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
