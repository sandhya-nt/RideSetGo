import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getApiError, rideService } from "@/services/api";
import { EmptyState, RetryableError } from "@/components/common";
import { Clock, MapPin, Navigation, Search, ArrowLeft, Printer, Download, Receipt as ReceiptIcon } from "lucide-react";
import type { Ride, Payment } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  accepted: "Accepted",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  requested: "text-amber-600 bg-amber-50",
  accepted: "text-blue-600 bg-blue-50",
  started: "text-blue-600 bg-blue-50",
  completed: "text-green-600 bg-green-50",
  cancelled: "text-red-600 bg-red-50",
};

type FilterKey = "upcoming" | "completed" | "cancelled";

const UPCOMING = new Set(["requested", "accepted", "started"]);

export default function HistoryPage() {
  const navigate = useNavigate();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorReference, setErrorReference] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<FilterKey>("upcoming");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Ride | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [view, setView] = useState<"list" | "details" | "receipt">("list");

  const loadRides = async () => {
    setLoading(true);
    setError("");
    setErrorReference(undefined);
    try {
      const res = await rideService.list();
      setRides(res.data || []);
    } catch (err: unknown) {
      // Normalised error: no stack trace, and the request id is kept so the
      // user can quote it in a support request.
      const normalized = getApiError(err);
      setError(normalized.message);
      setErrorReference(normalized.requestId);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRides();
  }, []);

  const filtered = useMemo(() => {
    let base = rides;
    if (filter === "upcoming") base = base.filter((r) => UPCOMING.has(r.status));
    else if (filter === "completed") base = base.filter((r) => r.status === "completed");
    else if (filter === "cancelled") base = base.filter((r) => r.status === "cancelled");

    const q = query.trim().toLowerCase();
    if (q) {
      base = base.filter(
        (r) =>
          r.pickup_location.toLowerCase().includes(q) ||
          r.dropoff_location.toLowerCase().includes(q) ||
          String(r.id).includes(q)
      );
    }
    return base;
  }, [rides, filter, query]);

  const openDetails = async (ride: Ride) => {
    setSelected(ride);
    setPayment(null);
    setView("details");
    try {
      const res = await rideService.payment(ride.id);
      setPayment(res.data);
    } catch {
      // payment may not exist; ignore
    }
  };

  const downloadReceipt = () => {
    const content = document.getElementById("receipt-printable");
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write("<html><head><title>Receipt</title></head><body>");
    w.document.write(content.innerHTML);
    w.document.write("</body></html>");
    w.document.close();
    w.focus();
    w.print();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-rsgo-50 px-4 py-8 max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 h-24 animate-pulse bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (view === "details" && selected) {
    return (
      <div className="flex min-h-screen flex-col bg-rsgo-50">
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto w-full">
          <button onClick={() => setView("list")} className="flex items-center gap-2 text-rsgo-600 mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to history
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Trip Details</h1>
          <div className="card p-6 space-y-3">
            <Row label="Booking Ref" value={`#${selected.id}`} />
            <Row label="Pickup" value={selected.pickup_location} />
            <Row label="Destination" value={selected.dropoff_location} />
            <Row label="Ride Category" value={selected.category} />
            <Row label="Passengers" value={String(selected.passenger_count)} />
            <Row label="Distance" value={`${selected.distance_km} km`} />
            <Row label="Date/Time" value={new Date(selected.created_at).toLocaleString("en-IN")} />
            <Row label="Status" value={STATUS_LABELS[selected.status] || selected.status} />
            <Row label="Fare (INR)" value={`₹${selected.final_fare.toLocaleString("en-IN")}`} />
            {payment && (
              <>
                <Row label="Payment Method" value={payment.method} />
                <Row label="Payment Status" value={payment.status} />
                {payment.transaction_id && <Row label="Transaction ID" value={payment.transaction_id} />}
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={() => navigate(`/trips/${selected.id}/track`)}
              className="btn-outline flex items-center gap-2"
            >
              <Navigation className="w-4 h-4" /> Track Ride
            </button>
            <button onClick={() => setView("receipt")} className="btn-primary flex items-center gap-2">
              <ReceiptIcon className="w-4 h-4" /> View Receipt
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "receipt" && selected) {
    return (
      <div className="flex min-h-screen flex-col bg-rsgo-50">
        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto w-full">
          <button onClick={() => setView("details")} className="flex items-center gap-2 text-rsgo-600 mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to details
          </button>
          <div id="receipt-printable" className="bg-white p-8 rounded-lg shadow print:shadow-none">
            <h2 className="text-xl font-bold text-center mb-2">RideSetGo Receipt</h2>
            <p className="text-center text-sm text-gray-500 mb-6">Booking #{selected.id}</p>
            <div className="space-y-2 text-sm">
              <Row label="Pickup" value={selected.pickup_location} />
              <Row label="Destination" value={selected.dropoff_location} />
              <Row label="Category" value={selected.category} />
              <Row label="Date/Time" value={new Date(selected.created_at).toLocaleString("en-IN")} />
              <Row label="Status" value={STATUS_LABELS[selected.status] || selected.status} />
              <Row label="Fare (INR)" value={`₹${selected.final_fare.toLocaleString("en-IN")}`} />
              {payment && <Row label="Payment" value={`${payment.method} — ${payment.status}`} />}
            </div>
            <p className="text-center text-xs text-gray-400 mt-6">Thank you for riding with RideSetGo.</p>
          </div>
          <div className="flex gap-3 mt-6 print:hidden">
            <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={downloadReceipt} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" /> Download
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-rsgo-50">
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Trip History</h1>
            <p className="text-gray-500">Your past and current rides</p>
          </div>
        </div>

        {error && (
          <div className="mb-4">
            <RetryableError
              message={error}
              reference={errorReference}
              onRetry={() => void loadRides()}
              retrying={loading}
            />
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex gap-2">
            {(["upcoming", "completed", "cancelled"] as FilterKey[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  filter === f ? "bg-rsgo-600 text-white" : "bg-white text-gray-700 border"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pickup, destination or booking ref"
              className="input-field pl-9 w-full"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Clock className="w-12 h-12 text-gray-400" />}
            title="No trips found"
            description="Try changing filters or search terms."
            action={
              <button onClick={() => navigate("/home")} className="btn-primary">
                Book a Ride
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((ride) => (
              <button
                key={ride.id}
                onClick={() => openDetails(ride)}
                className="card p-4 w-full text-left flex items-center justify-between gap-4 hover:shadow-md transition"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-rsgo-50 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-rsgo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{ride.pickup_location}</p>
                    <p className="text-xs text-gray-500 truncate">{ride.dropoff_location}</p>
                    <p className="text-xs text-gray-400 mt-1">{ride.category} • {new Date(ride.created_at).toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">₹{ride.final_fare.toLocaleString("en-IN")}</p>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[ride.status] || "text-gray-600 bg-gray-50"}`}>
                    {STATUS_LABELS[ride.status] || ride.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 text-sm font-medium text-right">{value}</span>
    </div>
  );
}
