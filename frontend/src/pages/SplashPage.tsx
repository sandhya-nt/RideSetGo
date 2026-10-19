import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import SplashLogo from "@/assets/splash.svg";

export function SplashPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        navigate("/home");
      } else {
        navigate("/login");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate, isAuthenticated]);

  return (
    <div className="fixed inset-0 bg-rsgo-900 flex items-center justify-center text-white z-50">
      <div className="text-center">
        <img
          src={SplashLogo}
          alt="RideSetGo"
          className="w-24 h-24 mx-auto mb-6 drop-shadow-lg"
        />
        <h1 className="text-3xl font-bold tracking-tight">RideSetGo</h1>
        <p className="mt-2 text-rsgo-200 text-sm">
          Amritsar&rsquo;s ride-hailing app
        </p>
        <div className="mt-8 h-1 w-24 bg-rsgo-600 rounded-full animate-pulse" />
      </div>
    </div>
  );
}
