import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { icon } from "leaflet";
import {
  LocateIcon,
  MapPin,
  RefreshCw,
  Clock,
  Shield,
  HelpCircle,
  Car,
  ArrowRight,
  Phone,
} from "lucide-react";
import { categoryService, getApiError, locationService } from "@/services/api";
import { useTripStore } from "@/store/tripStore";
import { RideCategoryCard } from "@/components/RideCategoryCard";
import { VehicleSelectionPanel } from "@/components/VehicleSelectionPanel";
import { LoadingSpinner, RetryableError } from "@/components/common";
import { Logo } from "@/components/Logo";
import type { Location as LocationType, RideCategory } from "@/types";

// Custom leaflet markers
const pickupMarkerIcon = icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const dropoffMarkerIcon = icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// --- Sub-components ---

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-rose-600 text-white shadow-rsgo"
          : "bg-white text-rsgo-600 border border-gray-200 hover:bg-rose-50"
      }`}
    >
      {label}
    </button>
  );
}

function DestinationCard({
  name,
  description,
  coords,
}: {
  name: string;
  description: string;
  coords: { lat: number; lng: number };
}) {
  return (
    <div className="card-hover p-5">
      <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-4 flex-shrink-0">
        <MapPin className="w-5 h-5 text-rose-600" />
      </div>
      <h3 className="font-bold text-rsgo-900 mb-1">{name}</h3>
      <p className="text-sm text-rsgo-600">{description}</p>
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-rsgo-500 font-medium">
          {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
        </span>
        <ArrowRight className="w-3 h-3 text-rose-500" />
      </div>
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
    <div className="card-hover p-6">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
        {icon}
      </div>
      <h3 className="font-bold text-rsgo-900 mb-2">{title}</h3>
      <p className="text-sm text-rsgo-600 leading-relaxed">{description}</p>
    </div>
  );
}

function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card-hover p-5 border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left"
      >
        <h4 className="font-medium text-rsgo-900">{question}</h4>
        <ArrowRight
          className={`w-4 h-4 transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>
      {open && (
        <div className="mt-3 text-sm text-rsgo-600 leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const {
    setPickupLocation,
    setDropoffLocation,
    selectedCategory: storeSelectedCategory,
    setSelectedCategory: setStoreSelectedCategory,
  } = useTripStore();
  const [locations, setLocations] = useState<LocationType[]>([]);
  const [categories, setCategories] = useState<RideCategory[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState("");
  const [selectedPickup, setSelectedPickup] = useState<LocationType | null>(null);
  const [selectedDropoff, setSelectedDropoff] = useState<LocationType | null>(null);
  const [pickupInput, setPickupInput] = useState("");
  const [dropoffInput, setDropoffInput] = useState("");
  const [showPickupDropdown, setShowPickupDropdown] = useState(false);
  const [showDropoffDropdown, setShowDropoffDropdown] = useState(false);
  const selectedCategory = storeSelectedCategory || "Sedan";
  const [activeTab, setActiveTab] = useState("book");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");

  useEffect(() => {
    loadLocations();
    loadCategories();
  }, []);

  // Sync a destination selected via the Explore page into this booking form,
  // preserving any pickup location the user already has. The fare is then
  // estimated by VehicleSelectionPanel using the existing backend flow.
  useEffect(() => {
    const storePickup = useTripStore.getState().pickupLocation;
    const storeDropoff = useTripStore.getState().dropoffLocation;
    if (storeDropoff && !selectedDropoff) {
      setSelectedDropoff(storeDropoff);
      setDropoffInput(storeDropoff.name);
      setDropoffLocation(storeDropoff);
    }
    if (storePickup && !selectedPickup) {
      setSelectedPickup(storePickup);
      setPickupInput(storePickup.name);
      setPickupLocation(storePickup);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLocations = async () => {
    setLoadingLocations(true);
    try {
      const res = await locationService.list();
      setLocations(res.data);
    } catch (err: unknown) {
      setError(
        getApiError(err).message ??
          "Locations load nahi ho paaein. Kripaya thoda baad koshish karein."
      );
    } finally {
      setLoadingLocations(false);
    }
  };

  const loadCategories = async () => {
    setLoadingCategories(true);
    try {
      const res = await categoryService.list();
      setCategories(res.data);
      if (res.data.length > 0) {
        // Keep the user's current selection while it is still supported.
        // Only fall back to the first available category when the stored
        // selection is no longer offered by the backend.
        const current = useTripStore.getState().selectedCategory;
        const stillSupported = res.data.some((c: RideCategory) => c.name === current);
        if (!stillSupported) {
          setStoreSelectedCategory(res.data[0].name);
        }
      }
    } catch (err: unknown) {
      setError(getApiError(err).message ?? "Ride categories load nahi ho paaein.");
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleLocationSelect = (
    type: "pickup" | "dropoff",
    loc: LocationType
  ) => {
    if (type === "pickup") {
      setSelectedPickup(loc);
      setPickupInput(loc.name);
      setShowPickupDropdown(false);
      setPickupLocation(loc);
    } else {
      setSelectedDropoff(loc);
      setDropoffInput(loc.name);
      setShowDropoffDropdown(false);
      setDropoffLocation(loc);
    }
    // Fare is recalculated by the VehicleSelectionPanel when its
    // pickup/dropoff props change.
  };

  const handleSwap = () => {
    if (!selectedPickup || !selectedDropoff) return;
    setSelectedPickup(selectedDropoff);
    setSelectedDropoff(selectedPickup);
    setPickupInput(dropoffInput);
    setDropoffInput(pickupInput);
    setPickupLocation(selectedDropoff);
    setDropoffLocation(selectedPickup);
    // Fare is recalculated by the VehicleSelectionPanel when its
    // pickup/dropoff props change.
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Aapka browser geolocation support nahi karta.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        let nearest = locations[0];
        let minDist = Infinity;
        for (const loc of locations) {
          const d = Math.hypot(loc.lat - latitude, loc.lng - longitude);
          if (d < minDist) {
            minDist = d;
            nearest = loc;
          }
        }
        handleLocationSelect("pickup", nearest);
      },
      () => {
        setError("Location permission nahi mil paayi. Manual location chunein.");
      }
    );
  };

  const filteredPickups = locations.filter((l) =>
    l.name.toLowerCase().includes(pickupInput.toLowerCase())
  );

  const filteredDropoffs = locations.filter((l) =>
    l.name.toLowerCase().includes(dropoffInput.toLowerCase())
  );

  if (loadingLocations || loadingCategories) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-rsgo-50">
      {/* Hero Section */}
      <section className="relative bg-white border-b border-gray-100 py-12 md:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-rose-50 opacity-30 pointer-events-none" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold mb-4">
                <Car className="w-3 h-3" />
                Ride in Amritsar
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-rsgo-900 leading-tight mb-4">
                Your City. Your Ride. Your Way.
              </h1>
              <p className="text-lg text-rsgo-600 mb-6 max-w-lg leading-relaxed">
                Discover a simpler way to travel around Amritsar with RideSetGo.
                Transparent pricing, real locations, and a seamless booking
                experience.
              </p>
              <div className="flex gap-3">
                <button onClick={handleCurrentLocation} className="btn-primary flex-1">
                  <LocateIcon className="w-4 h-4 mr-2" />
                  Use Current Location
                </button>
                <button
                  onClick={() => navigate("/ride-options")}
                  className="btn-outline flex-1"
                >
                  Explore Ride Options
                </button>
              </div>
            </div>

            {/* Booking Panel */}
            <div className="card p-6 md:p-8 shadow-rsgo-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Logo size={20} />
                  <span className="font-bold text-rsgo-900">RideSetGo</span>
                </div>
                <p className="text-xs text-rsgo-500">Amritsar</p>
              </div>

              {error && (
                <RetryableError
                  message={error}
                  onRetry={() => {
                    setError("");
                    void loadLocations();
                    void loadCategories();
                  }}
                  retrying={loadingLocations || loadingCategories}
                />
              )}

              {/* Tabs */}
              <div className="flex gap-2 mb-6">
                <TabButton
                  active={activeTab === "book"}
                  label="Book a Ride"
                  onClick={() => setActiveTab("book")}
                />
                <TabButton
                  active={activeTab === "schedule"}
                  label="Schedule a Ride"
                  onClick={() => setActiveTab("schedule")}
                />
                <TabButton
                  active={activeTab === "options"}
                  label="Ride Options"
                  onClick={() => setActiveTab("options")}
                />
              </div>

              <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                {/* Location selection */}
                <div className="space-y-2">
                  <label className="label">Pickup Location</label>
                  <div className="relative">
                    <MapPin
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-rsgo-500"
                    />
                    <input
                      type="text"
                      className="input-field pl-11"
                      placeholder="Where are you?"
                      value={pickupInput}
                      onChange={(e) => {
                        setPickupInput(e.target.value);
                        setShowPickupDropdown(true);
                      }}
                    />
                  </div>
                  {showPickupDropdown && pickupInput && filteredPickups.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-2xl shadow-rsgo-lg max-h-60 overflow-y-auto">
                      {filteredPickups.slice(0, 8).map((loc) => (
                        <button
                          key={loc.name}
                          onClick={() => handleLocationSelect("pickup", loc)}
                          className="w-full text-left px-4 py-3 hover:bg-rose-50 transition-colors flex items-center gap-3 text-sm text-rsgo-700"
                        >
                          <MapPin className="w-4 h-4 text-rsgo-500" />
                          {loc.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    onClick={handleSwap}
                    className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-rsgo-600 hover:bg-gray-200 transition-colors"
                    aria-label="Swap pickup and destination"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="label">Destination</label>
                  <div className="relative">
                    <MapPin
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-rsgo-500"
                    />
                    <input
                      type="text"
                      className="input-field pl-11"
                      placeholder="Where are you going?"
                      value={dropoffInput}
                      onChange={(e) => {
                        setDropoffInput(e.target.value);
                        setShowDropoffDropdown(true);
                      }}
                    />
                  </div>
                  {showDropoffDropdown && dropoffInput && filteredDropoffs.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-2xl shadow-rsgo-lg max-h-60 overflow-y-auto">
                      {filteredDropoffs.slice(0, 8).map((loc) => (
                        <button
                          key={loc.name}
                          onClick={() => handleLocationSelect("dropoff", loc)}
                          className="w-full text-left px-4 py-3 hover:bg-rose-50 transition-colors flex items-center gap-3 text-sm text-rsgo-700"
                        >
                          <MapPin className="w-4 h-4 text-rsgo-500" />
                          {loc.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pickup now or scheduled */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-rsgo-600" />
                    <span className="text-sm font-medium text-rsgo-700">
                      {scheduled ? "Scheduled Pickup" : "Pickup Now"}
                    </span>
                  </div>
                  <button
                    onClick={() => setScheduled(!scheduled)}
                    className={`w-6 h-6 rounded-full border-2 transition-colors ${
                      scheduled
                        ? "bg-rose-600 border-rose-600"
                        : "border-gray-300"
                    }`}
                  />
                </div>

                {scheduled && (
                  <div className="mt-2">
                    <label className="label">Date & Time</label>
                    <input
                      type="datetime-local"
                      className="input-field"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                    />
                  </div>
                )}

                {/* Vehicle selection & fare comparison panel */}
                <VehicleSelectionPanel
                  pickup={selectedPickup}
                  dropoff={selectedDropoff}
                  onBookingConfirmed={(rideId: number) =>
                    navigate(`/trips/${rideId}`)
                  }
                />
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Map Preview Section */}
      {selectedPickup && selectedDropoff && (
        <section className="py-8 border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="card h-96 md:h-[400px] overflow-hidden">
              <MapContainer
                center={[31.634, 74.872]}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {selectedPickup && (
                  <Marker
                    position={[selectedPickup.lat, selectedPickup.lng]}
                    icon={pickupMarkerIcon}
                  >
                    <Popup>{selectedPickup.name}</Popup>
                  </Marker>
                )}
                {selectedDropoff && (
                  <Marker
                    position={[selectedDropoff.lat, selectedDropoff.lng]}
                    icon={dropoffMarkerIcon}
                  >
                    <Popup>{selectedDropoff.name}</Popup>
                  </Marker>
                )}
                {selectedPickup && selectedDropoff && (
                  <Polyline
                    positions={[
                      [selectedPickup.lat, selectedPickup.lng],
                      [selectedDropoff.lat, selectedDropoff.lng],
                    ]}
                    color="#14b8a6"
                    weight={3}
                    opacity={0.8}
                    dashArray="10, 10"
                  />
                )}
              </MapContainer>
            </div>
          </div>
        </section>
      )}

      {/* Ride Options Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Find the Right Ride for Every Journey</h2>
            <p className="section-subtitle">
              Choose from our range of ride categories. All pricing is estimated
              and for demo purposes only.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <RideCategoryCard
                key={cat.name}
                category={cat}
                isSelected={selectedCategory === cat.name}
                onSelect={(name) => setStoreSelectedCategory(name)}
              />
            ))}
          </div>
          <p className="text-center mt-8 text-xs text-rsgo-500">
            Demo categories — estimated pricing only. No live driver availability.
          </p>
        </div>
      </section>

      {/* Explore RideSetGo Section */}
      <section className="py-16 bg-rsgo-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title mb-4">Explore RideSetGo</h2>
              <p className="text-lg text-rsgo-600 mb-8 leading-relaxed">
                Plan your local journeys in Amritsar with ease. Whether you're
                heading to the Golden Temple, the railway station, or anywhere
                across the city, RideSetGo gives you transparent fare estimates
                and a simple booking experience.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Car className="w-5 h-5 text-rose-600" />
                  <span className="text-rsgo-700 font-medium">
                    Real Amritsar locations from our dataset
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-rose-600" />
                  <span className="text-rsgo-700 font-medium">
                    ML-powered fare estimation
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-rose-600" />
                  <span className="text-rsgo-700 font-medium">
                    Trip history and receipts
                  </span>
                </div>
              </div>
            </div>
            <div className="card p-8">
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                    <Car className="w-10 h-10 text-rose-600" />
                  </div>
                  <p className="text-rsgo-600 text-sm">Your ride awaits in Amritsar</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">
              Booking a ride with RideSetGo is simple and transparent.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                  <span className="font-bold text-rose-700">{step}</span>
                </div>
                <h3 className="font-bold text-rsgo-900 mb-2">
                  {step === 1 ? "Enter Locations" : step === 2 ? "Compare Options" : step === 3 ? "Book Your Ride" : "View Trip Details"}
                </h3>
                <p className="text-sm text-rsgo-600 leading-relaxed">
                  {step === 1 ? "Pick your pickup and destination from real Amritsar locations."
                  : step === 2 ? "See fare estimates for Bike, Auto, Mini, Sedan, and SUV."
                  : step === 3 ? "Select your category and confirm your booking."
                  : "Track your booking status and view trip history."}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Travel Around Amritsar Section */}
      <section className="py-16 bg-rsgo-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Travel Around Amritsar</h2>
            <p className="section-subtitle">
              Popular destinations available in our location dataset.
            </p>
          </div>
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { name: "Golden Temple", description: "Historic Sikh shrine", coords: { lat: 31.620517, lng: 74.777092 } },
              { name: "Amritsar Railway Station", description: "Major rail hub", coords: { lat: 31.634167, lng: 74.872222 } },
              { name: "Hall Bazaar", description: "Famous shopping market", coords: { lat: 31.624167, lng: 74.780833 } },
              { name: "GNDU University", description: "Guru Nanak Dev University", coords: { lat: 31.663889, lng: 74.964444 } },
              { name: "Amritsar Airport (ATQ)", description: "Sri Guru Ram Dass Jee Airport", coords: { lat: 31.707778, lng: 74.807778 } },
            ].map((dest) => (
              <DestinationCard key={dest.name} {...dest} />
            ))}
          </div>
          <p className="text-center mt-8 text-xs text-rsgo-500">
            All coordinates are from the Amritsar dataset. No partnerships implied.
          </p>
        </div>
      </section>

      {/* Why RideSetGo Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Why Choose RideSetGo?</h2>
            <p className="section-subtitle">
              Built for Amritsar, with real data and honest pricing.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Car className="w-6 h-6 text-rose-600" />}
              title="Real Locations"
              description="All pickup and drop-off points come from our verified Amritsar dataset — no fake coordinates."
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6 text-rose-600" />}
              title="Fare Estimation"
              description="ML-powered fare predictions give you transparent pricing before you book."
            />
            <FeatureCard
              icon={<Clock className="w-6 h-6 text-rose-600" />}
              title="Trip History"
              description="View your past rides, fares, and booking status anytime from your profile."
            />
          </div>
        </div>
      </section>

      {/* Plan Your Journey Section */}
      <section className="py-16 bg-rsgo-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card p-8 text-center">
            <h2 className="text-2xl font-bold text-rsgo-900 mb-4">
              Plan Your Journey Ahead
            </h2>
            <p className="text-rsgo-600 mb-6">
              Schedule your ride for a future date and time. (Coming soon —
              backend scheduling not yet implemented.)
            </p>
            <button
              className="btn-ghost"
              disabled
              title="Scheduling not yet available"
            >
              <Clock className="w-4 h-4 mr-2" />
              Schedule a Ride (Coming Soon)
            </button>
          </div>
        </div>
      </section>

      {/* Safety and Support Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-6">
              <h2 className="section-title text-left">Safety &amp; Support</h2>
              <p className="text-lg text-rsgo-600 leading-relaxed">
                Your safety matters. RideSetGo provides transparent information
                and support channels for your journey.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rsgo-900">Transparent Pricing</h4>
                    <p className="text-sm text-rsgo-600">
                      Fare estimates are shown before booking. No hidden charges.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HelpCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rsgo-900">Help &amp; Support</h4>
                    <p className="text-sm text-rsgo-600">
                      Reach out for help with bookings, fares, or account issues.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rsgo-900">Contact</h4>
                    <p className="text-sm text-rsgo-600">
                      support@ridesetgo.example
                    </p>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100 text-sm text-rsgo-500">
                Note: RideSetGo is a demo project. We do not provide live driver
                tracking, emergency response, or driver verification services.
              </div>
            </div>
            <div className="hidden lg:flex items-end">
              <div className="w-full h-64 bg-gray-100 rounded-3xl flex items-center justify-center">
                <div className="text-center opacity-50">
                  <Shield className="w-24 h-24 mb-2" />
                  <p className="text-rsgo-400 text-sm">Safety first</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-rsgo-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Frequently Asked Questions</h2>
            <p className="section-subtitle">
              Answers about fares, booking, and your trips.
            </p>
          </div>
          <div className="max-w-3xl mx-auto space-y-3">
            <FAQItem
              question="How are fare estimates calculated?"
              answer="Fare estimates use our ML model trained on Amritsar trip data, with category multipliers for Bike, Auto, Mini, Sedan, and SUV. These are demo estimates only."
            />
            <FAQItem
              question="Can I book a ride right now?"
              answer="Yes. Select your pickup and destination, choose a ride category, and confirm your booking. Bookings are stored in our local database."
            />
            <FAQItem
              question="Are the locations real?"
              answer="Yes. All locations and coordinates come from our Amritsar dataset. We never use fake coordinates."
            />
            <FAQItem
              question="Can I view my trip history?"
              answer="Yes. Your ride history is available in the History section, showing past bookings with fares and status."
            />
            <FAQItem
              question="Is this a real ride-hailing service?"
              answer="No. RideSetGo is a demonstration project. It does not connect to real drivers, provide live tracking, or process real payments."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

