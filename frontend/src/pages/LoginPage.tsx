import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { authService, getApiError } from "@/services/api";
import { ErrorAlert, LoadingSpinner } from "@/components/common";
import { Logo } from "@/components/Logo";
import { Link } from "react-router-dom";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, setUser } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // never send a second login while one is running
    setError("");
    setLoading(true);
    try {
      const res = await authService.login({ email, password });
      // Store the token; fetch the real user profile from /auth/me
      login(res.data.access_token, {
        id: 0,
        email,
        full_name: "",
        role: "customer",
        is_active: true,
      } as any);

      try {
        const meRes = await authService.me();
        setUser(meRes.data);
      } catch {
        // If /auth/me fails, we still have the token from login
      }

      navigate("/home");
    } catch (err: unknown) {
      // A failed login must not clear what the user typed, so the email and
      // password fields are left untouched and the form can be resubmitted.
      const normalized = getApiError(err);
      setError(
        normalized.kind === "unauthorized"
          ? "Invalid email or password."
          : normalized.message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-rsgo-50">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <Logo size={48} />
          <h2 className="mt-6 text-2xl font-bold text-gray-800">Welcome back</h2>
          <p className="mt-2 text-gray-500">Sign in to your RideSetGo account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              required
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              required
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <ErrorAlert message={error} />}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? <LoadingSpinner className="w-4 h-4 mr-2" /> : "Sign in"}
          </button>
          <p className="text-center text-sm text-gray-500">
            Don&rsquo;t have an account?{" "}
            <Link
              to="/signup"
              className="text-rsgo-600 hover:text-rsgo-700 font-medium"
            >
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
