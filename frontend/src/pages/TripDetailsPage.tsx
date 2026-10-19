import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { rideService } from "@/services/api";
import { ErrorAlert, LoadingSpinner } from "@/components/common";
import { ArrowLeft, MapPin, Calendar, Clock, Car, IndianRupee, Receipt, Printer, Navigation, Star } from "lucide-react";
import type { Ride, Payment } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  accepted: "Accepted",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function TripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rideId = id ? parseInt(id) : 0;

  const [ride, setRide] = useState<Ride | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingMsg, setRatingMsg] = useState("");
  const [existingRating, setExistingRating] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (rideId > 0) {
      loadRideDetails();
    }
  }, [rideId]);

  const loadRideDetails = async () => {
    setLoading(true);
    setError("");
    try {
      const [rideRes, paymentRes] = await Promise.allSettled([
        rideService.get(rideId),
        rideService.payment(rideId),
      ]);
      if (rideRes.status === "fulfilled") {
        setRide(rideRes.value.data);
      }
      if (paymentRes.status === "fulfilled") {
        setPayment(paymentRes.value.data);
      }
    } catch (err: any) {
      setError("Ride details load nahi ho paaya. Kripaya baad mein koshish karein.");
    } finally {
      setLoading(false);
    }
  };

  const submitRating = async () => {
    if (ratingScore < 1) { setRatingMsg("Please select a rating."); return; }
    setRatingSubmitting(true);
    setRatingMsg("");
    try {
      const res = await rideService.rate(rideId, { score: ratingScore, comment: ratingComment || undefined });
      setExistingRating(res.data);
      setRatingMsg("Rating submitted. Thank you!");
    } catch (err: any) {
      setRatingMsg(err?.response?.data?.detail || "Failed to submit rating.");
    } finally {
      setRatingSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !ride) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <div className="px-4 py-6 border-b border-gray-100">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-700">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back</span>
          </button>
        </div>
        <div className="flex-1 px-4 py-8">
          <ErrorAlert message={error || "Ride not found"} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="sticky top-0 bg-white z-10 px-4 py-4 border-b border-gray-100 md:px-6 lg:px-8">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back</span>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Trip Details</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full md:px-6 lg:px-8">
        <div className="mb-6">
          <span className="inline-block px-3 py-1 rounded-full text-sm font-medium">
            {STATUS_LABELS[ride.status] || ride.status}
          </span>
          <p className="text-sm text-gray-500 mt-2">Booking Reference: #{ride.id}</p>
        </div>

        <div className="space-y-6">
          <div className="border border-gray-100 rounded-xl p-4 md:p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Navigation className="w-5 h-5 text-rsgo-600" />
              <h2 className="text-lg font-semibold text-gray-900">Route Details</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-500">Pickup</p>
                  <p className="text-base font-medium text-gray-900 break-words">{ride.pickup_location}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-500">Dropoff</p>
                  <p className="text-base font-medium text-gray-900 break-words">{ride.dropoff_location}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl p-4 md:p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Trip Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Date & Time</p>
                  <p className="text-base font-medium text-gray-900">
                    {new Date(ride.created_at).toLocaleString("en-IN", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Car className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Ride Category</p>
                  <p className="text-base font-medium text-gray-900">{ride.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Distance</p>
                  <p className="text-base font-medium text-gray-900">{ride.distance_km.toFixed(1)} km</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <IndianRupee className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Passengers</p>
                  <p className="text-base font-medium text-gray-900">{ride.passenger_count}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl p-4 md:p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Fare Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2">
                <p className="text-sm text-gray-600">Base Fare</p>
                <p className="text-sm font-medium text-gray-900">?{ride.base_fare.toLocaleString("en-IN")}</p>
              </div>
              <div className="flex justify-between items-center py-2 border-t border-gray-100">
                <p className="text-base font-semibold text-gray-900">Total Fare</p>
                <p className="text-lg font-bold text-gray-900">?{ride.final_fare.toLocaleString("en-IN")}</p>
              </div>
              {payment && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500">Payment Method: {payment.method}</p>
                  <p className="text-sm text-gray-500">Payment Status: {payment.status}</p>
                  {payment.transaction_id && (
                    <p className="text-sm text-gray-500 mt-1">Transaction ID: {payment.transaction_id}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {ride.status === "completed" && (
            <div className="border border-gray-100 rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Rate this trip</h2>
              {existingRating ? (
                <div>
                  <div className="flex gap-1 mb-2">
                    {[1,2,3,4,5].map(n => (
                      <Star key={n} className={`w-5 h-5 ${n <= existingRating.score ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                    ))}
                  </div>
                  {existingRating.comment && <p className="text-sm text-gray-700">{existingRating.comment}</p>}
                  <p className="text-xs text-gray-500 mt-2">Already rated.</p>
                </div>
              ) : (
                <div>
                  <div className="flex gap-1 mb-3">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setRatingScore(n)} type="button">
                        <Star className={`w-7 h-7 ${n <= ratingScore ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={ratingComment}
                    onChange={e => setRatingComment(e.target.value)}
                    placeholder="Optional review..."
                    className="w-full border border-gray-200 rounded-lg p-2 text-sm mb-3"
                    rows={3}
                  />
                  <button onClick={submitRating} disabled={ratingSubmitting} className="btn-primary px-4 py-2">
                    {ratingSubmitting ? "Submitting..." : "Submit Rating"}
                  </button>
                  {ratingMsg && <p className="text-sm mt-2 text-gray-600">{ratingMsg}</p>}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate(`/trips/${ride.id}/track`)}
              className="btn-outline flex items-center justify-center gap-2 px-4 py-2"
            >
              <Navigation className="w-4 h-4" />
              Track Ride
            </button>
            <button
              onClick={() => navigate(`/trips/${ride.id}/receipt`)}
              className="btn-secondary flex items-center justify-center gap-2 px-4 py-2"
            >
              <Receipt className="w-4 h-4" />
              View Receipt
            </button>
            <button
              onClick={() => window.print()}
              className="btn-primary flex items-center justify-center gap-2 px-4 py-2"
            >
              <Printer className="w-4 h-4" />
              Print Details
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
