"use client";

import { MapPin, ArrowRight, Link as LucideLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Location, TouristPlace } from "@/types";
import { PlaceIllustration } from "./PlaceIllustration";

type PlaceCardProps = {
  place: TouristPlace;
  onPlanRide: (place: TouristPlace) => void;
};

export function PlaceCard({ place, onPlanRide }: PlaceCardProps) {
  const navigate = useNavigate();

  const handleDetails = () => {
    navigate(`/explore/${encodeURIComponent(place.name)}`);
  };

  const handlePlanRide = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPlanRide(place);
  };

  // Coordinates are only available for live API places. Static catalogue
  // entries (e.g. Gobindgarh Fort) have none and are not bookable.
  const coords: Location | null =
    place.lat != null && place.lng != null
      ? { name: place.name, lat: place.lat, lng: place.lng }
      : null;

  return (
    <article
      className="card group cursor-pointer"
      onClick={handleDetails}
      role="region"
      aria-label={`Explore ${place.name}`}
    >
      <PlaceIllustration place={place} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-rsgo-900 leading-tight">
            {place.name}
          </h3>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              place.source === "api"
                ? "bg-rsgo-50 text-rsgo-700 border border-rsgo-200"
                : "bg-orange-50 text-orange-700 border border-orange-200"
            }`}
          >
            {place.source === "api" ? "Live data" : "Catalogue"}
          </span>
        </div>
        <p className="text-sm text-rsgo-600 mb-4 line-clamp-2">
          {place.description}
        </p>

        <div className="flex items-center gap-3 mb-5">
          <MapPin className="w-4 h-4 text-rsgo-500" />
          <span className="text-xs text-rsgo-500 font-medium">
            {coords
              ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
              : "Coordinates not available in booking dataset"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDetails}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-gray-200 bg-white text-rsgo-700 text-sm font-medium hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            aria-label={`Explore details for ${place.name}`}
          >
            <LucideLink className="w-3.5 h-3.5" /> Explore Details
          </button>
          <button
            onClick={handlePlanRide}
            disabled={!coords || !place.bookable}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              coords && place.bookable
                ? "bg-orange-600 text-white hover:bg-orange-700 shadow-rsgo active:scale-95 disabled:opacity-60 disabled:pointer-events-none focus-visible:ring-orange-400"
                : "bg-gray-100 text-gray-400 border border-gray-200 disabled:opacity-60 disabled:pointer-events-none"
            }`}
            aria-label={
              coords && place.bookable
                ? `Plan a ride to ${place.name}`
                : `Ride booking not available for ${place.name}`
            }
            title={
              coords && place.bookable
                ? undefined
                : "Not a valid booking location in the current dataset"
            }
          >
            <ArrowRight className="w-3.5 h-3.5" />
            {coords && place.bookable ? "Plan a Ride" : "Not bookable"}
          </button>
        </div>
      </div>
    </article>
  );
}
