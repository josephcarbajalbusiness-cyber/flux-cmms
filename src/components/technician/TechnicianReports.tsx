import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";
import QRScanner from "./QRScanner";
import type { ServiceReport } from "@/types/database";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft:             { label: "Borrador",    color: "text-slate-600",   bg: "bg-slate-100",  dot: "#94a3b8" },
  in_progress:       { label: "En proceso",  color: "text-blue-700",    bg: "bg-blue-50",    dot: "#3b82f6" },
  pending_signature: { label: "Pend. firma", color: "text-amber-700",   bg: "bg-amber-50",   dot: "#f59e0b" },
  completed:         { label: "Completado",  color: "text-emerald-700", bg: "bg-emerald-50", dot: "#10b981" },
  cancelled:         { label: "Cancelado",   color: "text-red-600",     bg: "bg-red-50",     dot: "#ef4444" },
};

const SERVICE_ICONS: Record<string, string> = {
  preventive: "🔧", corrective: "🚨", predictive: "📊", installation: "⚙️",
};

export default function TechnicianReports() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const justSaved = location.state?.success;

  const handleQRScan = async (code: string) => {
    setShowScanner(false);
    setScanError(null);
    // Buscar activo por qr_code
    const { data, error } = await supabase
      .from("assets")
      .select("id, name, qr_code")
      .eq("qr_code", code.trim())
      .eq("tenant_id", user!.tenant.id)
      .single();

    if (error || !data) {
      setScanError(`Código QR no reconocido: "${code}". Verifica que el activo esté registrado.`);
      return;
    }
    // Ir a crear reporte con el activo pre-seleccionado
    navigate("/technician/reports/new", { state: { assetId: data.id, assetName: data.name } });
  };

  useEffect(() => {
    if (!user) return;
    supabase
      .from("service_reports")
      .select(`
        id, report_number, status, service_type, priority, created_at, updated_at,
        assets (name, location, category),
        report_details (started_at, finished_at, photos)
      `)
      .eq("technician_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setReports((data ?? []) as unknown as ServiceReport[]);
        setLoading(false);
      });
  }, [user]);

  const completedCount = reports.filter(r => r.status === "completed").length;
  const activeCount = reports.filter(r => r.status === "in_progress").length;
  const thisMonth = reports.filter(r => {
    const d = new Date(r.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <Layout>
      {/* QR Scanner fullscreen */}
      {showScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="p-4 lg:p-6 space-y-5 max-w-2xl mx-auto">

        {/* Éxito banner */}
        {justSaved && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700">
            <span className="text-xl">✅</span>
            <p className="text-sm font-medium">Reporte guardado exitosamente</p>
          </div>
        )}

        {/* Error QR */}
        {scanError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium">{scanError}</p>
            </div>
            <button onClick={() => setScanError(null)} className="text-red-400 hover:text-red-600 text-lg">✕</button>
          </div>
        )}

        {/* Header personal */}
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {user?.profile.full_name[0]?.toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-800">Hola, {user?.profile.full_name} 👋</p>
            <p className="text-xs text-slate-400 mt-0.5">{user?.tenant.name} · Técnico de campo</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{thisMonth}</p>
            <p className="text-xs text-slate-400">este mes</p>
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: reports.length, icon: "📋", color: "bg-slate-50" },
            { label: "Activos", value: activeCount,  icon: "🔧", color: "bg-blue-50" },
            { label: "Cerrados", value: completedCount, icon: "✅", color: "bg-emerald-50" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-2xl p-3.5 text-center border border-slate-100`}>
              <span className="text-xl block mb-1">{s.icon}</span>
              <p className="text-xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* CTAs principales */}
        <div className="grid grid-cols-2 gap-3">
          {/* Escanear QR */}
          <button
            onClick={() => { setScanError(null); setShowScanner(true); }}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl text-white shadow-lg transition-transform active:scale-95"
            style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}
          >
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl">
              📷
            </div>
            <div className="text-center">
              <p className="font-bold text-sm">Escanear QR</p>
              <p className="text-slate-400 text-xs mt-0.5">Abre ficha del equipo</p>
            </div>
          </button>

          {/* Nuevo reporte manual */}
          <Link
            to="/technician/reports/new"
            className="flex flex-col items-center gap-3 p-5 rounded-2xl text-white shadow-lg transition-transform active:scale-95"
            style={{ background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)" }}
          >
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
              ➕
            </div>
            <div className="text-center">
              <p className="font-bold text-sm">Nuevo Reporte</p>
              <p className="text-blue-200 text-xs mt-0.5">Selecciona equipo manual</p>
            </div>
          </Link>
        </div>

        {/* Lista de reportes */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Historial Reciente
          </h2>

          {loading && (
            <div className="text-center py-10 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm">Cargando reportes...</p>
            </div>
          )}

          {!loading && reports.length === 0 && (
            <div className="card p-10 text-center text-slate-400 space-y-3">
              <p className="text-5xl">📋</p>
              <p className="font-medium text-slate-600">Sin reportes aún</p>
              <p className="text-sm">Crea tu primer reporte de servicio usando el botón de arriba.</p>
            </div>
          )}

          <div className="space-y-3">
            {reports.map((report) => {
              const status = STATUS_CONFIG[report.status];
              const detail = Array.isArray(report.report_details) ? report.report_details[0] : report.report_details;
              const photos = detail?.photos as Record<string, string[]> | undefined;
              const photoCount = photos ? Object.values(photos).flat().length : 0;
              const dur = detail?.started_at && detail?.finished_at
                ? Math.round((new Date(detail.finished_at).getTime() - new Date(detail.started_at).getTime()) / 60000)
                : null;

              return (
                <div key={report.id} className="card p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    {/* Icono tipo servicio */}
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0 border border-slate-100">
                      {SERVICE_ICONS[report.service_type] ?? "🔧"}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-slate-800 truncate">{report.assets?.name ?? "—"}</p>
                        <span className={`badge ${status.bg} ${status.color} flex-shrink-0 flex items-center gap-1`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mb-2">{report.assets?.location}</p>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span className="font-mono bg-slate-50 px-2 py-0.5 rounded-md border">
                          {report.report_number ?? "Sin folio"}
                        </span>
                        <span>{new Date(report.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        {dur !== null && <span>⏱ {dur} min</span>}
                        {photoCount > 0 && <span>📷 {photoCount} fotos</span>}
                      </div>
                    </div>
                  </div>

                  {/* Acciones inline si está en proceso */}
                  {report.status === "in_progress" && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <Link
                        to={`/technician/reports/new?resume=${report.id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Continuar reporte →
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
}
