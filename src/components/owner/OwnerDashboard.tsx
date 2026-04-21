import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";
import type { ServiceReport } from "@/types/database";
import { generateReportPDF } from "@/lib/pdfGenerator";

type FilterStatus = "all" | "draft" | "in_progress" | "completed" | "cancelled";

// Supabase devuelve joins como arrays; definimos el tipo real de la respuesta
interface ReportRow {
  id: string;
  report_number: string | null;
  status: string;
  service_type: string;
  priority: string;
  created_at: string;
  assets: { id: string; name: string; location: string; category: string | null } | null;
  profiles: { id: string; full_name: string } | null;
  report_details: Array<{
    started_at: string | null;
    finished_at: string | null;
    supplies: Array<{ cost?: number; qty: number }>;
    client_name: string | null;
    client_signature: string | null;
    photos: Record<string, string[]>;
  }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft:             { label: "Borrador",     color: "bg-slate-100 text-slate-600",   dot: "#94a3b8" },
  in_progress:       { label: "En proceso",   color: "bg-blue-50 text-blue-700",      dot: "#3b82f6" },
  pending_signature: { label: "Pend. firma",  color: "bg-amber-50 text-amber-700",    dot: "#f59e0b" },
  completed:         { label: "Completado",   color: "bg-emerald-50 text-emerald-700",dot: "#10b981" },
  cancelled:         { label: "Cancelado",    color: "bg-red-50 text-red-600",        dot: "#ef4444" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:      { label: "Baja",     color: "text-slate-400" },
  normal:   { label: "Normal",   color: "text-blue-500"  },
  high:     { label: "Alta",     color: "text-amber-500" },
  critical: { label: "Crítica",  color: "text-red-500"   },
};

const SERVICE_LABELS: Record<string, string> = {
  preventive: "Preventivo", corrective: "Correctivo",
  predictive: "Predictivo", installation: "Instalación",
};

export default function OwnerDashboard() {
  const { user } = useAuthStore();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [exportingPdf, setExportingPdf] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Default: últimos 90 días para que siempre haya datos visibles
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const loadReports = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("service_reports")
      .select(`
        id, report_number, status, service_type, priority, created_at,
        assets (id, name, location, category),
        profiles (id, full_name),
        report_details (started_at, finished_at, supplies, client_name, client_signature, photos)
      `)
      .eq("tenant_id", user.tenant.id)
      .gte("created_at", `${dateRange.from}T00:00:00`)
      .lte("created_at", `${dateRange.to}T23:59:59`)
      .order("created_at", { ascending: false });

    if (filterStatus !== "all") q = q.eq("status", filterStatus);

    const { data, error } = await q;
    if (error) {
      console.error("Error cargando reportes:", error);
      setQueryError(error.message);
    } else {
      setQueryError(null);
      setReports((data ?? []) as unknown as ReportRow[]);
    }
    setLoading(false);
  }, [user, filterStatus, dateRange]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const filtered = reports.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.report_number?.toLowerCase().includes(q) ||
      r.assets?.name.toLowerCase().includes(q) ||
      r.profiles?.full_name.toLowerCase().includes(q)
    );
  });

  // Helper: obtiene el primer detalle del reporte (Supabase devuelve array)
  const getDetail = (r: ReportRow) => r.report_details?.[0] ?? null;

  // Stats
  const stats = {
    total:      reports.length,
    completed:  reports.filter(r => r.status === "completed").length,
    inProgress: reports.filter(r => r.status === "in_progress").length,
    pending:    reports.filter(r => r.status === "pending_signature").length,
  };

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const handleExportPDF = async (report: ReportRow) => {
    setExportingPdf(report.id);
    try { await generateReportPDF(report as unknown as ServiceReport, user!.tenant); }
    catch (e) { console.error(e); }
    finally { setExportingPdf(null); }
  };

  const handleExportCSV = () => {
    setExportingCsv(true);
    const rows = filtered.map(r => ({
      Folio: r.report_number ?? "",
      Activo: r.assets?.name ?? "",
      Ubicacion: r.assets?.location ?? "",
      Tecnico: r.profiles?.full_name ?? "",
      Tipo: SERVICE_LABELS[r.service_type] ?? "",
      Prioridad: r.priority,
      Estado: r.status,
      Fecha: new Date(r.created_at).toLocaleDateString("es-MX"),
      Duracion_min: (() => { const d = r.report_details?.[0]; return d?.started_at && d?.finished_at ? Math.round((new Date(d.finished_at).getTime() - new Date(d.started_at).getTime()) / 60000) : ""; })(),
    }));
    const headers = Object.keys(rows[0] ?? {});
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${(r as Record<string,unknown>)[h] ?? ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `reportes-${dateRange.from}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExportingCsv(false);
  };

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)));

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-6 max-w-screen-2xl mx-auto">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportCSV} disabled={exportingCsv || filtered.length === 0} className="btn-secondary flex items-center gap-2">
              <span>⬇</span> Exportar CSV
            </button>
          </div>
        </div>

        {/* Error banner */}
        {queryError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-start gap-3">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="font-semibold">Error al cargar reportes</p>
              <p className="text-xs mt-0.5 font-mono">{queryError}</p>
              <button onClick={loadReports} className="mt-2 text-xs underline">Reintentar</button>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Reportes"
            value={stats.total}
            sub={`Período: ${dateRange.from} → ${dateRange.to}`}
            icon="📋"
            iconBg="bg-blue-50"
            trend={null}
          />
          <StatCard
            title="Completados"
            value={stats.completed}
            sub={`${completionRate}% tasa de cierre`}
            icon="✅"
            iconBg="bg-emerald-50"
            trend={completionRate}
          />
          <StatCard
            title="En Proceso"
            value={stats.inProgress}
            sub="Servicios activos"
            icon="🔧"
            iconBg="bg-blue-50"
            trend={null}
          />
          <StatCard
            title="Pend. Firma"
            value={stats.pending}
            sub="Requieren atención"
            icon="✍️"
            iconBg="bg-amber-50"
            trend={null}
          />
        </div>

        {/* Barra de progreso de cierre */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Tasa de Completitud</h3>
              <p className="text-xs text-slate-400 mt-0.5">Reportes cerrados vs total en el período</p>
            </div>
            <span className="text-2xl font-bold text-slate-800">{completionRate}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${completionRate}%`, background: "linear-gradient(90deg, #3b82f6, #10b981)" }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            <span>{stats.completed} completados</span>
            <span>{stats.total - stats.completed} pendientes</span>
          </div>
        </div>

        {/* Tabla principal */}
        <div className="card overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-end">
            {/* Búsqueda */}
            <div className="relative flex-1 min-w-48">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por folio, activo, técnico..."
                className="input pl-9"
              />
            </div>

            {/* Estado */}
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as FilterStatus)}
              className="input w-auto"
            >
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="in_progress">En proceso</option>
              <option value="pending_signature">Pend. firma</option>
              <option value="completed">Completado</option>
              <option value="cancelled">Cancelado</option>
            </select>

            {/* Fechas */}
            <input type="date" value={dateRange.from}
              onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))}
              className="input w-auto text-xs" />
            <input type="date" value={dateRange.to}
              onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))}
              className="input w-auto text-xs" />

            {selected.size > 0 && (
              <span className="text-sm text-blue-600 font-medium bg-blue-50 px-3 py-2 rounded-lg">
                {selected.size} seleccionados
              </span>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100" style={{ background: "#f8fafc" }}>
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll} className="rounded accent-blue-600" />
                  </th>
                  {["Folio", "Activo", "Técnico", "Tipo", "Prioridad", "Estado", "Fecha", "Duración", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Cargando reportes...</span>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <div className="text-slate-400 space-y-2">
                        <p className="text-4xl">📭</p>
                        <p className="text-sm font-medium">No hay reportes para mostrar</p>
                        <p className="text-xs">Ajusta los filtros o el rango de fechas</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map((report) => {
                  const status = STATUS_CONFIG[report.status];
                  const priority = PRIORITY_CONFIG[report.priority];
                  const detail = getDetail(report);
                  const dur = detail?.started_at && detail?.finished_at
                    ? Math.round((new Date(detail.finished_at).getTime() - new Date(detail.started_at).getTime()) / 60000)
                    : null;
                  const photoCount = detail?.photos
                    ? Object.values(detail.photos).flat().length
                    : 0;

                  return (
                    <tr key={report.id}
                      className={`group hover:bg-slate-50 transition-colors ${selected.has(report.id) ? "bg-blue-50/50" : ""}`}>
                      <td className="px-4 py-3.5">
                        <input type="checkbox" checked={selected.has(report.id)}
                          onChange={() => toggleSelect(report.id)} className="rounded accent-blue-600" />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                          {report.report_number ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 text-sm">{report.assets?.name ?? "—"}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{report.assets?.location}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-600">
                            {report.profiles?.full_name?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <span className="text-sm text-slate-700">{report.profiles?.full_name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                          {SERVICE_LABELS[report.service_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-bold ${priority.color}`}>
                          ● {priority.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`badge ${status.color} flex items-center gap-1.5 w-fit`}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: status.dot }} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(report.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        {dur !== null ? (
                          <span className="bg-slate-100 px-2 py-1 rounded-lg">{dur} min</span>
                        ) : "—"}
                        {photoCount > 0 && (
                          <span className="ml-2 text-blue-400">📷{photoCount}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link to={`/owner/reports/${report.id}`}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors text-sm"
                            title="Ver detalle">
                            👁
                          </Link>
                          <button
                            onClick={() => handleExportPDF(report)}
                            disabled={exportingPdf === report.id || report.status !== "completed"}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-700 disabled:opacity-30 transition-colors text-sm"
                            title="Exportar PDF">
                            {exportingPdf === report.id ? "⏳" : "📄"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>{filtered.length} reporte{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}</span>
            <span>
              Costo total estimado: <strong className="text-slate-600">
                ${filtered.reduce((acc, r) => {
                  const supplies = r.report_details?.[0]?.supplies ?? [];
                  return acc + supplies.reduce((s, item) => s + (item.cost ?? 0) * item.qty, 0);
                }, 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </strong>
            </span>
          </div>
        </div>

        {/* Activity feed */}
        {filtered.length > 0 && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Actividad Reciente</h3>
            <div className="space-y-3">
              {filtered.slice(0, 5).map((r) => {
                const status = STATUS_CONFIG[r.status];
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: status.dot }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">
                        <span className="font-medium">{r.profiles?.full_name}</span>
                        {" "}completó servicio en{" "}
                        <span className="font-medium">{r.assets?.name}</span>
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                    </span>
                    <span className={`badge ${status.color}`}>{status.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function StatCard({ title, value, sub, icon, iconBg, trend }: {
  title: string; value: number; sub: string; icon: string; iconBg: string; trend: number | null;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center text-lg`}>
          {icon}
        </div>
        {trend !== null && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            trend >= 80 ? "bg-emerald-50 text-emerald-600" :
            trend >= 50 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
          }`}>
            {trend}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-800 mb-0.5">{value.toLocaleString()}</p>
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>
    </div>
  );
}
