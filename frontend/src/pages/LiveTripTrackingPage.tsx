/**
 * LiveTripTrackingPage — RideSetGo Phase 11
 *
 * Passenger-facing live trip tracking dashboard for a single ride.
 *
 * Data sources (all real, all from the existing API layer):
 *   - GET /rides/{id}/tracking -> status model, stored pickup/destination
 *     coordinates, real driver details and explicit capability flags.
 *   - GET /rides/{id}/payment  -> payment method / status (optional).
 *
 * Honesty rules baked into this screen:
 *   - No driver marker, no moving vehicle, no simulated ETA and no invented
 *     route geometry. The backend reports `driver_location`/`route_geometry`
 *     as null because it stores no driver GPS and integrates no routing
 *     provider, and the page renders that as an explicit unavailable state.
 *   - The map is labelled a "route preview" (straight line between the two
 *     stored points) unless real route geometry is returned.
 *   - The status timeline only contains the statuses the backend accepts
 *     (requested -> accepted -> started -> completed, plus cancelled).
 *   - The passenger can only cancel a ride the backend allows cancelling
 *     (requested or accepted). Status changes always come from the API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { rideService } from "@/services/api";
import { MapView } from "@/components/MapView";
import { EmptyState, ErrorAlert, Skeleton } from "@/components/common";
import {
  ArrowLeft,
  Ban,
  Car,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  Flag,
  History,
  LifeBuoy,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Receipt,
  RefreshCw,
  Route,
  Satellite,
  Timer,
  User,
  XCircle,
} from "lucide-react";
import type { Payment, RideTracking } from "@/types";

/** How often the trip status is re-checked while the ride is still active. */
const POLL_INTERVAL_MS = 15000;

/** Statuses the backend allows a customer to cancel (see rides.py). */
const CANCELLABLE_STATUSES = ["requested", "accepted"];

type LoadErrorKind = "notfound" | "forbidden" | "auth" | "network" | "invalid";

type LoadError = {
  kind: LoadErrorKind;
  message: string;
};

type Tone = {
  chip: string;
  icon: React.ComponentType<{ className?: string }>;
  ring: string;
};

const STATUS_TONES: Record<string, Tone> = {
  requested: {
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Clock,
    ring: "bg-amber-500",
  },
  accepted: {
    chip: "bg-rsgo-50 text-rsgo-700 border-rsgo-200",
    icon: User,
    ring: "bg-rsgo-700",
  },
  started: {
    chip: "bg-orange-50 text-orange-700 border-orange-200",
    icon: Navigation,
    ring: "bg-orange-500",
  },
  completed: {
    chip: "bg-green-50 text-green-700 border-green-200",
    icon: CheckCircle2,
    ring: "bg-green-500",
  },
  cancelled: {
    chip: "bg-red-50 text-red-700 border-red-200",
    icon: XCircle,
    ring: "bg-red-500",
  },
};

const DEFAULT_TONE: Tone = {
  chip: "bg-gray-50 text-gray-700 border-gray-200",
  icon: Circle,
  ring: "bg-gray-400",
};

