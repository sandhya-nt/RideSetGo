// TypeScript types for RideSetGo frontend

export type User = {
  id: number;
  email: string;
  full_name: string;
  phone?: string;
  role: "customer" | "driver" | "admin";
  is_active: boolean;
};

export type Location = {
  name: string;
  lat: number;
  lng: number;
};

// ---------------------------------------------------------------------------
// Explore Amritsar — tourist guide types
//
// A TouristPlace is a destination shown on the Explore page. `source` records
// whether the core location record (name + coordinates) came from the live
// booking API (GET /locations/) or from a static catalogue maintained in the
// frontend. Static entries are clearly separated from live API data and are
// never sent to the booking endpoint unless they also have verified coordinates
// returned by the API.
// ---------------------------------------------------------------------------
export type DataSource = "api" | "static";

export type TouristCategory = {
  id: string;
  label: string;
};

export type TouristPlace = {
  name: string;
  category: string; // TouristCategory.id
  description: string; // short factual catalogue text, never live data
  source: DataSource;
  lat?: number; // only present for API-backed places
  lng?: number; // only present for API-backed places
  bookable: boolean; // false when no verified coordinates exist (e.g. Gobindgarh Fort)
};

export type RideCategory = {
  name: string;
  display_name: string;
  multiplier: number;
  icon: string;
  min_fare: number;
};

export type FareEstimate = {
  pickup_location: string;
  dropoff_location: string;
  distance_km: number;
  duration_min: number;
  base_fare_inr: number;
  category_multipliers: Record<string, number>;
  currency: string;
  note: string;
};

export type Ride = {
  id: number;
  pickup_location: string;
  dropoff_location: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number;
  category: string;
  base_fare: number;
  final_fare: number;
  currency: string;
  status: string;
  passenger_count: number;
  hour?: number;
  created_at: string;
};

export type Payment = {
  id: number;
  ride_id: number;
  amount: number;
  currency: string;
  method: string;
  status: string;
  transaction_id?: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Live trip tracking — Phase 11
//
// Mirrors GET /rides/{id}/tracking. `driver_location` and `route_geometry`
// are null in the current backend (no driver-GPS store, no routing provider)
// and the UI renders an honest unavailable state instead of a fake marker.
// ---------------------------------------------------------------------------

export type TripTrackingStage = {
  key: string;
  label: string;
  description: string;
};

export type TripTrackingDriver = {
  name: string;
  phone?: string | null;
};

export type TripTrackingDriverLocation = {
  lat: number;
  lng: number;
  updated_at: string;
};

export type TripTrackingRoutePoint = {
  lat: number;
  lng: number;
};

export type TripTrackingCapabilities = {
  live_tracking_available: boolean;
  driver_location_available: boolean;
  route_geometry_available: boolean;
  eta_available: boolean;
  message: string;
};

export type RideTracking = {
  id: number;
  status: string;
  status_label: string;
  is_terminal: boolean;
  stages: TripTrackingStage[];
  booking_reference: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_km: number;
  estimated_duration_min?: number | null;
  category: string;
  base_fare: number;
  final_fare: number;
  currency: string;
  passenger_count: number;
  created_at: string;
  updated_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  driver?: TripTrackingDriver | null;
  driver_location?: TripTrackingDriverLocation | null;
  route_geometry?: TripTrackingRoutePoint[] | null;
  capabilities: TripTrackingCapabilities;
};

export type CancelRideResult = {
  message: string;
  ride_id: number;
  status: string;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
};

export type Rating = {
  id: number;
  score: number;
  comment?: string;
  created_at: string;
};

export type TrustedContact = {
  id: number;
  name: string;
  phone: string;
  relationship?: string | null;
  created_at: string;
};

export type SafetyReport = {
  id: number;
  ride_id: number | null;
  category: string;
  description: string;
  status: string;
  created_at: string;
};

export type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  initializing: boolean;
  authError: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
  initializeAuth: () => Promise<void>;
  setInitializing: (v: boolean) => void;
  setAuthError: (msg: string | null) => void;
};

export type AppState = {
  selectedCategory: string | null;
  pickupLocation: Location | null;
  dropoffLocation: Location | null;
  fareEstimate: FareEstimate | null;
  setSelectedCategory: (cat: string | null) => void;
  setPickupLocation: (loc: Location | null) => void;
  setDropoffLocation: (loc: Location | null) => void;
  setFareEstimate: (est: FareEstimate | null) => void;
  clearTrip: () => void;
};

// ---------------------------------------------------------------------------
// System health (Phase 19)
//
// Mirrors GET /admin/system-health. Every field is measured by the running
// backend — the dashboard never invents a number. The response contains
// counters and timings only: no stack traces, no connection strings, no user
// data.
// ---------------------------------------------------------------------------

export type SystemHealth = {
  generated_at: string;
  service: {
    app: string;
    version: string;
    status: string;
    uptime_seconds: number;
    started_at: string;
  };
  database: {
    ready: boolean;
    latency_ms: number;
    failures_total: number;
    last_failure_at: string | null;
  };
  requests: {
    total: number;
    by_status_class: Record<string, number>;
    by_method: Record<string, number>;
    error_rate_4xx_percent: number;
    error_rate_5xx_percent: number;
  };
  latency_ms: {
    count: number;
    window_size: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
  health_checks: {
    total: number;
    ok: number;
    failed: number;
    last: {
      status: string;
      checked_at: string;
      detail?: string;
    } | null;
  };
  errors: {
    unhandled_exceptions: number;
    external_failures: Record<string, number>;
    client_errors_reported: number;
  };
  top_routes: { route: string; count: number }[];
};
