import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";
import { useData } from "@/hooks/useData";
import type { ServiceReport } from "@/types/database";
import { generateReportPDF } from "@/lib/pdfGenerator";

type FilterStatus = "all" | "draft" | "in_progress" | "pending_signature" | "completed" | "cancelled";

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
    photos: Record<string, string[]>;
  }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft:             { label: "Borrador",     color: "bg-slate-100 text-slate-600",    dot: "#94a3b8" },
  in_progress:       { label: "En proceso",   color: "bg-blue-50 text-blue-700",       dot: "#3b82f6" },
  pending_signature: { label: "Pend. firma",  color: "bg-amber-50 text-amber-700",     dot: "#f59e0b" },
  completed:         { label: "Completado",   color: "bg-emerald-50 text-emerald-700", dot: "#10b981" },
  cancelled:         { label: "Cancelado",    color: "bg-red-50 text-red-600",         dot: "#ef4444" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:      { label: "Baja",    color: "text-slate-400" },
  normal:   { label: "Normal",  color: "text-blue-500"  },
  high:     { label: "Alta",    color: "text-amber-500" },
  critical: { label: "Crítica", color: "text-red-500"   },
};

const SERVICE_LABELS: Record<string, string> = {
  preventive: "Preventivo", corrective: "Correctivo",
  predictive: "Predictivo", installation: "Instalación",
};

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [exportingPdf, setExportingPdf] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to:   new Date().toISOString().split("T")[0],
  });

  const fetcher = useCallback(async (): Promise<ReportRow[]> => {
    let q = supabase
      .from("service_reports")
      .select(`
        id, report_number, status, service_type, priority, created_at,
        assets (id, name, location, category),
        profiles (id, full_name),
        report_details (started_at, finished_at, supplies, photos)
      `)
      .eq("tenant_id", user!.tenant.id)
      .gte("created_at", `${dateRange.from}T00:00:00`)
      .lte("created_at", `${dateRange.to}T23:59:59`)
      .order("created_at", { ascending: false });

    if (filterStatus !== "all") q = q.eq("status", filterStatus);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as ReportRow[];
  }, [user, filterStatus, dateRange]);

  const { data: reportsData, loading, error: queryError, refresh } = useData(fetcher);
  const reports: ReportRow[] = reportsData ?? [];

  const filtered = reports.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.report_number?.toLowerCase().includes(q) ||
      r.assets?.name.toLowerCase().includes(q) ||
      r.profiles?.full_name.toLowerCase().includes(q)
    );
  });

  const getDetail = (r: ReportRow) => r.report_details?.[0] ?? null;

  const stats = {
    total:      reports.length,
    completed:  reports.filter(r => r.status === "completed").length,
    inProgress: reports.filter(r => r.status === "in_progress").length,
    pending:    reports.filter(r => r.status === "pending_signature").length,
  };

  const handleExportPDF = async (report: ReportRow) => {
    setExportingPdf(report.id);
    try { await generateReportPDF(report as unknown as ServiceReport, user!.tenant); }
    catch (e) { console.error(e); }
    finally { setExportingPdf(null); }
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    setExportingCsv(true);
    const rows = filtered.map(r => {
      const d = getDetail(r);
      return {
        Folio:       r.report_number ?? "",
        Activo:      r.assets?.name ?? "",
        Ubicacion:   r.assets?.location ?? "",
        Tecnico:     r.profiles?.full_name ?? "",
        Tipo:        SERVICE_LABELS[r.service_type] ?? "",
        Prioridad:   r.priority,
        Estado:      r.status,
        Fecha:       new Date(r.created_at).toLocaleDateString("es-MX"),
        Duracion_min: d?.started_at && d?.finished_at
          ? Math.round((new Date(d.finished_at).getTime() - new Date(d.started_at).getTime()) / 60000)
          : "",
      };
    });
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => `"${(r as Record<string, unknown>)[h] ?? ""}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `reportes-${dateRange.from}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExportingCsv(false);
  };

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-6 max-w-screen-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Reportes de Servicio</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {stats.total} reportes en el período seleccionado
            </p>
          </div>
          <button
            onClick={handleExportCSV}
            disabled={exportingCsv || filtered.length === 0}
            className="btn-secondary flex items-center gap-2"
          >
            ⬇ Exportar CSV
          </button>
        </div>

        {/* Error */}
        {queryError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold">Error al cargar reportes</p>
              <p className="text-xs mt-0.5 font-mono">{queryError}</p>
              <button onClick={refresh} className="mt-2 text-xs underline">Reintentar</button>
            </div>
          </div>
        )}

        {/* Stats rápidas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total",       value: stats.total,      icon: "📋", color: "bg-slate-50"   },
            { label: "En Proceso",  value: stats.inProgress, icon: "🔧", color: "bg-blue-50"    },
            { label: "Pend. Firma", value: stats.pending,    icon: "✍️", color: "bg-amber-50"   },
            { label: "Completados", value: stats.completed,  icon: "✅", color: "bg-emerald-50" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-2xl p-4 border border-slate-100`}>
              <span className="text-2xl block mb-2">{s.icon}</span>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden">
          {/* Filtros */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por folio, activo o técnico..."
                className="input pl-8"
              />
            </div>
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
            <input type="date" value={dateRange.from}
              onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))}
              className="input w-auto text-xs" />
            <span className="text-slate-400 text-xs">→</span>
            <input type="date" value={dateRange.to}
              onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))}
              className="input w-auto text-xs" />
            <button onClick={refresh} className="btn-secondary text-xs px-3 py-2">↻</button>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Folio", "Activo", "Técnico", "Tipo", "Prioridad", "Estado", "Fecha", "Duración", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Cargando reportes...</span>
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-16 text-center">
                    <div className="text-slate-400 space-y-2">
                      <p className="text-4xl">📭</p>
                      <p className="text-sm font-medium">No hay reportes para mostrar</p>
                      <p className="text-xs">Ajusta los filtros o el rango de fechas</p>
                    </div>
                  </td></tr>
                ) : filtered.map(report => {
                  const status   = STATUS_CONFIG[report.status]   ?? STATUS_CONFIG.draft;
                  const priority = PRIORITY_CONFIG[report.priority] ?? PRIORITY_CONFIG.normal;
                  const detail   = getDetail(report);
                  const dur = detail?.started_at && detail?.finished_at
                    ? Math.round((new Date(detail.finished_at).getTime() - new Date(detail.started_at).getTime()) / 60000)
                    : null;
                  const photoCount = detail?.photos ? Object.values(detail.photos).flat().length : 0;

                  return (
                    <tr key={report.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                          {report.report_number ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 text-sm">{report.assets?.name ?? "—"}</p>
                        <p className="text-xs text-slate-400">{report.assets?.location}</p>
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
                          {SERVICE_LABELS[report.service_type] ?? report.service_type}
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
                        {new Date(report.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        {dur !== null ? <span className="bg-slate-100 px-2 py-1 rounded-lg">{dur} min</span> : "—"}
                        {photoCount > 0 && <span className="ml-2 text-blue-400">📷{photoCount}</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link
                            to={`/owner/reports/${report.id}`}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 text-sm"
                            title="Ver detalle"
                          >
                            👁
                          </Link>
                          <button
                            onClick={() => handleExportPDF(report)}
                            disabled={exportingPdf === report.id || report.status !== "completed"}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 disabled:opacity-30 text-sm"
                            title="Exportar PDF"
                          >
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

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>{filtered.length} reporte{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}</span>
            <span>
              Costo total:{" "}
              <strong className="text-slate-600">
                ${filtered.reduce((acc, r) => {
                  const supplies = getDetail(r)?.supplies ?? [];
                  return acc + supplies.reduce((s, i) => s + (i.cost ?? 0) * i.qty, 0);
                }, 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
