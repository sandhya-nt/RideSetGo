/**
 * VehicleSelectionPanel — RideSetGo Phase 10
 *
 * Polished, responsive vehicle-selection and fare-comparison panel for the
 * booking experience. All pricing comes from the existing backend:
 *   - GET /categories/   -> available vehicle categories
 *   - POST /fare/estimate -> base fare + per-category estimated fares
 *
 * Design notes (kept faithful to the existing codebase):
 *   - Navy (rsgo) + orange brand palette from tailwind.config.ts.
 *   - Per-category fares are read from `category_multipliers` returned by the
 *     fare API. They are heuristic/demo estimates (multiplier x base fare),
 *     NOT independently trained per-category prices, and are labelled as such.
 *   - No driver availability, registration numbers, ratings, ETA, live
 *     positions, surge, taxes, or discounts are invented.
 *   - The selected category is persisted to the existing tripStore and passed
 *     to the booking request only because the backend schema supports it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  categoryService,
  fareService,
  getApiError,
  rideService,
} from "@/services/api";
import { useTripStore } from "@/store/tripStore";
import { FareBreakdown } from "@/components/FareBreakdown";
import { ErrorAlert, LoadingSpinner } from "@/components/common";
import { newIdempotencyKey } from "@/lib/observability";
import {
  ArrowRight,
  Bike,
  Bus,
  Car,
  Clock,
  MapPin,
  RefreshCw,
  Truck,
} from "lucide-react";
import type { FareEstimate, Location, RideCategory } from "@/types";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Bike: Bike,
  Auto: Truck,
  Mini: Car,
  Sedan: Car,
  SUV: Bus,
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Bike: "Quick solo rides through Amritsar's narrow streets and busy markets.",
  Auto: "Classic Amritsar auto rickshaw experience for short city trips.",
  Mini: "Compact and affordable rides for everyday travel around the city.",
  Sedan: "Comfortable and spacious rides for families and small groups.",
  SUV: "Premium spacious travel for larger groups and luggage-heavy trips.",
};

const CATEGORY_CAPACITY: Record<string, string> = {
  Bike: "1 passenger",
  Auto: "2-3 passengers",
  Mini: "3-4 passengers",
  Sedan: "4 passengers",
  SUV: "5-6 passengers",
};

type VehicleSelectionPanelProps = {
  pickup: Location | null;
  dropoff: Location | null;
  /** Called with the new ride id once the backend confirms the booking. */
  onBookingConfirmed: (rideId: number) => void;
};

