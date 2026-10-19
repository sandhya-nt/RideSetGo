import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { Home, History, User, Compass } from "lucide-react";
import { NavLink as RouterLink } from "react-router-dom";

export function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <img
              src="/assets/logo.svg"
              alt="RideSetGo"
              className="h-8 w-8"
            />
            <span className="font-bold text-rsgo-700 text-xl tracking-tight">
              RideSetGo
            </span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <NavLink
              to="/"
              label="Home"
              icon={<Home className="w-5 h-5" />}
            />
            <NavLink
              to="/history"
              label="Trip History"
              icon={<History className="w-5 h-5" />}
            />
            <NavLink
              to="/profile"
              label="Profile"
              icon={<User className="w-5 h-5" />}
            />
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden sm:block text-sm text-gray-600">
                  {user.full_name}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <a
                  href="/login"
                  className="text-sm text-rsgo-600 hover:text-rsgo-700 font-medium"
                >
                  Login
                </a>
                <a
                  href="/signup"
                  className="btn-primary text-sm px-4 py-2"
                >
                  Sign up
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <RouterLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 text-gray-400 transition-colors ${isActive ? "text-rsgo-600" : "hover:text-rsgo-600"}`
      }
    >
      {icon}
      <span className="text-xs">{label}</span>
    </RouterLink>
  );
}

// Bottom navigation for mobile
export function BottomNav() {
  const navItems = [
    { to: "/", label: "Home", icon: <Home className="w-5 h-5" /> },
    { to: "/explore", label: "Explore", icon: <Compass className="w-5 h-5" /> },
    { to: "/history", label: "History", icon: <History className="w-5 h-5" /> },
    { to: "/profile", label: "Profile", icon: <User className="w-5 h-5" /> },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200"
    >
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => (
          <RouterLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors ${isActive ? "text-rsgo-600" : "text-gray-400 hover:text-rsgo-600"}`
            }
          >
            {item.icon}
            <span className="text-[10px] font-medium">
              {item.label}
            </span>
          </RouterLink>
        ))}
      </div>
    </nav>
  );
}