function toneFor(status: string): Tone {
  return STATUS_TONES[status] ?? DEFAULT_TONE;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(date: Date | null): string {
  if (!date) return "";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}

function formatFare(value: number, currency: string): string {
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  return `${symbol}${Math.round(value).toLocaleString("en-IN")}`;
}

export default function LiveTripTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rideId = Number(id);

  const [tracking, setTracking] = useState<RideTracking | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  // Guards against overlapping requests and stale responses overwriting newer
  // data (e.g. when the ride id in the URL changes mid-flight).
  const requestSeq = useRef(0);
  const inFlight = useRef(false);
  // Tracks whether we already hold trip data, so a failed background refresh
  // can degrade gracefully instead of replacing the screen with an error.
  const hasTracking = useRef(false);
  // Latest trip data, readable from timers/listeners without re-subscribing.
  const trackingRef = useRef<RideTracking | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const silent = options.silent ?? false;

      if (!Number.isFinite(rideId) || rideId <= 0) {
        setError({
          kind: "invalid",
          message: "This tracking link does not contain a valid trip reference.",
        });
        setLoading(false);
        return;
      }

      // A newer request always wins: older responses are dropped.
      const seq = ++requestSeq.current;
      inFlight.current = true;
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const [trackingResult, paymentResult] = await Promise.allSettled([
          rideService.tracking(rideId),
          rideService.payment(rideId),
        ]);

        if (seq !== requestSeq.current) return;

        if (trackingResult.status === "fulfilled") {
          setTracking(trackingResult.value.data);
          hasTracking.current = true;
          setError(null);
          setRefreshError("");
          setLastCheckedAt(new Date());
        } else {
          const status = trackingResult.reason?.response?.status;
          const detail =
            trackingResult.reason?.response?.data?.detail ||
            "Could not load this trip right now.";

          if (hasTracking.current) {
            // A background refresh failed but we already have data: keep
            // showing the last known state and say so, instead of replacing
            // the whole screen with an error.
            setRefreshError(
              "The latest status update could not be fetched. Showing the last known status."
            );
          } else if (status === 404) {
            setError({
              kind: "notfound",
              message: "We could not find this trip. It may have been removed.",
            });
          } else if (status === 403) {
            setError({
              kind: "forbidden",
              message:
                "This trip belongs to another account, so its details are not available to you.",
            });
          } else if (status === 401) {
            setError({
              kind: "auth",
              message: "Your session has expired. Please sign in again.",
            });
          } else {
            setError({ kind: "network", message: detail });
          }
        }

        // Payment is optional: a missing record must not break the screen.
        setPayment(
          paymentResult.status === "fulfilled" ? paymentResult.value.data : null
        );
      } finally {
        if (seq === requestSeq.current) {
          inFlight.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [rideId]
  );

  // Initial load + reload whenever the ride id changes. Any in-flight
  // request for the previous id is invalidated so its data can never be
  // shown for the new trip.
  useEffect(() => {
    setTracking(null);
    setPayment(null);
    setError(null);
    setRefreshError("");
    setLastCheckedAt(null);
    hasTracking.current = false;
    void load();
    return () => {
      requestSeq.current += 1;
    };
  }, [load]);

  // Conservative status refresh while the ride is still active. The backend
  // has no WebSocket/SSE channel and no driver-location feed, so this only
  // re-reads the trip status - it is never presented as live GPS tracking.
  const isTerminal = tracking?.is_terminal ?? false;

  useEffect(() => {
    trackingRef.current = tracking;
  }, [tracking]);

  useEffect(() => {
    if (isTerminal) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return; // do not poll a background tab
      if (inFlight.current) return; // never overlap requests
      if (trackingRef.current?.is_terminal) return; // stop on terminal states
      void load({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isTerminal, load]);

  // Re-check as soon as the passenger comes back to the tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      if (inFlight.current) return;
      if (!trackingRef.current || trackingRef.current.is_terminal) return;
      void load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const confirmCancel = async () => {
    if (cancelling || !tracking) return;
    setCancelling(true);
    setCancelError("");
    try {
      await rideService.cancelWithReason(
        tracking.id,
        cancelReason.trim() ? cancelReason.trim() : undefined
      );
      setCancelOpen(false);
      setCancelReason("");
      // Re-read the trip so the screen reflects the server response.
      await load({ silent: true });
    } catch (err: any) {
      setCancelError(
        err?.response?.data?.detail ||
          "This ride could not be cancelled. Please try again."
      );
    } finally {
      setCancelling(false);
    }
  };

  const currentStageIndex = useMemo(() => {
    if (!tracking) return -1;
    return tracking.stages.findIndex((stage) => stage.key === tracking.status);
  }, [tracking]);

  const canCancel = Boolean(
    tracking && CANCELLABLE_STATUSES.includes(tracking.status)
  );

  // ---------- Render states ----------

  if (loading) {
    return (
      <div className="min-h-screen bg-rsgo-50">
        <TrackingSubHeader onBack={() => navigate(-1)} />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              <div className="card p-6">
                <Skeleton className="h-6 w-48 mb-3" />
                <Skeleton className="h-4 w-72" />
                <div className="mt-6 space-y-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-full max-w-sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <Skeleton className="h-[320px] w-full rounded-none" />
              </div>
            </div>
            <div className="space-y-6">
              <div className="card p-6 space-y-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="card p-6 space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </div>
          <p className="sr-only" role="status">
            Loading your trip tracking details
          </p>
        </main>
      </div>
    );
  }

  if (error && !tracking) {
    return (
      <div className="min-h-screen bg-rsgo-50">
        <TrackingSubHeader onBack={() => navigate(-1)} />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {error.kind === "notfound" && (
            <div className="card p-8">
              <EmptyState
                icon={<MapPin className="w-7 h-7 text-gray-400" />}
                title="Trip not found"
                description={error.message}
                action={
                  <button
                    onClick={() => navigate("/history")}
                    className="btn-primary px-5 py-2.5"
                  >
                    Go to My Trips
                  </button>
                }
              />
            </div>
          )}

          {error.kind === "forbidden" && (
            <div className="card p-8">
              <EmptyState
                icon={<Flag className="w-7 h-7 text-gray-400" />}
                title="This trip is not available to you"
                description={error.message}
                action={
                  <button
                    onClick={() => navigate("/history")}
                    className="btn-primary px-5 py-2.5"
                  >
                    Go to My Trips
                  </button>
                }
              />
            </div>
          )}

          {error.kind === "auth" && (
            <div className="card p-8">
              <EmptyState
                icon={<User className="w-7 h-7 text-gray-400" />}
                title="Session expired"
                description={error.message}
                action={
                  <button
                    onClick={() => navigate("/login")}
                    className="btn-primary px-5 py-2.5"
                  >
                    Sign in again
                  </button>
                }
              />
            </div>
          )}

          {error.kind === "invalid" && (
            <div className="card p-8">
              <EmptyState
                icon={<MapPin className="w-7 h-7 text-gray-400" />}
                title="Invalid trip link"
                description={error.message}
                action={
                  <button
                    onClick={() => navigate("/history")}
                    className="btn-primary px-5 py-2.5"
                  >
                    Go to My Trips
                  </button>
                }
              />
            </div>
          )}

          {error.kind === "network" && (
            <div className="card p-6">
              <ErrorAlert message={error.message} />
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => void load()}
                  className="btn-primary flex items-center justify-center gap-2 px-5 py-2.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try again
                </button>
                <button
                  onClick={() => navigate("/history")}
                  className="btn-ghost flex items-center justify-center gap-2 px-5 py-2.5"
                >
                  <History className="w-4 h-4" />
                  Go to My Trips
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (!tracking) return null;

  const tone = toneFor(tracking.status);
  const StatusIcon = tone.icon;
  const capabilities = tracking.capabilities;
  const driverLocation = tracking.driver_location ?? null;
  const routeGeometry =
    tracking.route_geometry && tracking.route_geometry.length > 1
      ? tracking.route_geometry
      : null;
  const isCancelled = tracking.status === "cancelled";
  const isCompleted = tracking.status === "completed";
  const mapBadge = routeGeometry
    ? "Route"
    : capabilities.driver_location_available
      ? "Driver position"
      : "Route preview";

  return (
    <div className="min-h-screen bg-rsgo-50 pb-24 md:pb-12">
      <TrackingSubHeader
        onBack={() => navigate(-1)}
        bookingReference={tracking.booking_reference}
        refreshing={refreshing}
        onRefresh={() => void load({ silent: true })}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Status hero */}
        <section
          className="card p-6 sm:p-8 mb-6"
          aria-labelledby="trip-status-heading"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border ${tone.chip}`}
            >
              <StatusIcon className="w-7 h-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  id="trip-status-heading"
                  className="text-2xl sm:text-3xl font-bold text-rsgo-900"
                >
                  {tracking.status_label}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${tone.chip}`}
                >
                  {capabilities.live_tracking_available ? (
                    <Satellite className="w-3.5 h-3.5" />
                  ) : (
                    <Ban className="w-3.5 h-3.5" />
                  )}
                  {capabilities.live_tracking_available
                    ? "Live tracking on"
                    : "Live GPS unavailable"}
                </span>
              </div>
              <p className="text-rsgo-600 mt-1.5">
                {currentStageIndex >= 0
                  ? tracking.stages[currentStageIndex].description
                  : isCancelled
                    ? "This ride was cancelled."
                    : "Your trip status is shown below."}
              </p>
              <p className="text-xs text-rsgo-500 mt-3" aria-live="polite">
                Status last updated {formatDateTime(tracking.updated_at)}
                {lastCheckedAt
                  ? ` · checked ${formatRelative(lastCheckedAt)}`
                  : ""}
                {!isTerminal ? " · refreshing every 15 seconds" : ""}
              </p>
            </div>
          </div>

          {refreshError && (
            <div
              className="mt-6 rounded-2xl bg-amber-50 border border-amber-100 p-4 flex gap-3"
              role="status"
            >
              <RefreshCw className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">
                  Status update unavailable
                </p>
                <p className="text-sm text-amber-700 mt-0.5">{refreshError}</p>
                <button
                  onClick={() => void load({ silent: true })}
                  className="text-sm font-medium text-amber-800 underline mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {isCancelled && (
            <div
              className="mt-6 rounded-2xl bg-red-50 border border-red-100 p-4 flex gap-3"
              role="status"
            >
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800">This ride was cancelled</p>
                <p className="text-sm text-red-700 mt-0.5">
                  {tracking.cancellation_reason
                    ? `Reason: ${tracking.cancellation_reason}`
                    : "No cancellation reason was recorded."}
                </p>
                <p className="text-xs text-red-600 mt-1">
                  Cancelled {formatDateTime(tracking.cancelled_at)}
                </p>
              </div>
            </div>
          )}

          {isCompleted && (
            <div
              className="mt-6 rounded-2xl bg-green-50 border border-green-100 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between"
              role="status"
            >
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-800">Trip completed</p>
                  <p className="text-sm text-green-700 mt-0.5">
                    Your receipt and rating are available for this ride.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate(`/trips/${tracking.id}/receipt`)}
                className="btn-primary flex items-center justify-center gap-2 px-4 py-2 text-sm"
              >
                <Receipt className="w-4 h-4" />
                View receipt
              </button>
            </div>
          )}
        </section>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            {/* Progress timeline */}
            <section className="card p-6 sm:p-8" aria-labelledby="progress-heading">
              <h2
                id="progress-heading"
                className="text-lg font-bold text-rsgo-900 mb-1"
              >
                Trip progress
              </h2>
              <p className="text-sm text-rsgo-500 mb-6">
                Based on the status recorded by RideSetGo for this booking.
              </p>

              <ol className="space-y-0">
                {tracking.stages.map((stage, index) => {
                  // A cancelled ride was certainly requested, but the backend
                  // does not record how far it got, so no later stage is
                  // claimed as reached.
                  const isDone = isCancelled
                    ? index === 0
                    : currentStageIndex > index || isCompleted;
                  const isCurrent = currentStageIndex === index && !isCompleted;
                  const stageTone = isDone || isCurrent ? tone : DEFAULT_TONE;
                  const StageIcon = isDone ? Check : stageTone.icon;

                  return (
                    <li key={stage.key} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span
                          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white ${stageTone.ring} ${
                            isCurrent ? "ring-4 ring-orange-100" : ""
                          }`}
                          aria-hidden="true"
                        >
                          <StageIcon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
                        </span>
                        {index < tracking.stages.length - 1 && (
                          <span
                            className={`w-0.5 flex-1 min-h-[28px] ${
                              isDone ? "bg-rsgo-300" : "bg-gray-200"
                            }`}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div className="pb-6 min-w-0">
                        <p
                          className={`font-semibold ${
                            isDone || isCurrent
                              ? "text-rsgo-900"
                              : "text-rsgo-400"
                          }`}
                          aria-current={isCurrent ? "step" : undefined}
                        >
                          {stage.label}
                          {isCurrent && (
                            <span className="ml-2 text-xs font-medium text-orange-600">
                              Current
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-rsgo-500 mt-0.5">
                          {stage.description}
                        </p>
                      </div>
                    </li>
                  );
                })}

                {isCancelled && (
                  <li className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white bg-red-500"
                        aria-hidden="true"
                      >
                        <XCircle className="w-[18px] h-[18px]" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-red-700">
                        Ride cancelled
                        <span className="ml-2 text-xs font-medium text-red-500">
                          Current
                        </span>
                      </p>
                      <p className="text-sm text-rsgo-500 mt-0.5">
                        This ride was cancelled and will not continue.
                      </p>
                    </div>
                  </li>
                )}
              </ol>
            </section>

            {/* Map */}
            <section className="card overflow-hidden" aria-labelledby="map-heading">
              <div className="px-6 sm:px-8 pt-6 pb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2
                    id="map-heading"
                    className="text-lg font-bold text-rsgo-900 flex items-center gap-2"
                  >
                    <Route className="w-5 h-5 text-rsgo-600" />
                    Route
                  </h2>
                  <p className="text-sm text-rsgo-500 mt-0.5">
                    {routeGeometry
                      ? "Road route between your pickup and destination."
                      : "Straight-line preview between your pickup and destination."}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rsgo-50 text-rsgo-700 border border-rsgo-200">
                  {driverLocation ? (
                    <Satellite className="w-3.5 h-3.5" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  {mapBadge}
                </span>
              </div>

              <div className="h-[280px] sm:h-[360px] border-t border-gray-100">
                <MapView
                  pickup={{
                    lat: tracking.pickup_lat,
                    lng: tracking.pickup_lng,
                    name: tracking.pickup_location,
                  }}
                  dropoff={{
                    lat: tracking.dropoff_lat,
                    lng: tracking.dropoff_lng,
                    name: tracking.dropoff_location,
                  }}
                  driver={
                    driverLocation
                      ? {
                          lat: driverLocation.lat,
                          lng: driverLocation.lng,
                          name: `Last reported position (${formatDateTime(
                            driverLocation.updated_at
                          )})`,
                        }
                      : undefined
                  }
                  route={routeGeometry ?? undefined}
                  fitBounds
                  variant="trip"
                  height="100%"
                />
              </div>

              <div className="px-6 sm:px-8 py-4 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-xs text-rsgo-600">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-600" />
                  Pickup
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                  Destination
                </span>
                {driverLocation && (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rsgo-900" />
                    Last reported driver position
                  </span>
                )}
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-0.5 bg-rsgo-400" />
                  {routeGeometry ? "Road route" : "Straight-line preview"}
                </span>
              </div>
            </section>

            {/* Ride details */}
            <section className="card p-6 sm:p-8" aria-labelledby="details-heading">
              <h2
                id="details-heading"
                className="text-lg font-bold text-rsgo-900 mb-5"
              >
                Ride details
              </h2>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
                <DetailRow
                  icon={<MapPin className="w-4 h-4 text-green-500" />}
                  label="Pickup"
                  value={tracking.pickup_location}
                />
                <DetailRow
                  icon={<Flag className="w-4 h-4 text-red-500" />}
                  label="Destination"
                  value={tracking.dropoff_location}
                />
                <DetailRow
                  icon={<Car className="w-4 h-4 text-rsgo-400" />}
                  label="Ride category"
                  value={tracking.category}
                />
                <DetailRow
                  icon={<Route className="w-4 h-4 text-rsgo-400" />}
                  label="Distance"
                  value={`${Number(tracking.distance_km).toFixed(1)} km`}
                />
                <DetailRow
                  icon={<Timer className="w-4 h-4 text-rsgo-400" />}
                  label="Estimated duration"
                  value={
                    capabilities.eta_available && tracking.estimated_duration_min
                      ? `${tracking.estimated_duration_min} min`
                      : "Not available"
                  }
                />
                <DetailRow
                  icon={<User className="w-4 h-4 text-rsgo-400" />}
                  label="Passengers"
                  value={String(tracking.passenger_count)}
                />
                <DetailRow
                  icon={<Clock className="w-4 h-4 text-rsgo-400" />}
                  label="Booked at"
                  value={formatDateTime(tracking.created_at)}
                />
                <DetailRow
                  icon={<CreditCard className="w-4 h-4 text-rsgo-400" />}
                  label="Fare"
                  value={`${formatFare(tracking.final_fare, tracking.currency)} (estimate)`}
                />
                <DetailRow
                  icon={<Receipt className="w-4 h-4 text-rsgo-400" />}
                  label="Booking reference"
                  value={tracking.booking_reference}
                />
                {payment && (
                  <DetailRow
                    icon={<CreditCard className="w-4 h-4 text-rsgo-400" />}
                    label="Payment"
                    value={`${payment.method} · ${payment.status}`}
                  />
                )}
              </div>
            </section>
          </div>

          {/* Side column */}
          <div className="space-y-6">
            {/* Tracking availability */}
            <section className="card p-6" aria-labelledby="tracking-capability-heading">
              <h2
                id="tracking-capability-heading"
                className="text-base font-bold text-rsgo-900 flex items-center gap-2"
              >
                {capabilities.live_tracking_available ? (
                  <Satellite className="w-5 h-5 text-green-600" />
                ) : (
                  <Satellite className="w-5 h-5 text-rsgo-400" />
                )}
                Live tracking
              </h2>
              <p className="text-sm text-rsgo-600 mt-3">
                {capabilities.message}
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <CapabilityRow
                  ok={capabilities.driver_location_available}
                  label="Driver position on the map"
                />
                <CapabilityRow
                  ok={capabilities.route_geometry_available}
                  label="Turn-by-turn road route"
                />
                <CapabilityRow
                  ok={capabilities.eta_available}
                  label="Estimated arrival time"
                />
              </ul>
              {!isTerminal && (
                <p className="text-xs text-rsgo-500 mt-4 border-t border-gray-100 pt-3">
                  Trip status is re-checked automatically every 15 seconds while
                  this ride is active. This is a status refresh, not live GPS
                  tracking.
                </p>
              )}
            </section>

            {/* Driver */}
            <section className="card p-6" aria-labelledby="driver-heading">
              <h2
                id="driver-heading"
                className="text-base font-bold text-rsgo-900 flex items-center gap-2"
              >
                <User className="w-5 h-5 text-rsgo-600" />
                Your driver
              </h2>

              {tracking.driver ? (
                <div className="mt-4">
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center font-bold text-lg">
                      {tracking.driver.name.trim().charAt(0).toUpperCase() || "D"}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-rsgo-900 truncate">
                        {tracking.driver.name}
                      </p>
                      <p className="text-sm text-rsgo-500">Driver</p>
                    </div>
                  </div>

                  {tracking.driver.phone ? (
                    <a
                      href={`tel:${tracking.driver.phone.replace(/\s+/g, "")}`}
                      className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
                      aria-label={`Call driver ${tracking.driver.name}`}
                    >
                      <Phone className="w-4 h-4" />
                      Call driver
                    </a>
                  ) : (
                    <p className="text-sm text-rsgo-500 mt-4">
                      The driver has not shared a contact number for this ride.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 flex gap-3">
                  <span className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {isCancelled || isCompleted ? (
                      <User className="w-5 h-5 text-gray-400" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-rsgo-400 animate-spin" />
                    )}
                  </span>
                  <div>
                    <p className="font-semibold text-rsgo-900">
                      {isCancelled || isCompleted
                        ? "No driver details"
                        : "No driver assigned yet"}
                    </p>
                    <p className="text-sm text-rsgo-500 mt-0.5">
                      {isCancelled || isCompleted
                        ? "This ride ended before a driver was recorded for it."
                        : "RideSetGo is looking for a driver to accept your booking. Driver details appear here once a driver accepts the ride."}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Actions */}
            <section className="card p-6" aria-labelledby="actions-heading">
              <h2
                id="actions-heading"
                className="text-base font-bold text-rsgo-900 mb-4"
              >
                Actions
              </h2>
              <div className="space-y-3">
                {canCancel && (
                  <button
                    onClick={() => {
                      setCancelError("");
                      setCancelOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-red-300 text-red-600 hover:bg-red-600 hover:text-white font-medium py-3.5 px-6 transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Cancel this ride
                  </button>
                )}

                <button
                  onClick={() => navigate(`/trips/${tracking.id}`)}
                  className="btn-ghost w-full flex items-center justify-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  View trip details
                </button>

                <button
                  onClick={() => navigate("/history")}
                  className="btn-ghost w-full flex items-center justify-center gap-2"
                >
                  <History className="w-4 h-4" />
                  My trips
                </button>

                <button
                  onClick={() => navigate("/home")}
                  className="btn-ghost w-full flex items-center justify-center gap-2"
                >
                  <Car className="w-4 h-4" />
                  Book a ride
                </button>

                <button
                  onClick={() => navigate("/help")}
                  className="btn-ghost w-full flex items-center justify-center gap-2"
                >
                  <LifeBuoy className="w-4 h-4" />
                  Contact support
                </button>
              </div>

              {!canCancel && !isCancelled && !isCompleted && (
                <p className="text-xs text-rsgo-500 mt-4 border-t border-gray-100 pt-3">
                  This ride can no longer be cancelled from the app.
                </p>
              )}
            </section>
          </div>
        </div>
      </main>

      {cancelOpen && (
        <CancelRideDialog
          reason={cancelReason}
          onReasonChange={setCancelReason}
          onConfirm={confirmCancel}
          onClose={() => setCancelOpen(false)}
          submitting={cancelling}
          error={cancelError}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub components
// ---------------------------------------------------------------------------

function TrackingSubHeader({
  onBack,
  bookingReference,
  refreshing,
  onRefresh,
}: {
  onBack: () => void;
  bookingReference?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-rsgo-700 hover:text-rsgo-900 transition-colors rounded-xl px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium hidden sm:inline">Back</span>
        </button>

        <h1 className="text-base sm:text-lg font-bold text-rsgo-900 truncate">
          Live trip tracking
        </h1>

        {onRefresh ? (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm font-medium text-rsgo-600 hover:text-orange-600 transition-colors rounded-xl px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-60"
            aria-label="Refresh trip status"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="hidden md:inline">
              {bookingReference ?? "Refresh"}
            </span>
          </button>
        ) : (
          <div className="w-16" />
        )}
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-rsgo-500">{label}</p>
        <p className="text-sm font-medium text-rsgo-900 break-words">{value}</p>
      </div>
    </div>
  );
}

function CapabilityRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-rsgo-300 flex-shrink-0" />
      )}
      <span className={ok ? "text-rsgo-700" : "text-rsgo-400"}>{label}</span>
    </li>
  );
}

function CancelRideDialog({
  reason,
  onReasonChange,
  onConfirm,
  onClose,
  submitting,
  error,
}: {
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  submitting: boolean;
  error: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Keep the latest handlers in refs so the mount effect (which moves focus)
  // never re-runs while the passenger is typing in the textarea.
  const onCloseRef = useRef(onClose);
  const submittingRef = useRef(submitting);
  onCloseRef.current = onClose;
  submittingRef.current = submitting;

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-rsgo-950/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        tabIndex={-1}
        className="w-full max-w-md bg-white rounded-3xl shadow-rsgo-xl p-6 focus:outline-none"
      >
        <h2
          id="cancel-dialog-title"
          className="text-lg font-bold text-rsgo-900"
        >
          Cancel this ride?
        </h2>
        <p className="text-sm text-rsgo-600 mt-2">
          The ride will be cancelled and the driver will no longer be assigned
          to it. This action cannot be undone.
        </p>

        <label className="label mt-5" htmlFor="cancel-reason">
          Reason (optional)
        </label>
        <textarea
          id="cancel-reason"
          className="input-field min-h-[90px] resize-y"
          placeholder="Let us know why you are cancelling"
          value={reason}
          maxLength={500}
          onChange={(event) => onReasonChange(event.target.value)}
          disabled={submitting}
        />

        {error && (
          <div className="mt-4">
            <ErrorAlert message={error} />
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="btn-ghost flex-1 flex items-center justify-center gap-2"
          >
            Keep ride
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="btn-primary flex-1 flex items-center justify-center gap-2 !bg-red-600 hover:!bg-red-700 focus-visible:!ring-red-400"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Cancelling…
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                Confirm cancellation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
