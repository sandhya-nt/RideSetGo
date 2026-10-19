import axios, { AxiosError } from "axios";
import type {
  Location,
  FareEstimate,
  Ride,
  RideCategory,
  User,
  Payment,
  Rating,
  TrustedContact,
  SafetyReport,
  RideTracking,
  CancelRideResult,
} from "@/types";

import { useAuthStore } from "@/store/authStore";
import { newRequestId } from "@/lib/observability";
import { normalizeApiError, type NormalizedApiError } from "@/lib/errors";
import type { SystemHealth } from "@/types";

// Production API base URL, injected at build time via VITE_API_BASE.

// Falls back to a relative /api path so the dev proxy (vite.config.ts) and
// same-origin deployments keep working without any env var.
const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** Header used to correlate a frontend request with a backend log line. */
export const REQUEST_ID_HEADER = "X-Request-ID";
/** Header used to make a non-idempotent request safe to retry. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach JWT token from localStorage to every request.
// Zustand persist stores state as { state: { ... }, version: 3 }, so the
// token lives at parsed.state.token, not parsed.token.
//
// Every request also gets a correlation id. The backend validates the value
// and returns it in the `X-Request-ID` response header, so a user-visible
// error can always be matched to a single backend log line.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("rsgo-auth");
  if (token) {
    try {
      const parsed = JSON.parse(token);
      const state = parsed?.state ?? parsed;
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    } catch {
      // ignore malformed storage
    }
  }
  if (!config.headers[REQUEST_ID_HEADER]) {
    config.headers[REQUEST_ID_HEADER] = newRequestId();
  }
  return config;
});

// Global response interceptor: on 401 (expired/invalid token) clear auth
// state and let the React router send the user to login. We deliberately
// avoid a hard `window.location.replace` here: a full reload re-runs
// `initializeAuth`, which can flash the login screen on every navigation
// when the token is still valid. A 403 means "forbidden" (e.g. accessing
// another user's ride) — that must NOT log the user out.
//
// The error is also normalised once, here, so every screen reports failures
// the same way instead of each one re-deriving the status code.
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) {
      const { logout } = useAuthStore.getState();
      logout();
    }
    const normalized: NormalizedApiError = normalizeApiError(error);
    (error as AxiosError & { normalized?: NormalizedApiError }).normalized =
      normalized;
    return Promise.reject(error);
  }
);

/**
 * Read the normalised error attached by the response interceptor.
 *
 * Falls back to normalising the value again, so it also works for errors
 * that were thrown outside of axios (for example a failed `fetch`).
 */
export function getApiError(error: unknown): NormalizedApiError {
  const maybe = error as { normalized?: NormalizedApiError } | null;
  if (maybe && maybe.normalized) return maybe.normalized;
  return normalizeApiError(error);
}

export const authService = {
  signup: (data: { email: string; full_name: string; phone?: string; password: string }) =>
    api.post<{ access_token: string; token_type: string }>("/auth/signup", data),
  login: (data: { email: string; password: string }) =>
    api.post<{ access_token: string; token_type: string }>("/auth/login", data),
  me: () => api.get<User>("/auth/me"),
  logout: () => api.post("/auth/logout"),
};

export const locationService = {
  list: () => api.get<Location[]>("/locations/"),
};

export const categoryService = {
  list: () => api.get<RideCategory[]>("/categories/"),
};

export const fareService = {
  estimate: (data: {
    pickup_location: string;
    dropoff_location: string;
    passenger_count: number;
    hour: number;
  }) => api.post<FareEstimate>("/fare/estimate", data),
};

export const rideService = {
  /**
   * Book a ride.
   *
   * `idempotencyKey` makes the request safe to retry: the backend returns
   * the original booking instead of creating a second ride and a second
   * payment when the same key is sent again. The caller must reuse the SAME
   * key for every retry of the same booking attempt and must generate a new
   * key for a genuinely new booking.
   */
  book: (
    data: {
      pickup_location: string;
      dropoff_location: string;
      pickup_lat: number;
      pickup_lng: number;
      dropoff_lat: number;
      dropoff_lng: number;
      distance_km: number;
      category: string;
      passenger_count: number;
      hour?: number;
    },
    idempotencyKey?: string,
  ) =>
    api.post<Ride>("/rides/book", data, {
      headers: idempotencyKey
        ? { [IDEMPOTENCY_HEADER]: idempotencyKey }
        : undefined,
    }),
  list: () => api.get<Ride[]>("/rides/"),
  get: (id: number) => api.get<Ride>(`/rides/${id}`),
  available: () => api.get<Ride[]>("/rides/available"),
  accept: (id: number) => api.post<Ride>(`/rides/${id}/accept`),
  updateStatus: (id: number, status: string) =>
    api.patch<Ride>(`/rides/${id}/status`, { status }),
  cancel: (id: number) => api.delete(`/rides/${id}`),
  // Cancel with an optional reason. The backend applies the eligibility rules
  // (only 'requested' or 'accepted' rides can be cancelled).
  cancelWithReason: (id: number, reason?: string) =>
    api.post<CancelRideResult>(`/rides/${id}/cancel`, { reason: reason ?? null }),
  payment: (id: number) => api.get<Payment>(`/rides/${id}/payment`),
  rate: (id: number, data: { score: number; comment?: string }) =>
    api.post<Rating>(`/rides/${id}/rating`, data),
  // Live trip tracking payload (status model, real coordinates, real driver
  // details and explicit capability flags). Access is enforced server-side.
  tracking: (id: number) => api.get<RideTracking>(`/rides/${id}/tracking`),
};


export const safetyService = {
  contacts: () => api.get<TrustedContact[]>("/safety/contacts"),
  addContact: (data: {
    name: string;
    phone: string;
    relationship?: string;
  }) => api.post<TrustedContact>("/safety/contacts", data),
  editContact: (id: number, data: {
    name?: string;
    phone?: string;
    relationship?: string;
  }) => api.put<TrustedContact>(`/safety/contacts/${id}`, data),
  deleteContact: (id: number) => api.delete(`/safety/contacts/${id}`),
  reports: () => api.get<SafetyReport[]>("/safety/reports"),
  report: (data: { ride_id?: number; category: string; description: string }) =>
    api.post<SafetyReport>("/safety/reports", data),
};
export const driverApplicationService = {
  submit: (data: {
    full_name: string;
    email: string;
    phone?: string;
    vehicle_category: string;
    vehicle_registration_number: string;
    licence_number: string;
    city: string;
    notes?: string;
  }) => api.post<any>("/driver-applications", data),
  mine: () => api.get<any>("/driver-applications/me"),
};
export const adminService = {
  stats: () => api.get<any>("/admin/stats"),
  users: () => api.get<any[]>("/admin/users"),
  categories: () => api.get<any[]>("/admin/categories"),
  rides: (params?: { status?: string; date_from?: string; date_to?: string; q?: string }) =>
    api.get<any[]>("/admin/rides", { params }),
  driverApplications: () => api.get<any[]>("/admin/drivers/applications"),
  // Live operational status of the backend (admin only). Every value is
  // measured by the running server.
  systemHealth: () => api.get<SystemHealth>("/admin/system-health"),
};

