import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import { divIcon, icon } from "leaflet";

// Custom markers to avoid default Leaflet marker image issues
const pickupMarkerIcon = icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const dropoffMarkerIcon = icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const driverMarkerIcon = icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Colour coded dots used by the "trip" marker variant (pickup / destination /
// driver). The default variant keeps the original Leaflet pins so existing
// screens are unchanged.
function dotMarkerIcon(color: string) {
  return divIcon({
    className: "",
    html: `<span style="display:block;width:20px;height:20px;border-radius:9999px;background:${color};border:3px solid #ffffff;box-shadow:0 1px 4px rgba(15,23,42,0.45)"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

const TRIP_MARKER_COLORS = {
  pickup: "#16a34a", // green
  dropoff: "#dc2626", // red
  driver: "#0f172a", // deep navy
};

export function MapView({
  pickup,
  dropoff,
  showRoute = true,
  height = "100%",
  fitBounds = false,
  driver,
  route,
  variant = "default",
}: {
  pickup?: { lat: number; lng: number; name: string };
  dropoff?: { lat: number; lng: number; name: string };
  showRoute?: boolean;
  height?: string;
  /** Zoom out so every supplied marker is visible. */
  fitBounds?: boolean;
  /**
   * Last reported driver position. Only pass this when the backend actually
   * returns a driver location — it is never derived or simulated.
   */
  driver?: { lat: number; lng: number; name: string };
  /**
   * Real road-route geometry. When omitted the map falls back to a
   * straight-line preview between pickup and destination.
   */
  route?: { lat: number; lng: number }[];
  /**
   * "default" keeps the original Leaflet pins. "trip" uses colour coded dots
   * so pickup (green), destination (red) and driver (navy) are told apart.
   */
  variant?: "default" | "trip";
}) {
  const center = pickup || dropoff || { lat: 31.634, lng: 74.872, name: "Amritsar" };

  const markerIcons = useMemo(() => {
    if (variant !== "trip") {
      return {
        pickup: pickupMarkerIcon,
        dropoff: dropoffMarkerIcon,
        driver: driverMarkerIcon,
      };
    }
    return {
      pickup: dotMarkerIcon(TRIP_MARKER_COLORS.pickup),
      dropoff: dotMarkerIcon(TRIP_MARKER_COLORS.dropoff),
      driver: dotMarkerIcon(TRIP_MARKER_COLORS.driver),
    };
  }, [variant]);

  const routePositions: [number, number][] = route && route.length > 1
    ? route.map((p) => [p.lat, p.lng] as [number, number])
    : pickup && dropoff
      ? [
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ]
      : [];

  // Every point that is genuinely on the map, used to frame the view.
  const boundsPoints = useMemo(
    () =>
      [pickup, dropoff, driver].filter(
        (p): p is { lat: number; lng: number; name: string } => Boolean(p)
      ),
    [
      pickup?.lat,
      pickup?.lng,
      dropoff?.lat,
      dropoff?.lng,
      driver?.lat,
      driver?.lng,
    ]
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      style={{ height, width: "100%" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {pickup && (
        <Marker
          position={[pickup.lat, pickup.lng]}
          icon={markerIcons.pickup}
        >
          <Popup>{pickup.name}</Popup>
        </Marker>
      )}

      {dropoff && (
        <Marker
          position={[dropoff.lat, dropoff.lng]}
          icon={markerIcons.dropoff}
        >
          <Popup>{dropoff.name}</Popup>
        </Marker>
      )}

      {driver && (
        <Marker
          position={[driver.lat, driver.lng]}
          icon={markerIcons.driver}
        >
          <Popup>{driver.name}</Popup>
        </Marker>
      )}

      {showRoute && routePositions.length > 1 && (
        <Polyline
          positions={routePositions}
          color="#5266e8"
          weight={3}
          opacity={0.8}
          dashArray="10, 10"
        />
      )}

      {fitBounds && boundsPoints.length > 0 && (
        <FitAllPoints points={boundsPoints} />
      )}
    </MapContainer>
  );
}

// Center map on given bounds
export function FitBoundsMap({
  pickup,
  dropoff,
}: {
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
}) {
  const map = useMap();
  useEffect(() => {
    map.flyToBounds(
      [
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng],
      ],
      { padding: [50, 50], maxZoom: 15 }
    );
  }, [map, pickup, dropoff]);
  return null;
}

// Fits every marker that is actually on the map (pickup, destination and —
// when the backend provides one — the last reported driver position).
function FitAllPoints({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.flyTo([points[0].lat, points[0].lng], 15);
      return;
    }
    map.flyToBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
      { padding: [50, 50], maxZoom: 15 }
    );
  }, [map, points]);
  return null;
}
