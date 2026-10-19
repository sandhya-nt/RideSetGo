import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { rideService } from "@/services/api";
import { ErrorAlert, LoadingSpinner } from "@/components/common";
import { ArrowLeft, Printer } from "lucide-react";
import type { Ride, Payment } from "@/types";
import { Logo } from "@/components/Logo";

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  accepted: "Accepted",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rideId = id ? parseInt(id) : 0;

  const [ride, setRide] = useState<Ride | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (rideId > 0) {
      loadReceipt();
    }
  }, [rideId]);

  const loadReceipt = async () => {
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
      setError("Receipt load nahi ho paaya. Kripaya baad mein koshish karein.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
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
      <div className="sticky top-0 bg-white z-10 px-4 py-4 border-b border-gray-100 print:hidden md:px-6 lg:px-8">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back</span>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Receipt</h1>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-2 px-3 py-1.5 text-sm" title="Print">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
        <div className="border border-gray-100 rounded-xl shadow-sm p-6 md:p-8 bg-white print:border-none print:shadow-none">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Logo size={40} />
              <div>
                <h1 className="text-xl font-bold text-gray-900">RideSetGo</h1>
                <p className="text-sm text-gray-500">Amritsar Ride Booking</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-gray-900">RECEIPT</p>
              <p className="text-sm text-gray-500">#{ride.id}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <p className="text-sm text-gray-500 mb-1">Booking Date</p>
              <p className="text-base font-medium text-gray-900">
                {new Date(ride.created_at).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Trip Status</p>
              <p className="text-base font-medium text-gray-900">{STATUS_LABELS[ride.status] || ride.status}</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6 mb-6">
            <p className="text-sm font-semibold text-gray-900 mb-4">Trip Details</p>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">From</p>
                <p className="text-base text-gray-900 break-words">{ride.pickup_location}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">To</p>
                <p className="text-base text-gray-900 break-words">{ride.dropoff_location}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-sm text-gray-500">Category</p>
                  <p className="text-base text-gray-900">{ride.category}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Distance</p>
                  <p className="text-base text-gray-900">{ride.distance_km.toFixed(1)} km</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Passengers</p>
                  <p className="text-base text-gray-900">{ride.passenger_count}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6 mb-6">
            <p className="text-sm font-semibold text-gray-900 mb-4">Fare Breakdown</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Base Fare</p>
                <p className="text-sm text-gray-900">?{ride.base_fare.toLocaleString("en-IN")}</p>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-100 mt-2">
                <p className="text-base font-semibold text-gray-900">Total Amount</p>
                <p className="text-lg font-bold text-gray-900">?{ride.final_fare.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </div>

          {payment && (
            <div className="border-t border-gray-100 pt-6">
              <p className="text-sm font-semibold text-gray-900 mb-4">Payment Information</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Payment Method</p>
                  <p className="text-base text-gray-900">{payment.method}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Payment Status</p>
                  <p className="text-base text-gray-900">{payment.status}</p>
                </div>
                {payment.transaction_id && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Transaction ID</p>
                    <p className="text-base text-gray-900 font-mono text-sm">{payment.transaction_id}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-500">Thank you for choosing RideSetGo</p>
            <p className="text-xs text-gray-500 mt-1">Amritsar, India</p>
          </div>
        </div>
      </div>
    </div>
  );
}
