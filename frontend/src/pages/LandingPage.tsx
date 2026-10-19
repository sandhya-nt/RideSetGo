/**
 * LandingPage — public entry point for RideSetGo.
 *
 * This page is reachable without an account. It lets a visitor pick a pickup
 * and destination from the real Amritsar location dataset, choose a ride
 * category, see a fare estimate, and preview the route on the map — then hand
 * the selection over to the existing booking flow on /home.
 *
 * Data sources (all existing, nothing invented):
 *   - GET  /api/locations/   -> locationService.list()   (names + coordinates)
 *   - GET  /api/categories/   -> categoryService.list()   (bike/auto/mini/sedan/suv)
 *   - POST /api/fare/estimate -> fareService.estimate()   (ML fare + distance + duration)
 *   - The route line on the map is a STRAIGHT LINE between the two dataset
 *     coordinates, exactly like the existing MapView. It is not a road route,
 *     and it is labelled as a preview wherever it is shown.
 *   - The backend has no live driver availability, tracking or payment
 *     processing, so none is shown here.
 *
 * The page never creates a booking. It stores the selection in the existing
 * tripStore and continues to /home (signed in) or /login (signed out).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Car,
  CheckCircle,
  Clock,
  IndianRupee,
  LocateIcon,
  MapPin,
  RefreshCw,
  Route,
  Shield,
  Users,
  X,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { MapView } from "@/components/MapView";
import { RideCategoryCard } from "@/components/RideCategoryCard";
import { FareBreakdown } from "@/components/FareBreakdown";
import { ErrorAlert, LoadingSpinner } from "@/components/common";
import { useAuthStore } from "@/store/authStore";
import { useTripStore } from "@/store/tripStore";
import { categoryService, fareService, locationService } from "@/services/api";
import { buildTouristCatalogue } from "@/lib/places";
import type {
  FareEstimate,
  Location as LocationType,
  RideCategory,
  TouristPlace,
} from "@/types";

/* -------------------------------------------------------------------------- */
/* Location input with accessible suggestion list                            */
/* -------------------------------------------------------------------------- */

type LocationFieldProps = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  locations: LocationType[];
  selected: LocationType | null;
  loading: boolean;
  onValueChange: (next: string) => void;
  onSelect: (loc: LocationType) => void;
};

