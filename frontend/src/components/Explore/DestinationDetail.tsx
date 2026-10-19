"use client";

import { ArrowLeft, MapPin, Share2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTripStore } from "@/store/tripStore";
import { openExternalMaps } from "@/lib/externalMaps";
import { MapView } from "@/components/MapView";
import { EmptyState } from "@/components/common";
import type { TouristPlace } from "@/types";

type DestinationDetailProps = {
  place: TouristPlace | null;
  onBack: () => void;
};

export function DestinationDetail({ place, onBack }: DestinationDetailProps) {
  const navigate = useNavigate();
  const { setDropoffLocation } = useTripStore();

  if (!place) {
    return (
      <div className="flex min-h-screen flex-col bg-rsgo-50">
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto w-full">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-rsgo-600 mb-6"
            aria-label="Back to Explore Amritsar"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Explore Amritsar
          </button>
          <EmptyState
            icon={<MapPin className="w-12 h-12 text-gray-400" />}
            title="Destination not found"
            description="The requested place could not be found."
            action={
              <button
                onClick={onBack}
                className="btn-primary"
                aria-label="Back to Explore Amritsar"
              >
                Back to Explore Amritsar
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const hasCoords = place.lat != null && place.lng != null;
  const coords = hasCoords
    ? { lat: place.lat!, lng: place.lng! }
    : null;

  const handlePlanRide = () => {
    if (!coords || !place.bookable) return;
    setDropoffLocation({
      name: place.name,
      lat: coords.lat,
      lng: coords.lng,
    });
    navigate("/home");
  };

  const handleOpenMaps = () => {
    openExternalMaps({ name: place.name, lat: place.lat, lng: place.lng });
  };

  return (
    <div className="flex min-h-screen flex-col bg-rsgo-50">
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-5xl mx-auto w-full">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-rsgo-600 mb-6"
          aria-label="Back to Explore Amritsar"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Explore Amritsar
        </button>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  place.source === "api"
                    ? "bg-rsgo-50 text-rsgo-700 border border-rsgo-200"
                    : "bg-orange-50 text-orange-700 border border-orange-200"
                }`}
              >
                {place.source === "api" ? "Live location data" : "Static catalogue"}
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-rsgo-900 mb-2 leading-tight">
              {place.name}
            </h1>
            <p className="text-lg text-rsgo-600 mb-6 leading-relaxed">
              {place.description}
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-rsgo-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-rsgo-900">Location</p>
                  <p className="text-sm text-rsgo-600">
                    {coords ? (
                      <>
                        {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                        <br />
                        <span className="text-xs text-rsgo-400 mt-1 block">
                          Verified coordinates from the booking dataset.
                        </span>
                      </>
                    ) : (
                      <>
                        Not available in the booking dataset
                        <br />
                        <span className="text-xs text-rsgo-400 mt-1 block">
                          No address or coordinates are stored for this static
                          catalogue entry.
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-5 h-5 text-rsgo-600 flex-shrink-0 mt-0.5">
                  {place.source === "api" ? (
                    <span aria-hidden="true">✓</span>
                  ) : (
                    <span aria-hidden="true">i</span>
                  )}
                </span>
                <div>
                  <p className="font-medium text-rsgo-900">Data source</p>
                  <p className="text-sm text-rsgo-600">
                    {place.source === "api"
                      ? "Live RideSetGo location dataset"
                      : "Static catalogue — not part of the live booking API"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-5 h-5 text-rsgo-600 flex-shrink-0 mt-0.5">
                  {place.bookable ? (
                    <span aria-hidden="true">✓</span>
                  ) : (
                    <span aria-hidden="true">i</span>
                  )}
                </span>
                <div>
                  <p className="font-medium text-rsgo-900">Ride booking</p>
                  <p className="text-sm text-rsgo-600">
                    {place.bookable
                      ? "Available — coordinates verified in the booking dataset."
                      : "Not available — no verified coordinates in the booking dataset."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              {coords && place.bookable ? (
                <button
                  onClick={handlePlanRide}
                  className="btn-primary flex-1 sm:flex-none w-full sm:w-48"
                >
                  Plan a Ride
                </button>
              ) : (
                <button
                  disabled
                  className="bg-gray-100 text-gray-400 flex-1 sm:flex-none w-full sm:w-48"
                >
                  Not bookable
                </button>
              )}
              <button
                onClick={handleOpenMaps}
                className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl border border-gray-200 bg-white text-rsgo-700 font-medium hover:bg-gray-50 transition-colors w-full sm:w-48"
                aria-label={`Open ${place.name} in an external maps service`}
              >
                <Share2 className="w-4 h-4" /> Open in Maps
              </button>
            </div>

            <p className="mt-4 text-xs text-rsgo-400">
              RideSetGo is a demo project. Fare estimates and bookings are not
              official quotes and no real payment is processed.
            </p>
          </div>

          {/* Map preview — existing Leaflet/OpenStreetMap component, markers only */}
          <div className="card h-[340px] md:h-[420px] rounded-3xl overflow-hidden shadow-rsgo">
            {coords ? (
              <MapView dropoff={{ lat: coords.lat, lng: coords.lng, name: place.name }} showRoute={false} height="100%" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <MapPin className="w-10 h-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">
                  Map preview unavailable — no verified coordinates.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