export function VehicleSelectionPanel({
  pickup,
  dropoff,
  onBookingConfirmed,
}: VehicleSelectionPanelProps) {
  const {
    selectedCategory: storeSelectedCategory,
    setSelectedCategory,
  } = useTripStore();

  const [categories, setCategories] = useState<RideCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [estimateError, setEstimateError] = useState("");

  const [selectedCategory, setSelectedCategoryLocal] = useState<string>(
    storeSelectedCategory || ""
  );
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  /** Backend request id of the failed attempt, shown as a support reference. */
  const [bookingReference, setBookingReference] = useState("");

  // Guards against stale responses overwriting newer estimates.
  const latestRequestId = useRef(0);
  // Avoids re-fetching an estimate for the same route we already priced.
  const lastCalculatedKey = useRef<string | null>(null);
  // Idempotency key of the current booking attempt. It is reused for every
  // retry of the same attempt (so a retry can never create a duplicate
  // booking) and regenerated when the booking inputs change.
  const bookingIdempotencyKey = useRef<string>(newIdempotencyKey());

  // A different pickup, destination or vehicle is a different booking, so
  // it needs a different idempotency key.
  useEffect(() => {
    bookingIdempotencyKey.current = newIdempotencyKey();
  }, [pickup?.name, dropoff?.name, selectedCategory]);

  // Keep the local selection in sync with the shared store.
  useEffect(() => {
    if (storeSelectedCategory && storeSelectedCategory !== selectedCategory) {
      setSelectedCategoryLocal(storeSelectedCategory);
    }
  }, [storeSelectedCategory, selectedCategory]);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const res = await categoryService.list();
      const data = (res.data ?? []) as RideCategory[];
      setCategories(data);
      if (data.length > 0) {
        // Keep the current selection while it is still supported by the
        // backend; otherwise fall back to the first available category so an
        // unsupported category is never presented as bookable.
        const current = useTripStore.getState().selectedCategory;
        const stillSupported = data.some((c) => c.name === current);
        if (!stillSupported) {
          const first = data[0].name;
          setSelectedCategoryLocal(first);
          setSelectedCategory(first);
        }
      }
    } catch (err: any) {
      setCategoriesError("Ride categories load nahi ho paaein.");
    } finally {
      setCategoriesLoading(false);
    }
  }, [setSelectedCategory]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const formatMoney = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return `₹${value.toLocaleString("en-IN")}`;
  };

  const categoryEstimatedFare = (cat: RideCategory) => {
    if (!estimate) return null;
    return (
      estimate.category_multipliers?.[cat.name] ??
      estimate.base_fare_inr ??
      null
    );
  };

  const selectedCategoryFare = () => {
    if (!estimate) return null;
    const cat = categories.find((c) => c.name === selectedCategory);
    if (cat) {
      const fare = categoryEstimatedFare(cat);
      if (fare !== null) return fare;
    }
    return estimate.category_multipliers?.[selectedCategory] ??
      estimate.base_fare_inr ??
      null;
  };

  const calculateFare = useCallback(
    async (p: Location, d: Location) => {
      const requestId = ++latestRequestId.current;
      const key = `${p.name}|${d.name}`;
      setCalculating(true);
      // Drop any estimate for a previous route so a stale fare is never
      // shown against a new pickup/destination pair.
      setEstimate(null);
      setEstimateError("");
      try {
        const res = await fareService.estimate({
          pickup_location: p.name,
          dropoff_location: d.name,
          passenger_count: 1,
          hour: new Date().getHours(),
        });
        // Only apply this response if it is still the latest request.
        if (requestId === latestRequestId.current) {
          setEstimate(res.data);
          lastCalculatedKey.current = key;
        }
      } catch (err: any) {
        if (requestId === latestRequestId.current) {
          setEstimateError(
            err.response?.data?.detail ||
              "Fare estimate nahi ho paaya. Kripaya thoda baad koshish karein."
          );
        }
        return;
      } finally {
        if (requestId === latestRequestId.current) {
          setCalculating(false);
        }
      }
    },
    []
  );

  // Recalculate when pickup or destination changes. `lastCalculatedKey`
  // tracks the route that was last priced successfully, so the same route is
  // never requested twice in a row.
  useEffect(() => {
    if (!pickup || !dropoff) {
      // Invalidate any in-flight estimate for a route that no longer applies.
      latestRequestId.current += 1;
      setEstimate(null);
      setEstimateError("");
      setCalculating(false);
      return;
    }
    const key = `${pickup.name}|${dropoff.name}`;
    if (key === lastCalculatedKey.current) return;
    void calculateFare(pickup, dropoff);
  }, [pickup, dropoff, calculateFare]);

  const retryEstimate = () => {
    setEstimateError("");
    if (!pickup || !dropoff) return;
    lastCalculatedKey.current = null;
    void calculateFare(pickup, dropoff);
  };

  const handleSelectCategory = (name: string) => {
    setSelectedCategoryLocal(name);
    setSelectedCategory(name);
  };

  /**
   * Book the ride.
   *
   * Duplicate-submission protection (Phase 19):
   *   * The button is disabled while a booking is in flight, so a double
   *     click can never send two requests.
   *   * Every booking attempt carries an idempotency key. A retry after a
   *     network failure reuses the SAME key, so the backend returns the
   *     original booking instead of creating a second ride and a second
   *     payment. The key is only regenerated when the booking inputs change,
   *     which is a genuinely new booking.
   *   * The user's input (pickup, destination, vehicle) is never cleared on
   *     failure, so a retry is one click away.
   */
  const handleBook = async () => {
    if (!pickup || !dropoff || !estimate || !selectedCategory) {
      setBookingError(
        "Please pick a pickup location, a destination, and a vehicle before booking."
      );
      return;
    }
    if (booking) return; // never send a second request while one is running
    setBooking(true);
    setBookingError("");
    setBookingReference("");
    try {
      const res = await rideService.book(
        {
          pickup_location: pickup.name,
          dropoff_location: dropoff.name,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          distance_km: estimate.distance_km,
          category: selectedCategory,
          passenger_count: 1,
          hour: new Date().getHours(),
        },
        bookingIdempotencyKey.current,
      );
      // Navigate to the confirmation page only after the backend confirms.
      const rideId = res.data?.id;
      if (rideId != null) {
        onBookingConfirmed(rideId);
      }
    } catch (err: unknown) {
      const normalized = getApiError(err);
      setBookingError(normalized.message);
      setBookingReference(normalized.requestId ?? "");
      // A failed request keeps the current idempotency key, so pressing
      // "Try again" cannot create a duplicate booking.
    } finally {
      setBooking(false);
    }
  };

  const retryBooking = () => {
    void handleBook();
  };

  // ---------- Rendering ----------

  if (categoriesLoading && categories.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-rsgo-50">
        <LoadingSpinner />
      </div>
    );
  }

  if (categoriesError && categories.length === 0) {
    return (
      <div className="p-6">
        <ErrorAlert message={categoriesError} />
        <button
          onClick={loadCategories}
          className="mt-4 btn-outline"
          aria-label="Retry loading categories"
        >
          <ArrowRight className="w-3 h-3 mr-1" /> Retry
        </button>
      </div>
    );
  }

  if (!pickup || !dropoff) {
    return (
      <div className="card p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-rsgo-500 uppercase tracking-wider mb-1">
              Trip Summary
            </p>
            <p className="text-rsgo-900 font-medium">
              Select pickup &amp; destination to compare fares
            </p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-6">
          <div className="flex items-center gap-2 text-sm text-rsgo-600">
            <MapPin className="w-4 h-4 text-rsgo-500" />
            <span>{pickup ? pickup.name : "Pickup location"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-rsgo-600">
            <MapPin className="w-4 h-4 text-rsgo-500" />
            <span>{dropoff ? dropoff.name : "Destination"}</span>
          </div>
        </div>
        <div className="mt-8 p-6 rounded-2xl bg-gray-50 border border-gray-100 text-center">
          <p className="text-rsgo-600 text-sm">
            Choose your pickup and destination from the map or location list to
            see estimated fares for each vehicle category.
          </p>
        </div>
      </div>
    );
  }

  if (estimateError) {
    return (
      <div className="card p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-rsgo-500 uppercase tracking-wider mb-1">
              Trip Summary
            </p>
            <p className="text-rsgo-900 font-medium">
              {pickup.name} &rarr; {dropoff.name}
            </p>
          </div>
        </div>
        <ErrorAlert message={estimateError} />
        <div className="mt-4">
          <button onClick={retryEstimate} className="btn-outline" aria-label="Retry fare estimate">
            <ArrowRight className="w-3 h-3 mr-1" /> Retry estimate
          </button>
        </div>
      </div>
    );
  }

  // Loading state: the estimate is being (re)calculated for the current
  // route. Returning here also narrows `estimate` for the render below.
  if (calculating || !estimate) {
    return (
      <div className="card p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-rsgo-500 uppercase tracking-wider mb-1">
              Trip Summary
            </p>
            <p className="text-rsgo-900 font-medium">
              {pickup.name} &rarr; {dropoff.name}
            </p>
          </div>
        </div>
        <div
          className="mt-4 p-6 rounded-2xl bg-gray-50 border border-gray-100 text-center"
          role="status"
          aria-live="polite"
        >
          <LoadingSpinner className="w-5 h-5" />
          <p className="text-rsgo-600 text-sm mt-2">
            Calculating your fare estimate...
          </p>
        </div>
      </div>
    );
  }

  const selectedFare = selectedCategoryFare();
  const selectedCat = categories.find((c) => c.name === selectedCategory);
  const Icon = selectedCat ? (ICON_MAP[selectedCat.name] || Car) : Car;

  return (
    <div className="card p-6 md:p-8 space-y-6">
      {/* Trip summary */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-orange-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-rsgo-500 uppercase tracking-wider">Pickup</p>
            <p className="text-sm font-medium text-rsgo-900 break-words truncate" title={pickup.name}>
              {pickup.name}
            </p>
          </div>
        </div>
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-rsgo-600 flex-shrink-0" aria-hidden="true">
          <RefreshCw className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-rose-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-rsgo-500 uppercase tracking-wider">Destination</p>
            <p className="text-sm font-medium text-rsgo-900 break-words truncate" title={dropoff.name}>
              {dropoff.name}
            </p>
          </div>
        </div>
      </div>

      {/* Estimated fare header */}
      <div className="border border-gray-100 rounded-xl p-5 md:p-6 bg-rsgo-50/50">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-rsgo-500 uppercase tracking-wider mb-1">
              Estimated Fare ({selectedCategory})
            </p>
            <p className="text-3xl font-bold text-rsgo-900">
              {formatMoney(selectedFare)}
            </p>
            <span className="text-xs text-rsgo-500">
              {estimate?.currency ?? "INR"} &bull; estimate only
            </span>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center">
            <Icon className="w-8 h-8 text-rsgo-600" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-rsgo-600">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-rsgo-400 uppercase">Distance</span>
            <span className="font-medium text-rsgo-900">
              {(estimate?.distance_km ?? 0).toFixed(1)} km
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-rsgo-400 uppercase">Est. Duration</span>
            <span className="font-medium text-rsgo-900">{estimate?.duration_min ?? 0} min</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-rsgo-400 uppercase">Currency</span>
            <span className="font-medium text-rsgo-900">
              {estimate.currency ?? "INR"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-rsgo-400 uppercase">Pricing</span>
            <span className="font-medium text-rsgo-900">Heuristic</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-rsgo-400 leading-relaxed">
          The fare above is an estimate from our ML model for the {selectedCategory} category,
          using a heuristic category multiplier applied to the base fare. It is not a guaranteed
          final charge — the final amount depends on the actual booking and backend rules.
          No taxes, surge, or extra fees are added here.
        </p>
      </div>

      {/* Fare breakdown from real API fields */}
      {estimate && (
        <FareBreakdown
          baseFare={estimate.base_fare_inr}
          categoryFare={selectedFare ?? estimate.base_fare_inr}
          category={selectedCategory}
          distance={estimate.distance_km}
          duration={estimate.duration_min}
        />
      )}

      {/* Vehicle categories - fare comparison */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-rsgo-900">Available Vehicles</h3>
            <p className="text-xs text-rsgo-500">
              Select a category to update the estimated fare above.
            </p>
          </div>
          {categories.length === 0 && (
            <span className="text-xs text-rsgo-500">No categories available</span>
          )}
        </div>

        {categories.length === 0 ? (
          <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 text-center">
            <p className="text-rsgo-600 text-sm">
              No vehicle categories are available for booking right now.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.name;
              const estFare = categoryEstimatedFare(cat);
              const IconCmp = ICON_MAP[cat.name] || Car;
              return (
                <button
                  key={cat.name}
                  onClick={() => handleSelectCategory(cat.name)}
                  aria-pressed={isSelected}
                  type="button"
                  className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rsgo-600 focus-visible:ring-offset-2 ${
                    isSelected
                      ? "bg-rsgo-50 border-rsgo-600 shadow-rsgo"
                      : "bg-white border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                    isSelected ? "bg-orange-50 border border-orange-200" : "bg-gray-50 border border-gray-200"
                  }`}>
                    <IconCmp
                      className={`w-6 h-6 ${
                        isSelected ? "text-orange-700" : "text-gray-500"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={`font-bold text-sm ${
                        isSelected ? "text-rsgo-900" : "text-gray-800"
                      }`} title={cat.display_name}>
                        {cat.display_name}
                      </h4>
                      {isSelected && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rsgo-100 text-rsgo-700 border border-rsgo-200">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-rsgo-500 line-clamp-2">
                      {CATEGORY_DESCRIPTIONS[cat.name] || "Ride category for Amritsar."}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-sm text-rsgo-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {CATEGORY_CAPACITY[cat.name] || "Multiple passengers"}
                      </span>
                      <span className="font-medium text-rsgo-700">
                        Min {formatMoney(cat.min_fare)}
                      </span>
                    </div>
                    <div className="mt-3 pt-2 border-t border-gray-50/30 flex items-baseline gap-1">
                      <span className={`font-bold ${
                        isSelected ? "text-rsgo-600" : "text-rsgo-900"
                      }`}>
                        {formatMoney(estFare)}
                      </span>
                      <span className="text-xs text-rsgo-400">est.</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <ArrowRight
                      className={`w-4 h-4 transition-transform ${
                        isSelected ? "text-orange-600" : "text-gray-400"
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-xs text-rsgo-400">
          Fares are estimated/demo pricing only — category multipliers are
          heuristic, not per-category trained models, and no live driver
          availability is shown.
        </p>
      </div>

      {/* Continue to Booking */}
      <button
        onClick={handleBook}
        disabled={
          !estimate || !selectedCategory || booking || !pickup || !dropoff
        }
        className="btn-primary w-full py-4 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        aria-label="Continue to booking"
      >
        {booking ? (
          <>
            <LoadingSpinner className="w-4 h-4" /> Booking...
          </>
        ) : (
          <>
            Continue to Booking <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      {bookingError && (
        <div className="mt-3">
          <ErrorAlert message={bookingError} />
          {/* The retry reuses the same idempotency key, so pressing it can
              never create a second booking. The user's input is untouched. */}
          <button
            onClick={retryBooking}
            disabled={booking}
            className="btn-secondary mt-2 w-full py-2 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          {bookingReference && (
            <p className="mt-2 text-[11px] text-gray-400 text-center">
              Reference for support: {bookingReference}
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-rsgo-400 text-center">
        RideSetGo is a demo project — no real drivers, live tracking, or real
        payments. Payment is cash (paid to the driver) unless a gateway is
        configured.
      </p>
    </div>
  );
}
