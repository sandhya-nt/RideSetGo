import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { ErrorAlert, LoadingSpinner } from "@/components/common";
import { User, ShieldCheck, Mail, Phone, LogOut } from "lucide-react";
import { authService } from "@/services/api";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await authService.me();
      setProfile(res.data);
    } catch (err: any) {
      setError("Profile load nahi ho paaya. Kripaya baad mein koshish karein.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rsgo-50">
        <LoadingSpinner />
      </div>
    );
  }

  const displayUser = profile || user;

  return (
    <div className="flex min-h-screen flex-col bg-rsgo-50">
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto">
        {error && <ErrorAlert message={error} />}

        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
              <p className="text-gray-500">Manage your account details</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-rsgo-100 flex items-center justify-center flex-shrink-0">
              <User className="w-10 h-10 text-rsgo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {displayUser?.full_name || "RideSetGo User"}
              </h2>
              <p className="text-sm text-gray-500">
                {displayUser?.role?.toUpperCase() || "CUSTOMER"} • RideSetGo
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <Mail className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Email</p>
                <p className="text-sm text-gray-500">
                  {displayUser?.email || "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <Phone className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Phone</p>
                <p className="text-sm text-gray-500">
                  {displayUser?.phone || "Not provided"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium text-gray-700">Account secure</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

