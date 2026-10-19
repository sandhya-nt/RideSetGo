"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import { useTripStore } from "@/store/tripStore";
import { locationService } from "@/services/api";
import { SearchInput } from "@/components/SearchInput";
import { EmptyState, ErrorAlert, LoadingSpinner } from "@/components/common";
import type { TouristPlace } from "@/types";
import {
  TOURIST_CATEGORIES,
  buildTouristCatalogue,
} from "@/lib/places";
import { PlaceCard } from "./PlaceCard";
import { DestinationDetail } from "./DestinationDetail";

type View = "grid" | "detail";

export default function ExplorePage() {
  const navigate = useNavigate();
  const { placeName } = useParams<{ placeName?: string }>();
  const { setDropoffLocation } = useTripStore();

  const [view, setView] = useState<View>("grid");
  const [selectedPlace, setSelectedPlace] = useState<TouristPlace | null>(null);

  const [places, setPlaces] = useState<TouristPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // --- Load live locations from the existing booking API -------------------

  const loadLocations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await locationService.list();
      const locations = res.data || [];
      setPlaces(buildTouristCatalogue(locations));
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to load places. Please try again later.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // When arriving directly at a detail URL (e.g. /explore/Golden%20Temple),
  // switch to the detail view for the matching place.
  useEffect(() => {
    if (!placeName) return;
    const decoded = decodeURIComponent(placeName);
    const match = places.find((p) => p.name === decoded);
    if (match) {
      setSelectedPlace(match);
      setView("detail");
    } else {
      setSelectedPlace(null);
      setView("grid");
    }
  }, [placeName, places]);

  // --- Filtering: category + search ---------------------------------------

  const filteredPlaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((place) => {
      if (activeCategory && place.category !== activeCategory) return false;
      if (q && !place.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [places, query, activeCategory]);

  // --- Booking integration -------------------------------------------------

  const handlePlanRide = (place: TouristPlace) => {
    // Only API-backed places with verified coordinates are valid booking
    // destinations. Static catalogue entries (e.g. Gobindgarh Fort) are not
    // bookable and no coordinates are fabricated for them.
    if (!place.bookable || place.lat == null || place.lng == null) return;

    setDropoffLocation({
      name: place.name,
      lat: place.lat,
      lng: place.lng,
    });
    // Navigate to the existing booking flow. HomePage syncs this destination
    // into its form, preserves any existing pickup, and triggers the existing
    // fare-estimation flow before booking.
    navigate("/home");
  };

  const handleBackToHome = () => navigate("/home");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rsgo-50">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col bg-rsgo-50">
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-12 max-w-2xl mx-auto w-full">
          <div className="flex items-center gap-2 text-rsgo-600 mb-6">
            <button
              onClick={handleBackToHome}
              className="flex items-center gap-2 text-rsgo-600 hover:text-orange-600"
              aria-label="Back to Home"
            >
              <ArrowRight className="w-4 h-4" /> Back to Home
            </button>
          </div>
          <ErrorAlert message={error} />
          <div className="mt-6">
            <button
              onClick={() => loadLocations()}
              className="text-sm underline text-rsgo-600 hover:text-orange-600"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Grid view -----------------------------------------------------------

  if (view === "grid") {
    return (
      <div className="flex min-h-screen flex-col bg-rsgo-50">
        <header className="bg-rsgo-900 text-white py-10 md:py-16 border-b border-rsgo-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 text-orange-200 text-xs font-semibold mb-4 border border-orange-500/20">
              <Search className="w-3 h-3" />
              Explore Amritsar
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
              Discover Amritsar
            </h1>
            <p className="text-rsgo-200 text-lg max-w-xl leading-relaxed">
              Plan your visit to the city&rsquo;s heritage sites, markets and
              local experiences, then book a RideSetGo ride to get there.
            </p>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
            <div>
              <h2 className="text-2xl font-bold text-rsgo-900 mb-2">
                Places to explore
              </h2>
              <p className="text-rsgo-500 text-sm">
                {filteredPlaces.length} place{
                  filteredPlaces.length !== 1 ? "s" : ""
                }{
                  filteredPlaces.length === 0
                    ? ". No results match your filters."
                    : "."
                }
              </p>
            </div>
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search supported places&hellip;"
                label="Search supported places"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-8">
            <button
              onClick={() => setActiveCategory(null)}
              aria-pressed={activeCategory === null}
              role="button"
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeCategory === null
                  ? "bg-orange-600 text-white shadow-rsgo"
                  : "bg-white text-rsgo-700 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              All
            </button>
            {TOURIST_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  setActiveCategory(activeCategory === cat.id ? null : cat.id)
                }
                aria-pressed={activeCategory === cat.id}
                role="button"
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat.id
                    ? "bg-orange-600 text-white shadow-rsgo"
                    : "bg-white text-rsgo-700 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-rsgo-400 mb-6 max-w-md">
            Places marked &ldquo;Live data&rdquo; come from the RideSetGo
            booking dataset and can be booked. &ldquo;Catalogue&rdquo; entries
            are static tourist information only.
          </p>

          {filteredPlaces.length === 0 ? (
            <EmptyState
              icon={<Search className="w-12 h-12 text-gray-400" />}
              title="No places found"
              description={
                query
                  ? "Try a different search term or clear the filters."
                  : "No tourist places are available for the selected category."
              }
              action={
                <button
                  onClick={() => {
                    setQuery("");
                    setActiveCategory(null);
                  }}
                  className="btn-primary"
                  aria-label="Clear filters and show all places"
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPlaces.map((place) => (
                <PlaceCard
                  key={place.name}
                  place={place}
                  onPlanRide={handlePlanRide}
                />
              ))}
            </div>
          )}

          <p className="mt-10 text-center text-xs text-rsgo-400">
            RideSetGo is a demo project. Destinations and fares are estimates
            only — no real drivers, live tracking, or payments.
          </p>
        </div>
      </div>
    );
  }

  // --- Detail view ---------------------------------------------------------

  return (
    <DestinationDetail place={selectedPlace} onBack={() => setView("grid")} />
  );
}
