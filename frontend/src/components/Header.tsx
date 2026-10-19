import { useState } from "react";
import { useNavigate, NavLink, Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import {
  Menu,
  X,
  User,
  LogOut,
  Home,
  MapPin,
  History,
  Shield,
  HelpCircle,
  Compass,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: <Home className="w-4 h-4" /> },
  { to: "/explore", label: "Explore", icon: <Compass className="w-4 h-4" /> },
  { to: "/login", label: "Book a Ride", icon: <MapPin className="w-4 h-4" /> },
  { to: "/history", label: "My Trips", icon: <History className="w-4 h-4" /> },
  { to: "/safety", label: "Safety", icon: <Shield className="w-4 h-4" /> },
  { to: "/help", label: "Help", icon: <HelpCircle className="w-4 h-4" /> },
];

export function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
    setMobileMenuOpen(false);
  };

  // "Home" opens the public landing page for everyone; signed-in users also
  // have their dashboard at /home, which "Book a Ride" opens.
  const homeTo = "/";
  const bookTo = user ? "/home" : "/login";

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-colors ${
      isActive
        ? "bg-orange-50 text-orange-700"
        : "text-rsgo-600 hover:text-orange-600 hover:bg-orange-50"
    }`;

  return (
    <>
      {/* Desktop header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer">
            <Logo size={32} />
            <span className="font-bold text-rsgo-900 text-xl tracking-tight">
              RideSetGo
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const to =
                item.label === "Home" ? homeTo : item.label === "Book a Ride" ? bookTo : item.to;
              // My Trips requires an account; hide it for signed-out visitors.
              if (item.label === "My Trips" && !user) return null;
              return (
                <NavLink
                  key={item.to}
                  to={to}
                  end
                  className={({ isActive }) => linkCls({ isActive })}
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex flex-col items-end">
                  <p className="text-sm font-medium text-rsgo-900">
                    {user.full_name}
                  </p>
                  <p className="text-xs text-rsgo-500 capitalize">
                    {user.role}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                  <User className="w-4 h-4 text-orange-700" />
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-red-100"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="text-sm font-medium text-rsgo-600 hover:text-orange-600 transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="btn-primary text-sm px-5 py-2.5"
                >
                  Create Account
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-gray-50 text-rsgo-700 hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      )}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-white w-full max-w-md shadow-rsgo-xl transform transition-transform duration-300 translate-x-full md:translate-x-0 flex flex-col">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo size={28} />
              <span className="font-bold text-rsgo-900 text-lg tracking-tight">
                RideSetGo
              </span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-xl bg-gray-50 text-rsgo-700 hover:bg-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-6 py-4 space-y-2">
            {NAV_ITEMS.map((item) => {
              if (item.label === "My Trips" && !user) return null;
              const to =
                item.label === "Home" ? homeTo : item.label === "Book a Ride" ? bookTo : item.to;
              return (
                <NavLink
                  key={item.to}
                  to={to}
                  end
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                      isActive
                        ? "bg-orange-50 text-orange-700"
                        : "text-rsgo-600 hover:text-orange-600 hover:bg-orange-50"
                    }`
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="p-6 border-t border-gray-100">
            {user ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                    <User className="w-5 h-5 text-orange-700" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-rsgo-900">
                      {user.full_name}
                    </p>
                    <p className="text-xs text-rsgo-500 capitalize">{user.role}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-red-100"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-rsgo-600 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-primary w-full text-center"
                >
                  Create Account
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
