import { useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";
import { useData } from "@/hooks/useData";

interface DashboardData {
  totalReports: number;
  completed: number;
  inProgress: number;
  pending: number;
  totalAssets: number;
  totalTechnicians: number;
  recent: Array<{
    id: string;
    report_number: string | null;
    status: string;
    service_type: string;
    created_at: string;
    assets: { name: string; location: string } | null;
    profiles: { full_name: string } | null;
  }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft:             { label: "Borrador",    color: "bg-slate-100 text-slate-600",    dot: "#94a3b8" },
  in_progress:       { label: "En proceso",  color: "bg-blue-50 text-blue-700",       dot: "#3b82f6" },
  pending_signature: { label: "Pend. firma", color: "bg-amber-50 text-amber-700",     dot: "#f59e0b" },
  completed:         { label: "Completado",  color: "bg-emerald-50 text-emerald-700", dot: "#10b981" },
  cancelled:         { label: "Cancelado",   color: "bg-red-50 text-red-600",         dot: "#ef4444" },
};

const SERVICE_ICONS: Record<string, string> = {
  preventive: "🔧", corrective: "🚨", predictive: "📊", installation: "⚙️",
};

export default function OwnerDashboard() {
  const { user } = useAuthStore();

  const fetcher = useCallback(async (): Promise<DashboardData> => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [reportsRes, assetsRes, techRes, recentRes] = await Promise.all([
      supabase
        .from("service_reports")
        .select("status")
        .eq("tenant_id", user!.tenant.id)
        .gte("created_at", thirtyDaysAgo),
      supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", user!.tenant.id),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", user!.tenant.id)
        .eq("role", "technician")
        .eq("is_active", true),
      supabase
        .from("service_reports")
        .select(`
          id, report_number, status, service_type, created_at,
          assets (name, location),
          profiles (full_name)
        `)
        .eq("tenant_id", user!.tenant.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reports: any[] = reportsRes.data ?? [];
    return {
      totalReports:    reports.length,
      completed:       reports.filter(r => r.status === "completed").length,
      inProgress:      reports.filter(r => r.status === "in_progress").length,
      pending:         reports.filter(r => r.status === "pending_signature").length,
      totalAssets:     assetsRes.count ?? 0,
      totalTechnicians: techRes.count ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent:          (recentRes.data ?? []) as any[],
    };
  }, [user]);

  const { data, loading } = useData(fetcher);

  const completionRate = data && data.totalReports > 0
    ? Math.round((data.completed / data.totalReports) * 100)
    : 0;

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-6 max-w-screen-xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Bienvenido, {user?.profile.full_name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}{user?.tenant.name}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[
            { label: "Reportes (30d)", value: loading ? "—" : data?.totalReports,    icon: "📋", color: "bg-blue-50",    text: "text-blue-700"    },
            { label: "En Proceso",     value: loading ? "—" : data?.inProgress,      icon: "🔧", color: "bg-indigo-50",  text: "text-indigo-700"  },
            { label: "Pend. Firma",    value: loading ? "—" : data?.pending,         icon: "✍️", color: "bg-amber-50",   text: "text-amber-700"   },
            { label: "Completados",    value: loading ? "—" : data?.completed,       icon: "✅", color: "bg-emerald-50", text: "text-emerald-700" },
            { label: "Activos/Equip.", value: loading ? "—" : data?.totalAssets,     icon: "⚙️", color: "bg-slate-50",   text: "text-slate-700"   },
            { label: "Técnicos Act.",  value: loading ? "—" : data?.totalTechnicians,icon: "👷", color: "bg-purple-50",  text: "text-purple-700"  },
          ].map(k => (
            <div key={k.label} className={`${k.color} rounded-2xl p-4 border border-slate-100`}>
              <span className="text-xl block mb-2">{k.icon}</span>
              <p className={`text-2xl font-bold ${k.text}`}>{k.value ?? 0}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Tasa de completitud */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Tasa de Completitud — últimos 30 días</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {data?.completed ?? 0} cerrados de {data?.totalReports ?? 0} reportes
              </p>
            </div>
            <span className="text-2xl font-bold text-slate-800">{completionRate}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${completionRate}%`, background: "linear-gradient(90deg,#3b82f6,#10b981)" }}
            />
          </div>
        </div>

        {/* Accesos rápidos */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { to: "/owner/reports",      icon: "📋", label: "Ver Reportes",   sub: "Tabla completa",       color: "#2563eb" },
            { to: "/owner/assets",       icon: "⚙️", label: "Activos",        sub: "Gestionar equipos",    color: "#7c3aed" },
            { to: "/owner/technicians",  icon: "👷", label: "Técnicos",       sub: "Ver equipo",           color: "#0891b2" },
            { to: "/owner/analytics",    icon: "📊", label: "Analíticas",     sub: "Métricas y tendencias",color: "#059669" },
          ].map(item => (
            <Link
              key={item.to}
              to={item.to}
              className="card p-4 hover:shadow-md transition-all group flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: `${item.color}18` }}>
                {item.icon}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">
                  {item.label}
                </p>
                <p className="text-xs text-slate-400 truncate">{item.sub}</p>
              </div>
              <span className="ml-auto text-slate-300 group-hover:text-blue-400 transition-colors">›</span>
            </Link>
          ))}
        </div>

        {/* Actividad reciente */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Actividad Reciente</h3>
            <Link to="/owner/reports" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Ver todos →
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 gap-3 text-slate-400">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Cargando...</span>
            </div>
          ) : !data?.recent.length ? (
            <div className="text-center py-10 text-slate-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm">Sin reportes recientes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.recent.map(r => {
                const status = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.draft;
                // Supabase devuelve joins como arrays en algunos casos
                const asset   = Array.isArray(r.assets)   ? r.assets[0]   : r.assets;
                const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
                return (
                  <Link
                    key={r.id}
                    to={`/owner/reports/${r.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-base flex-shrink-0 border border-slate-100">
                      {SERVICE_ICONS[r.service_type] ?? "🔧"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {asset?.name ?? "—"}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {profile?.full_name ?? "—"} · {asset?.location ?? ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`badge ${status.color} flex items-center gap-1`}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
                        {status.label}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(r.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
