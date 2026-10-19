import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { authService } from "@/services/api";
import { ErrorAlert, LoadingSpinner } from "@/components/common";
import { Logo } from "@/components/Logo";
import { Mail, Phone, Lock, Eye, EyeOff, User, ArrowLeft } from "lucide-react";

export function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, setUser } = useAuthStore();

  const [validationErrors, setValidationErrors] = useState<{
    fullName?: string;
    email?: string;
    phone?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!fullName.trim()) {
      errors.fullName = "Full name is required";
    } else if (fullName.trim().length < 2) {
      errors.fullName = "Full name must be at least 2 characters";
    }

    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email address";
    }

    if (phone && !/^[\d\s\-\+\(\)]{10,}$/.test(phone)) {
      errors.phone = "Please enter a valid phone number";
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords do not match";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const clearFieldError = (field: string) => {
    setValidationErrors((prev) => {
      if (!prev[field as keyof typeof prev]) return prev;
      const next = { ...prev };
      delete next[field as keyof typeof next];
      return next;
    });
  };

  const extractErrorMessage = (err: any): string => {
    const detail = err?.response?.data?.detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((d: any) => d?.msg || d?.message || String(d))
        .filter(Boolean);
      if (messages.length) return messages.join(" ");
    }
    if (typeof detail === "string" && detail.trim()) return detail;
    if (err?.response?.status === 400) return "This request could not be completed. Please check your details.";
    if (err?.response?.status === 409) return "This account already exists. Please sign in instead.";
    if (err?.response?.status === 422) return "Please check your details and try again.";
    if (!err?.response) return "Network error. Please check your connection and try again.";
    if (err?.response?.status >= 500) return "Server error. Please try again in a moment.";
    return "Signup failed. Please try again.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const res = await authService.signup({
        email: email.trim(),
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        password,
      });

      const accessToken = res?.data?.access_token;
      if (!accessToken) {
        throw new Error("No access token returned");
      }

      // Update auth state with the real token. Use a safe placeholder user
      // until /auth/me returns the authoritative profile.
      login(accessToken, {
        id: 0,
        email: email.trim(),
        full_name: fullName.trim(),
        role: "customer",
        is_active: true,
      });

      // Fetch the real profile. If this fails, the account was still created
      // successfully and the token is stored — do not report a generic signup
      // failure in that case.
      try {
        const meRes = await authService.me();
        setUser(meRes.data);
      } catch {
        // Non-fatal: keep the stored token and proceed.
      }

      setSuccess("Account created successfully. Redirecting...");
      // Clear sensitive fields from memory.
      setPassword("");
      setConfirmPassword("");
      navigate("/home");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      // Signup itself failed (no account created). Provide clear messages.
      if (err?.response?.status === 400 && detail === "Email already registered") {
        setError("This email is already registered. Please sign in instead.");
      } else if (err?.response?.status === 400 && typeof detail === "string" && detail.toLowerCase().includes("phone")) {
        setError("This phone number is already in use. Please use a different number.");
      } else if (err?.response?.status === 422) {
        setError("Please check your details and try again.");
      } else if (!err?.response) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(extractErrorMessage(err));
      }
      // Never repopulate passwords after a failed request.
      setPassword("");
      setConfirmPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-rsgo-50">
      {/* Left branding panel (desktop) */}
      <aside className="hidden lg:flex lg:w-1/2 xl:w-5/12 flex-col justify-between bg-rsgo-900 text-white p-10 xl:p-14 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden="true">
          <svg viewBox="0 0 400 400" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
            <circle cx="320" cy="80" r="120" fill="#ea580c" />
            <circle cx="60" cy="340" r="90" fill="#f97316" />
          </svg>
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <Logo size={44} />
          <span className="font-bold text-2xl tracking-tight">RideSetGo</span>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-4">
            Create your RideSetGo account
          </h1>
          <p className="text-lg text-slate-200 leading-relaxed">
            Join RideSetGo to manage your rides around Amritsar.
          </p>
          <p className="mt-6 text-sm text-slate-300">
            Book bikes, autos, and cars across the city with transparent
            fare estimates and real-time ride tracking.
          </p>
        </div>
        <div className="relative z-10 text-xs text-slate-400">
          © 2026 RideSetGo. Amritsar, India.
        </div>
      </aside>

      {/* Right form panel */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
        <div className="w-full max-w-md">
          {/* Compact branding (mobile/tablet) */}
          <div className="lg:hidden text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Logo size={36} />
              <span className="font-bold text-rsgo-900 text-xl tracking-tight">
                RideSetGo
              </span>
            </div>
            <p className="text-sm text-gray-500">Book your ride in Amritsar</p>
          </div>

          <div className="bg-white rounded-3xl shadow-rsgo-xl border border-gray-100 p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1 text-center lg:text-left">
              Create account
            </h2>
            <p className="text-gray-500 text-sm mb-6 text-center lg:text-left">
              Join RideSetGo today
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Full Name */}
              <div>
                <label htmlFor="signup-fullname" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="signup-fullname"
                    type="text"
                    autoComplete="name"
                    className={`input-field pl-10 ${validationErrors.fullName ? "border-red-300 focus:ring-red-500 focus:border-red-500" : ""}`}
                    placeholder="Aman Singh"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); clearFieldError("fullName"); }}
                    disabled={loading}
                  />
                </div>
                {validationErrors.fullName && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{validationErrors.fullName}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    className={`input-field pl-10 ${validationErrors.email ? "border-red-300 focus:ring-red-500 focus:border-red-500" : ""}`}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                    disabled={loading}
                  />
                </div>
                {validationErrors.email && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{validationErrors.email}</p>
                )}
              </div>

              {/* Phone (optional) */}
              <div>
                <label htmlFor="signup-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone Number <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="signup-phone"
                    type="tel"
                    autoComplete="tel"
                    className={`input-field pl-10 ${validationErrors.phone ? "border-red-300 focus:ring-red-500 focus:border-red-500" : ""}`}
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); clearFieldError("phone"); }}
                    disabled={loading}
                  />
                </div>
                {validationErrors.phone && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{validationErrors.phone}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  We&rsquo;ll use this for ride updates only.
                </p>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className={`input-field pl-10 pr-10 ${validationErrors.password ? "border-red-300 focus:ring-red-500 focus:border-red-500" : ""}`}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-rsgo-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {validationErrors.password && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{validationErrors.password}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">At least 6 characters</p>
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="signup-confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                  <input
                    id="signup-confirm"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    className={`input-field pl-10 pr-10 ${validationErrors.confirmPassword ? "border-red-300 focus:ring-red-500 focus:border-red-500" : ""}`}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError("confirmPassword"); }}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-rsgo-600"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    disabled={loading}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {validationErrors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{validationErrors.confirmPassword}</p>
                )}
              </div>

              {error && <ErrorAlert message={error} />}
              {success && (
                <div className="rounded-lg bg-green-50 border border-green-100 p-4">
                  <div className="text-sm text-green-700">{success}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 mt-2"
              >
                {loading ? (
                  <span className="inline-flex items-center justify-center">
                    <LoadingSpinner className="w-4 h-4 mr-2" />
                    Creating account...
                  </span>
                ) : (
                  "Create Account"
                )}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs text-gray-400">Or</span>
              </div>
            </div>

            <p className="text-center text-sm text-gray-600">
              Already have an account?{" "}
              <Link to="/login" className="text-orange-600 hover:text-orange-700 font-medium">
                Sign in
              </Link>
            </p>

            <div className="mt-4 text-center">
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-rsgo-700"
              >
                <ArrowLeft className="w-3 h-3" aria-hidden="true" />
                Back to Home
              </Link>
            </div>
          </div>

          <p className="text-center text-xs text-gray-500 mt-6">
            © 2026 RideSetGo. Amritsar, India.
          </p>
        </div>
      </main>
    </div>
  );
}
