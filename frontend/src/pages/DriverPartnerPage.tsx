import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { rideService } from "@/services/api";
import type { Ride } from "@/types";
import { LoadingSpinner } from "@/components/common";

export default function DriverPartnerPage() {
  const user = useAuthStore((s) => s.user);
  const [available, setAvailable] = useState<Ride[]>([]);
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  const load = async () => {
    try {
      setError(null);
      const [a, m] = await Promise.all([rideService.available(), rideService.list()]);
      setAvailable(a.data);
      setMyRides(m.data.filter(() => true));
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  const accept = async (id: number) => {
    setActing(id);
    try {
      await rideService.accept(id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Accept failed");
    } finally {
      setActing(null);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    setActing(id);
    try {
      await rideService.updateStatus(id, status);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Update failed");
    } finally {
      setActing(null);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Driver Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Signed in as {user?.full_name} ({user?.role})</p>
      {error && <div className="mb-4 text-red-600">{error}</div>}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Incoming requests</h2>
        {available.length === 0 ? <p className="text-gray-500">No requests.</p> : (
          <ul className="space-y-3">
            {available.map((r) => (
              <li key={r.id} className="border rounded p-4">
                <div className="font-medium">#{r.id} {r.pickup_location} → {r.dropoff_location}</div>
                <div className="text-sm text-gray-500">{r.category} • {r.final_fare} {r.currency} • {r.status}</div>
                <button disabled={acting === r.id} onClick={() => accept(r.id)} className="mt-2 px-3 py-1 bg-black text-white rounded">Accept</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-xl font-semibold mb-3">My rides</h2>
        {myRides.length === 0 ? <p className="text-gray-500">No rides.</p> : (
          <ul className="space-y-3">
            {myRides.map((r) => (
              <li key={r.id} className="border rounded p-4">
                <div className="font-medium">#{r.id} {r.pickup_location} → {r.dropoff_location}</div>
                <div className="text-sm text-gray-500">{r.category} • {r.final_fare} {r.currency} • {r.status}</div>
                {r.status === "accepted" && <button disabled={acting===r.id} onClick={()=>updateStatus(r.id,"started")} className="mt-2 px-3 py-1 bg-blue-600 text-white rounded mr-2">Start</button>}
                {r.status === "started" && <button disabled={acting===r.id} onClick={()=>updateStatus(r.id,"completed")} className="mt-2 px-3 py-1 bg-green-600 text-white rounded">Complete</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}