import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { Header, Footer } from "@/components";
import { BottomNav } from "@/components/Navbar";
import { LoadingSpinner } from "@/components/common";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const SplashPage = lazy(() => import("@/pages/SplashPage").then((m) => ({ default: m.SplashPage })));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import("@/pages/SignupPage").then((m) => ({ default: m.SignupPage })));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const HomePage = lazy(() => import("@/pages/HomePage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const RideOptionsPage = lazy(() => import("@/pages/RideOptionsPage"));
const TripDetailsPage = lazy(() => import("@/pages/TripDetailsPage"));
const LiveTripTrackingPage = lazy(() => import("@/pages/LiveTripTrackingPage"));
const ReceiptPage = lazy(() => import("@/pages/ReceiptPage"));
const SafetyPage = lazy(() => import("@/pages/SafetyPage"));
const HelpPage = lazy(() => import("@/pages/HelpPage"));
const DriverPartnerPage = lazy(() => import("@/pages/DriverPartnerPage"));
const AdminDashboardPage = lazy(() => import("@/pages/AdminDashboardPage"));

function AuthLayout() {
  return (
    <div className="min-h-screen bg-rsgo-50 flex flex-col">
      <Header />
      <main className="flex-1">
        {/* A crash in one page must not take down the whole app: the
            navigation stays usable and the user can retry the page. */}
        <ErrorBoundary label="page">
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}

function SessionGate() {
  const { initializing, isAuthenticated, initializeAuth } = useAuthStore();
  const location = useLocation();
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);
  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rsgo-50">
        <LoadingSpinner />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <AuthLayout />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary label="navigation">
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-rsgo-50"><LoadingSpinner /></div>}>
          <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/splash" element={<SplashPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/driver-partners" element={<div className="p-8 text-center">Driver partners page</div>} />
          <Route element={<SessionGate />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/ride-options" element={<RideOptionsPage />} />
            <Route path="/trips/:id" element={<TripDetailsPage />} />
            <Route path="/trips/:id/track" element={<LiveTripTrackingPage />} />
            <Route path="/trips/:id/receipt" element={<ReceiptPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/driver" element={<DriverPartnerPage />} />
            <Route path="/safety" element={<SafetyPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/driver" element={<DriverPartnerPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}