function LocationField({
  id,
  label,
  placeholder,
  value,
  locations,
  selected,
  loading,
  onValueChange,
  onSelect,
}: LocationFieldProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${id}-listbox`;

  // Filtering happens against the already-fetched dataset, so typing never
  // triggers a network request.
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = q
      ? locations.filter((l) => l.name.toLowerCase().includes(q))
      : locations;
    return pool.slice(0, 6);
  }, [locations, value]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const commit = useCallback(
    (loc: LocationType) => {
      onSelect(loc);
      close();
    },
    [onSelect, close]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (matches.length === 0) return;
      setOpen(true);
      setActiveIndex((i) => (i + 1) % matches.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length === 0) return;
      setOpen(true);
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
      return;
    }
    if (e.key === "Enter") {
      if (open && activeIndex >= 0 && matches[activeIndex]) {
        e.preventDefault();
        commit(matches[activeIndex]);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const showList = open && focused;
  const noMatches = showList && !loading && matches.length === 0;

  return (
    <div className="relative">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <MapPin
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
          }
          className="input-field pl-11 pr-10"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => {
            // Delay so a click on a suggestion is not swallowed by the blur.
            window.setTimeout(() => {
              setFocused(false);
              close();
            }, 120);
          }}
          onKeyDown={handleKeyDown}
        />
        {value ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onValueChange("");
              inputRef.current?.focus();
            }}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-rsgo-400 hover:text-rsgo-700 hover:bg-rsgo-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {selected ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-orange-700">
          <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
          Selected: {selected.name}
        </p>
      ) : null}

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-2xl shadow-rsgo-lg max-h-64 overflow-y-auto py-1"
        >
          {loading ? (
            <li className="px-4 py-3 text-sm text-rsgo-500 flex items-center gap-2">
              <LoadingSpinner className="w-4 h-4" /> Loading locations…
            </li>
          ) : noMatches ? (
            <li className="px-4 py-4 text-sm text-rsgo-500">
              No location matches “{value.trim()}”. Try another name.
            </li>
          ) : (
            matches.map((loc, index) => (
              <li
                key={loc.name}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(loc)}
                className={`px-4 py-3 flex items-center gap-3 text-sm cursor-pointer transition-colors ${
                  index === activeIndex
                    ? "bg-orange-50 text-orange-800"
                    : "text-rsgo-700 hover:bg-rsgo-50"
                }`}
              >
                <MapPin
                  className="w-4 h-4 text-orange-500 flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">{loc.name}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small presentational helpers                                               */
/* -------------------------------------------------------------------------- */

function StepCard({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="card-hover p-6 h-full">
      <div className="w-11 h-11 rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
        <span className="font-bold text-orange-700">{step}</span>
      </div>
      <h3 className="font-bold text-rsgo-900 mb-2">{title}</h3>
      <p className="text-sm text-rsgo-600 leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card-hover p-6 h-full">
      <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-bold text-rsgo-900 mb-2">{title}</h3>
      <p className="text-sm text-rsgo-600 leading-relaxed">{description}</p>
    </div>
  );
}

function PlaceCard({
  place,
  onUse,
}: {
  place: TouristPlace;
  onUse: (place: TouristPlace) => void;
}) {
  const bookable = place.bookable && place.lat != null && place.lng != null;
  return (
    <article className="card-hover p-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-bold text-rsgo-900 leading-tight">{place.name}</h3>
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
            place.source === "api"
              ? "bg-rsgo-50 text-rsgo-700 border border-rsgo-200"
              : "bg-orange-50 text-orange-700 border border-orange-200"
          }`}
        >
          {place.source === "api" ? "Live data" : "Catalogue"}
        </span>
      </div>
      <p className="text-sm text-rsgo-600 leading-relaxed flex-1">
        {place.description}
      </p>
      <div className="mt-4 pt-3 border-t border-gray-100">
        {bookable ? (
          <button
            type="button"
            onClick={() => onUse(place)}
            className="inline-flex items-center gap-2 text-sm font-medium text-orange-700 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 rounded-lg"
          >
            Use as destination
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <p className="text-xs text-rsgo-400">
            Not in the booking dataset — not bookable.
          </p>
        )}
      </div>
    </article>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, initializeAuth } = useAuthStore();
  const {
    setPickupLocation,
    setDropoffLocation,
    setSelectedCategory,
    setFareEstimate,
  } = useTripStore();

  const [locations, setLocations] = useState<LocationType[]>([]);
  const [categories, setCategories] = useState<RideCategory[]>([]);
  const [places, setPlaces] = useState<TouristPlace[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [pickupInput, setPickupInput] = useState("");
  const [dropoffInput, setDropoffInput] = useState("");
  const [selectedPickup, setSelectedPickup] = useState<LocationType | null>(null);
  const [selectedDropoff, setSelectedDropoff] = useState<LocationType | null>(null);
  const [selectedCategory, setSelectedCategoryLocal] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [estimateError, setEstimateError] = useState("");
  const [validationError, setValidationError] = useState("");

  // Guards against a slow response overwriting a newer estimate.
  const latestRequestId = useRef(0);
  // Avoids re-requesting the same route we already priced.
  const lastCalculatedKey = useRef<string | null>(null);

  /* ---------------------------------------------------------------------- */
  /* Data loading                                                           */
  /* ---------------------------------------------------------------------- */

  const loadLocations = useCallback(async () => {
    setLoadingLocations(true);
    setLoadError("");
    try {
      const res = await locationService.list();
      const data = res.data ?? [];
      setLocations(data);
      setPlaces(buildTouristCatalogue(data));
    } catch (err: any) {
      setLoadError(
        err.response?.data?.detail ||
          "We could not load Amritsar locations. Please try again."
      );
    } finally {
      setLoadingLocations(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const res = await categoryService.list();
      const data = (res.data ?? []) as RideCategory[];
      setCategories(data);
      if (data.length > 0) {
        // Keep the stored selection while the backend still offers it,
        // otherwise fall back to the first supported category.
        const current = useTripStore.getState().selectedCategory;
        const stillSupported = data.some((c) => c.name === current);
        const next = stillSupported ? current! : data[0].name;
        setSelectedCategoryLocal(next);
        setSelectedCategory(next);
      }
    } catch (err: any) {
      setLoadError(
        err.response?.data?.detail ||
          "We could not load ride categories. Please try again."
      );
    } finally {
      setLoadingCategories(false);
    }
  }, [setSelectedCategory]);

  useEffect(() => {
    void loadLocations();
    void loadCategories();
  }, [loadLocations, loadCategories]);

  // This page sits outside SessionGate, so the persisted session is not
  // verified anywhere else. Validate it here so "Continue Booking" sends a
  // signed-in user to /home and a signed-out user to /login.
  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  /* ---------------------------------------------------------------------- */
  /* Fare estimation (existing endpoint, existing model)                     */
  /* ---------------------------------------------------------------------- */

  const calculateFare = useCallback(
    async (p: LocationType, d: LocationType) => {
      const requestId = ++latestRequestId.current;
      const key = `${p.name}|${d.name}`;
      setCalculating(true);
      // Drop the previous estimate so a stale fare is never shown against a
      // new pickup/destination pair.
      setEstimate(null);
      setEstimateError("");
      try {
        const res = await fareService.estimate({
          pickup_location: p.name,
          dropoff_location: d.name,
          passenger_count: 1,
          hour: new Date().getHours(),
        });
        if (requestId !== latestRequestId.current) return;
        setEstimate(res.data);
        lastCalculatedKey.current = key;
      } catch (err: any) {
        if (requestId !== latestRequestId.current) return;
        setEstimateError(
          err.response?.data?.detail ||
            "We could not estimate that fare right now. Please try again."
        );
      } finally {
        if (requestId === latestRequestId.current) {
          setCalculating(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedPickup || !selectedDropoff) {
      latestRequestId.current += 1;
      setEstimate(null);
      setEstimateError("");
      setCalculating(false);
      return;
    }
    if (selectedPickup.name === selectedDropoff.name) {
      // The backend rejects identical pickup/dropoff, so we do not request.
      latestRequestId.current += 1;
      setEstimate(null);
      setEstimateError("");
      setCalculating(false);
      return;
    }
    const key = `${selectedPickup.name}|${selectedDropoff.name}`;
    if (key === lastCalculatedKey.current) return;
    void calculateFare(selectedPickup, selectedDropoff);
  }, [selectedPickup, selectedDropoff, calculateFare]);

  /* ---------------------------------------------------------------------- */
  /* Selection handlers                                                     */
  /* ---------------------------------------------------------------------- */

  const handleSelectPickup = useCallback(
    (loc: LocationType) => {
      setSelectedPickup(loc);
      setPickupInput(loc.name);
      setValidationError("");
      setPickupLocation(loc);
    },
    [setPickupLocation]
  );

  const handleSelectDropoff = useCallback(
    (loc: LocationType) => {
      setSelectedDropoff(loc);
      setDropoffInput(loc.name);
      setValidationError("");
      setDropoffLocation(loc);
    },
    [setDropoffLocation]
  );

  const handleSwap = useCallback(() => {
    if (!selectedPickup || !selectedDropoff) return;
    const p = selectedPickup;
    const d = selectedDropoff;
    setSelectedPickup(d);
    setSelectedDropoff(p);
    setPickupInput(d.name);
    setDropoffInput(p.name);
    setPickupLocation(d);
    setDropoffLocation(p);
  }, [selectedPickup, selectedDropoff, setPickupLocation, setDropoffLocation]);

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setValidationError("This browser does not support location access.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        let nearest: LocationType | null = null;
        let minDist = Infinity;
        for (const loc of locations) {
          const d = Math.hypot(loc.lat - latitude, loc.lng - longitude);
          if (d < minDist) {
            minDist = d;
            nearest = loc;
          }
        }
        if (nearest) {
          handleSelectPickup(nearest);
        } else {
          setValidationError("No known Amritsar location found near you.");
        }
      },
      () => {
        setValidationError(
          "Location permission was not granted. Please pick a location manually."
        );
      },
      { timeout: 10000 }
    );
  }, [locations, handleSelectPickup]);

  const handleSelectCategory = useCallback(
    (name: string) => {
      setSelectedCategoryLocal(name);
      setSelectedCategory(name);
    },
    [setSelectedCategory]
  );

  const handleUsePlaceAsDestination = useCallback(
    (place: TouristPlace) => {
      if (place.lat == null || place.lng == null) return;
      handleSelectDropoff({ name: place.name, lat: place.lat, lng: place.lng });
      document
        .getElementById("booking")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [handleSelectDropoff]
  );

  /* ---------------------------------------------------------------------- */
  /* Continue to the existing booking flow                                   */
  /* ---------------------------------------------------------------------- */

  const handleContinue = useCallback(() => {
    if (!selectedPickup || !selectedDropoff) {
      setValidationError(
        "Please select both a pickup location and a destination to continue."
      );
      return;
    }
    if (selectedPickup.name === selectedDropoff.name) {
      setValidationError(
        "Your pickup and destination must be different locations."
      );
      return;
    }

    // Persist the selection so the booking page can pick it up.
    setPickupLocation(selectedPickup);
    setDropoffLocation(selectedDropoff);
    if (selectedCategory) setSelectedCategory(selectedCategory);
    if (estimate) setFareEstimate(estimate);

    navigate(isAuthenticated ? "/home" : "/login");
  }, [
    selectedPickup,
    selectedDropoff,
    selectedCategory,
    estimate,
    isAuthenticated,
    navigate,
    setPickupLocation,
    setDropoffLocation,
    setSelectedCategory,
    setFareEstimate,
  ]);

  const categoryFare = useMemo(() => {
    if (!estimate || !selectedCategory) return null;
    return estimate.category_multipliers?.[selectedCategory] ?? null;
  }, [estimate, selectedCategory]);

  const canContinue = !!selectedPickup && !!selectedDropoff;

  return (
    <div className="min-h-screen flex flex-col bg-rsgo-50">
      <Header />

      <main className="flex-1">
        {/* ================= HERO ================= */}
        <section className="relative bg-rsgo-900 text-white overflow-hidden">
          {/* Decorative gradient wash */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(234,88,12,0.25),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(59,130,246,0.18),transparent_40%)]"
          />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 md:pt-20 md:pb-24">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Hero copy */}
              <div className="animate-fade-in">
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/15 text-orange-300 text-xs font-semibold border border-orange-500/25">
                  <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                  Now serving Amritsar
                </span>

                <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight leading-[1.08] text-white">
                  Amritsar,{" "}
                  <span className="text-orange-400">Your Way.</span>
                </h1>

                <p className="mt-6 text-lg md:text-xl text-rsgo-200 leading-relaxed max-w-xl">
                  Book a ride across the Golden Temple, Hall Bazaar, Wagah
                  Border and beyond. Transparent fares, real Amritsar locations,
                  and a booking flow that stays out of your way.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <a
                    href="#booking"
                    className="btn-primary inline-flex items-center justify-center gap-2"
                  >
                    Book a Ride
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </a>
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-medium text-white border-2 border-white/25 hover:border-white/50 hover:bg-white/5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-rsgo-900"
                  >
                    See how it works
                  </a>
                </div>

                <dl className="mt-10 grid grid-cols-3 gap-4 max-w-md">
                  {[
                    { label: "Service area", value: "Amritsar" },
                    { label: "Ride types", value: `${categories.length || "—"}` },
                    { label: "Fares", value: "INR" },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <dt className="text-xs uppercase tracking-wider text-rsgo-400">
                        {stat.label}
                      </dt>
                      <dd className="mt-1 text-lg font-bold text-white">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* ================= BOOKING PANEL ================= */}
              <div id="booking" className="scroll-mt-24">
                <div className="bg-white rounded-3xl shadow-rsgo-xl border border-gray-100 overflow-hidden animate-slide-up">
                  <div className="px-5 sm:px-7 pt-6 pb-5 border-b border-gray-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Logo size={36} />
                      <div>
                        <h2 className="font-bold text-rsgo-900 text-lg leading-tight">
                          Plan your ride
                        </h2>
                        <p className="text-xs text-rsgo-500">
                          Fares are estimates, shown before you book.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 sm:px-7 py-6 space-y-5">
                    {loadError ? <ErrorAlert message={loadError} /> : null}

                    {/* Pickup + destination + swap */}
                    <div className="space-y-3">
                      <LocationField
                        id="landing-pickup"
                        label="Pickup"
                        placeholder="Where should we pick you up?"
                        value={pickupInput}
                        locations={locations}
                        selected={selectedPickup}
                        loading={loadingLocations}
                        onValueChange={setPickupInput}
                        onSelect={handleSelectPickup}
                      />

                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-gray-200" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={handleSwap}
                          disabled={!selectedPickup || !selectedDropoff}
                          aria-label="Swap pickup and destination"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium text-rsgo-600 hover:text-orange-700 hover:border-orange-300 hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                        >
                          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                          Swap
                        </button>
                        <div className="h-px flex-1 bg-gray-200" aria-hidden="true" />
                      </div>

                      <LocationField
                        id="landing-dropoff"
                        label="Destination"
                        placeholder="Where are you going?"
                        value={dropoffInput}
                        locations={locations}
                        selected={selectedDropoff}
                        loading={loadingLocations}
                        onValueChange={setDropoffInput}
                        onSelect={handleSelectDropoff}
                      />

                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={loadingLocations || locations.length === 0}
                        className="inline-flex items-center gap-2 text-xs font-medium text-rsgo-600 hover:text-orange-700 transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg"
                      >
                        <LocateIcon className="w-3.5 h-3.5" aria-hidden="true" />
                        Use my current location
                      </button>
                    </div>

                    {/* Categories */}
                    <div>
                      <p className="label" id="landing-category-label">
                        Choose a ride
                      </p>
                      {loadingCategories ? (
                        <div className="flex items-center gap-2 text-sm text-rsgo-500 py-2">
                          <LoadingSpinner className="w-4 h-4" /> Loading ride
                          types…
                        </div>
                      ) : categories.length === 0 ? (
                        <p className="text-sm text-rsgo-500">
                          Ride types are unavailable right now.
                        </p>
                      ) : (
                        <div
                          role="radiogroup"
                          aria-labelledby="landing-category-label"
                          className="grid grid-cols-3 sm:grid-cols-5 gap-2"
                        >
                          {categories.map((cat) => (
                            <RideCategoryCard
                              key={cat.name}
                              category={cat}
                              isSelected={selectedCategory === cat.name}
                              onSelect={handleSelectCategory}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Fare estimate */}
                    {selectedPickup && selectedDropoff ? (
                      selectedPickup.name === selectedDropoff.name ? (
                        <p
                          role="status"
                          className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3"
                        >
                          Pickup and destination must be different locations.
                        </p>
                      ) : calculating ? (
                        <div
                          role="status"
                          className="flex items-center gap-2 text-sm text-rsgo-600 bg-rsgo-50 border border-gray-100 rounded-2xl px-4 py-4"
                        >
                          <LoadingSpinner className="w-4 h-4" /> Estimating your
                          fare…
                        </div>
                      ) : estimateError ? (
                        <ErrorAlert message={estimateError} />
                      ) : estimate ? (
                        <FareBreakdown
                          baseFare={estimate.base_fare_inr}
                          categoryFare={categoryFare ?? estimate.base_fare_inr}
                          category={selectedCategory ?? "Ride"}
                          distance={estimate.distance_km}
                          duration={estimate.duration_min}
                        />
                      ) : null
                    ) : null}

                    {validationError ? (
                      <p
                        role="alert"
                        className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-2xl px-4 py-3"
                      >
                        {validationError}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={handleContinue}
                      disabled={!canContinue}
                      className="btn-primary w-full inline-flex items-center justify-center gap-2"
                    >
                      Continue Booking
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>

                    <p className="text-xs text-rsgo-400 text-center leading-relaxed">
                      {isAuthenticated
                        ? "You'll be taken to the booking screen to confirm."
                        : "You'll be asked to sign in before the ride is booked."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= MAP PREVIEW ================= */}
        <section className="section bg-white" aria-labelledby="map-heading">
          <div className="max-w-7xl mx-auto">
            <div className="section-header">
              <h2 id="map-heading" className="section-title">
                See your route before you book
              </h2>
              <p className="section-subtitle">
                Pickup and destination markers come straight from the
                RideSetGo Amritsar location dataset.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2">
                <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-rsgo bg-rsgo-50">
                  <div className="h-[320px] md:h-[420px]">
                    <MapView
                      pickup={
                        selectedPickup
                          ? {
                              lat: selectedPickup.lat,
                              lng: selectedPickup.lng,
                              name: selectedPickup.name,
                            }
                          : undefined
                      }
                      dropoff={
                        selectedDropoff
                          ? {
                              lat: selectedDropoff.lat,
                              lng: selectedDropoff.lng,
                              name: selectedDropoff.name,
                            }
                          : undefined
                      }
                      showRoute={!!selectedPickup && !!selectedDropoff}
                      height="100%"
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs text-rsgo-500 leading-relaxed">
                  Route preview only. The line drawn on the map is a straight
                  line between the two location points — it is not a road
                  route, and no road distance or travel time is shown. The
                  distance and duration in the fare estimate come from the
                  backend&rsquo;s straight-line calculation.
                </p>
              </div>

              <div className="card p-6">
                <h3 className="font-bold text-rsgo-900 mb-4 flex items-center gap-2">
                  <Route className="w-5 h-5 text-orange-600" aria-hidden="true" />
                  Your selection
                </h3>
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-rsgo-400">
                      Pickup
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-rsgo-900 flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full bg-rsgo-600 flex-shrink-0"
                        aria-hidden="true"
                      />
                      {selectedPickup?.name ?? "Not selected yet"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-rsgo-400">
                      Destination
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-rsgo-900 flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0"
                        aria-hidden="true"
                      />
                      {selectedDropoff?.name ?? "Not selected yet"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-rsgo-400">
                      Ride type
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-rsgo-900">
                      {selectedCategory ?? "Not selected yet"}
                    </dd>
                  </div>
                  {estimate ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-rsgo-400">
                        Estimated fare
                      </dt>
                      <dd className="mt-1 text-2xl font-bold text-rsgo-900">
                        ₹
                        {(categoryFare ?? estimate.base_fare_inr).toLocaleString(
                          "en-IN"
                        )}
                      </dd>
                      <dd className="mt-1 text-xs text-rsgo-500">
                        {estimate.distance_km.toFixed(1)} km · about{" "}
                        {estimate.duration_min} min
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className="btn-outline w-full mt-6 inline-flex items-center justify-center gap-2"
                >
                  Continue Booking
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section
          id="how-it-works"
          className="section bg-rsgo-50 scroll-mt-20"
          aria-labelledby="how-heading"
        >
          <div className="max-w-7xl mx-auto">
            <div className="section-header">
              <h2 id="how-heading" className="section-title">
                How it works
              </h2>
              <p className="section-subtitle">
                Four simple steps, and you&rsquo;ll know the fare before you
                commit to anything.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <StepCard
                step={1}
                title="Pick your locations"
                description="Search our Amritsar dataset and drop a pin on your pickup point and destination."
              />
              <StepCard
                step={2}
                title="Choose a ride type"
                description="Compare bike, auto, mini, sedan and SUV options with their minimum fares up front."
              />
              <StepCard
                step={3}
                title="See your fare"
                description="Our model returns an estimated fare, distance and duration for the exact pair you picked."
              />
              <StepCard
                step={4}
                title="Sign in and book"
                description="Continue to the booking screen, confirm the details, and place your ride."
              />
            </div>
          </div>
        </section>

        {/* ================= FARE TRANSPARENCY ================= */}
        <section className="section bg-white" aria-labelledby="fare-heading">
          <div className="max-w-7xl mx-auto">
            <div className="section-header">
              <h2 id="fare-heading" className="section-title">
                Transparent fares, no surprises
              </h2>
              <p className="section-subtitle">
                Every figure you see comes from our fare model and is shown
                before you book — never after.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <FeatureCard
                icon={
                  <IndianRupee
                    className="w-6 h-6 text-orange-600"
                    aria-hidden="true"
                  />
                }
                title="One base fare, shown plainly"
                description="We calculate a base fare for your route and display the per-ride-type figures derived from it."
              />
              <FeatureCard
                icon={<Clock className="w-6 h-6 text-orange-600" aria-hidden="true" />}
                title="Distance and duration up front"
                description="The distance between your two points and an estimated trip duration are shown with the fare."
              />
              <FeatureCard
                icon={
                  <Users className="w-6 h-6 text-orange-600" aria-hidden="true" />
                }
                title="Pick the ride that fits"
                description="Every ride type carries its own minimum fare, so you can match the option to your trip."
              />
            </div>
            <p className="mt-8 text-center text-xs text-rsgo-400 max-w-2xl mx-auto leading-relaxed">
              {estimate?.note ??
                "Estimated/demo pricing only. Not an official Uber, Ola, or Rapido quote."}
            </p>
          </div>
        </section>

        {/* ================= SAFETY ================= */}
        <section className="section bg-rsgo-50" aria-labelledby="safety-heading">
          <div className="max-w-7xl mx-auto">
            <div className="section-header">
              <h2 id="safety-heading" className="section-title">
                Safety built into every trip
              </h2>
              <p className="section-subtitle">
                Tools that help you stay informed from pickup to drop-off.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <FeatureCard
                icon={
                  <Shield className="w-6 h-6 text-orange-600" aria-hidden="true" />
                }
                title="Trusted contacts"
                description="Add people you trust, so someone else knows where your trip is headed."
              />
              <FeatureCard
                icon={
                  <CheckCircle
                    className="w-6 h-6 text-orange-600"
                    aria-hidden="true"
                  />
                }
                title="Trip history and receipts"
                description="Every ride you take is listed in My Trips with its fare, distance and status."
              />
              <FeatureCard
                icon={
                  <Car className="w-6 h-6 text-orange-600" aria-hidden="true" />
                }
                title="Report an issue"
                description="If something goes wrong, you can file a safety report against the ride from your trip details."
              />
            </div>
          </div>
        </section>

        {/* ================= EXPLORE AMRITSAR ================= */}
        {places.length > 0 ? (
          <section
            id="explore"
            className="section bg-white scroll-mt-20"
            aria-labelledby="explore-heading"
          >
            <div className="max-w-7xl mx-auto">
              <div className="section-header">
                <h2 id="explore-heading" className="section-title">
                  Explore Amritsar
                </h2>
                <p className="section-subtitle">
                  Popular destinations from the RideSetGo location dataset. Pick
                  one and it becomes your destination.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {places.map((place) => (
                  <PlaceCard
                    key={place.name}
                    place={place}
                    onUse={handleUsePlaceAsDestination}
                  />
                ))}
              </div>
              <p className="mt-8 text-center text-xs text-rsgo-400 max-w-2xl mx-auto leading-relaxed">
                &ldquo;Live data&rdquo; places come from the RideSetGo booking
                dataset and can be booked. &ldquo;Catalogue&rdquo; entries are
                static tourist information only and are not bookable.
              </p>
            </div>
          </section>
        ) : null}

        {/* ================= CTA ================= */}
        <section className="bg-rsgo-900 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20 text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Ready when you are.
            </h2>
            <p className="text-rsgo-200 max-w-2xl mx-auto mb-8">
              Set your pickup and destination, see the fare, and continue to
              the booking screen.
            </p>
            <a href="#booking" className="btn-primary inline-flex items-center justify-center gap-2">
              Book a Ride
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
