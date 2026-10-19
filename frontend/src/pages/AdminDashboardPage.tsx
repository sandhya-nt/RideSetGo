import { useEffect, useState } from "react";
import { adminService, getApiError } from "@/services/api";
import { RetryableError } from "@/components/common";
import { Activity, Database, Server, ShieldAlert } from "lucide-react";
import type { SystemHealth } from "@/types";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | undefined>(undefined);

  // Operational visibility (Phase 19). Loaded separately from the business
  // data so a failure in one does not hide the other.
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthReference, setHealthReference] = useState<string | undefined>(undefined);
  const [healthLoading, setHealthLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    setReference(undefined);
    try {
      const [s, r] = await Promise.all([adminService.stats(), adminService.rides()]);
      setStats(s.data);
      setRides(r.data);
    } catch (e: unknown) {
      const normalized = getApiError(e);
      setError(normalized.message);
      setReference(normalized.requestId);
    } finally {
      setLoading(false);
    }
  };

  const loadHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    setHealthReference(undefined);
    try {
      const res = await adminService.systemHealth();
      setHealth(res.data);
    } catch (e: unknown) {
      const normalized = getApiError(e);
      setHealthError(normalized.message);
      setHealthReference(normalized.requestId);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadHealth(); }, []);

  if (loading) return <div className="p-8">Loading...</div>;
  if (error)
    return (
      <div className="p-8">
        <RetryableError
          message={error}
          reference={reference}
          onRetry={() => void load()}
        />
      </div>
    );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Admin Operations Dashboard</h1>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-white rounded shadow"><div className="text-sm text-gray-500">Total Users</div><div className="text-xl font-bold">{stats.total_users}</div></div>
          <div className="p-4 bg-white rounded shadow"><div className="text-sm text-gray-500">Total Rides</div><div className="text-xl font-bold">{stats.total_rides}</div></div>
          <div className="p-4 bg-white rounded shadow"><div className="text-sm text-gray-500">Revenue (INR)</div><div className="text-xl font-bold">{stats.total_revenue_inr}</div></div>
          <div className="p-4 bg-white rounded shadow"><div className="text-sm text-gray-500">By Status</div><pre className="text-xs">{JSON.stringify(stats.rides_by_status)}</pre></div>
        </div>
      )}

      {/* ---------- System health (live backend measurements) ---------- */}
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Activity className="w-5 h-5 text-rsgo-600" />
        System Health
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        Live measurements reported by the running backend. Values reset when
        the backend restarts. No user data, credentials or log content is
        shown here.
      </p>

      {healthLoading ? (
        <div className="p-4 bg-white rounded shadow text-sm text-gray-500">
          Checking backend status…
        </div>
      ) : healthError ? (
        <RetryableError
          message={healthError}
          reference={healthReference}
          onRetry={() => void loadHealth()}
          className="mb-6"
        />
      ) : health ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-white rounded shadow">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <Server className="w-4 h-4" /> API availability
            </div>
            <div className="text-xl font-bold capitalize">{health.service.status}</div>
            <dl className="mt-2 text-xs text-gray-500 space-y-1">
              <div className="flex justify-between">
                <dt>Version</dt>
                <dd className="text-gray-700">{health.service.version}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Uptime</dt>
                <dd className="text-gray-700">
                  {Math.round(health.service.uptime_seconds)}s
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Requests handled</dt>
                <dd className="text-gray-700">{health.requests.total}</dd>
              </div>
              <div className="flex justify-between">
                <dt>5xx error rate</dt>
                <dd className="text-gray-700">
                  {health.requests.error_rate_5xx_percent}%
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>4xx error rate</dt>
                <dd className="text-gray-700">
                  {health.requests.error_rate_4xx_percent}%
                </dd>
              </div>
            </dl>
          </div>

          <div className="p-4 bg-white rounded shadow">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <Database className="w-4 h-4" /> Database readiness
            </div>
            <div
              className={`text-xl font-bold ${
                health.database.ready ? "text-green-600" : "text-red-600"
              }`}
            >
              {health.database.ready ? "Ready" : "Unavailable"}
            </div>
            <dl className="mt-2 text-xs text-gray-500 space-y-1">
              <div className="flex justify-between">
                <dt>Probe latency</dt>
                <dd className="text-gray-700">
                  {health.database.latency_ms} ms
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Connection failures</dt>
                <dd className="text-gray-700">
                  {health.database.failures_total}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Last health check</dt>
                <dd className="text-gray-700">
                  {health.health_checks.last
                    ? `${health.health_checks.last.status} (${health.health_checks.last.checked_at})`
                    : "not run yet"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Health checks</dt>
                <dd className="text-gray-700">
                  {health.health_checks.ok} ok / {health.health_checks.failed} failed
                </dd>
              </div>
            </dl>
          </div>

          <div className="p-4 bg-white rounded shadow">
            <div className="text-sm text-gray-500 mb-2">API latency (ms)</div>
            <dl className="text-xs text-gray-500 space-y-1">
              <div className="flex justify-between">
                <dt>p50</dt>
                <dd className="text-gray-700">{health.latency_ms.p50 ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>p95</dt>
                <dd className="text-gray-700">{health.latency_ms.p95 ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>p99</dt>
                <dd className="text-gray-700">{health.latency_ms.p99 ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>max</dt>
                <dd className="text-gray-700">{health.latency_ms.max ?? "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="p-4 bg-white rounded shadow">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <ShieldAlert className="w-4 h-4" /> Recent errors
            </div>
            <dl className="text-xs text-gray-500 space-y-1">
              <div className="flex justify-between">
                <dt>Unhandled exceptions</dt>
                <dd className="text-gray-700">
                  {health.errors.unhandled_exceptions}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Client errors reported</dt>
                <dd className="text-gray-700">
                  {health.errors.client_errors_reported}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>External failures</dt>
                <dd className="text-gray-700">
                  {Object.keys(health.errors.external_failures ?? {}).length === 0
                    ? "none"
                    : Object.entries(health.errors.external_failures)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")}
                </dd>
              </div>
            </dl>
            <button
              onClick={() => void loadHealth()}
              className="mt-3 text-xs text-rsgo-600 underline"
            >
              Refresh
            </button>
          </div>
        </div>
      ) : null}

      <h2 className="text-lg font-semibold mb-2">Recent Rides</h2>
      {rides.length === 0 ? <div className="text-gray-500">No rides.</div> : (
        <table className="w-full text-sm bg-white rounded shadow">
          <thead><tr><th>ID</th><th>Pickup</th><th>Dropoff</th><th>Status</th><th>Fare</th></tr></thead>
          <tbody>
            {rides.map((r) => (
              <tr key={r.id} className="border-t">
                <td>{r.id}</td><td>{r.pickup_location}</td><td>{r.dropoff_location}</td><td>{r.status}</td><td>{r.final_fare}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
