import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { categoryService } from "@/services/api";
import { LoadingSpinner, ErrorAlert } from "@/components/common";
import { Car, Bike, Truck, Bus, ArrowRight, Clock, MapPin } from "lucide-react";

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

export default function RideOptionsPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const res = await categoryService.list();
      setCategories(res.data);
    } catch (err: any) {
      setError("Ride categories load nahi ho paaein.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rsgo-50">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-rsgo-50">
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-rsgo-900">Ride Options</h1>
            <p className="text-rsgo-600">Choose your ride category</p>
          </div>
          <button
            onClick={() => navigate("/home")}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-rsgo-600 hover:bg-gray-50 rounded-xl transition-colors border border-gray-200"
          >
            <ArrowRight className="w-4 h-4" /> Back to Home
          </button>
        </div>

        {error && <ErrorAlert message={error} />}

        <div className="space-y-4">
          {categories.map((cat) => {
            const Icon = ICON_MAP[cat.name] || Car;
            return (
              <div
                key={cat.name}
                className="card p-5 flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-7 h-7 text-rose-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-rsgo-900">
                      {cat.display_name}
                    </h3>
                    <span className="text-xs font-medium bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                      Demo
                    </span>
                  </div>
                  <p className="text-sm text-rsgo-600">
                    {CATEGORY_DESCRIPTIONS[cat.name] || "Ride category for Amritsar."}
                  </p>
                  <div className="mt-3 flex items-center gap-4 text-sm text-rsgo-500">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{CATEGORY_CAPACITY[cat.name] || "Multiple passengers"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Min fare ₹{cat.min_fare}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-rsgo-900">
                    ₹{cat.min_fare}
                  </span>
                  <span className="text-xs text-rsgo-500">min fare</span>
                  <button
                    onClick={() => navigate("/home")}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 transition-colors"
                  >
                    Select <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 card p-8">
          <h3 className="font-bold text-rsgo-900 mb-4">Important Notes</h3>
          <ul className="space-y-3 text-sm text-rsgo-600 list-disc list-inside">
            <li>These are demo ride categories — no live driver availability.</li>
            <li>Fare multipliers are heuristic, not per-category trained models.</li>
            <li>Minimum fares shown are baseline estimates only.</li>
            <li>Actual fares are calculated using the ML model on route distance.</li>
            <li>Not affiliated with Uber, Ola, or Rapido.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

