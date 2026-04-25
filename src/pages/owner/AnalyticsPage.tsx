import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";

interface MonthStat  { month: string; total: number; completed: number; }
interface TechStat   { name: string; total: number; completed: number; }
interface TypeStat   { type: string; count: number; }
interface AssetKPI   {
  id: string;
  name: string;
  location: string;
  failures: number;       // nº de reportes correctivos completados
  mttr: number;           // minutos promedio por reparación
  mtbf: number | null;    // días promedio entre fallas (null si < 2 fallas)
  totalDowntime: number;  // minutos totales de parada
}

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [monthStats, setMonthStats] = useState<MonthStat[]>([]);
  const [techStats, setTechStats]   = useState<TechStat[]>([]);
  const [typeStats, setTypeStats]   = useState<TypeStat[]>([]);
  const [assetKPIs, setAssetKPIs]   = useState<AssetKPI[]>([]);
  const [totals, setTotals] = useState({ reports: 0, assets: 0, technicians: 0, avgDuration: 0 });

  useEffect(() => {
    if (!user) return;
    const tenantId = user.tenant.id;

    Promise.all([
      // Reportes con detalles
      supabase.from("service_reports").select(`
        id, status, service_type, created_at,
        profiles (full_name),
        report_details (started_at, finished_at),
        assets (id, name, location)
      `).eq("tenant_id", tenantId),
      // Assets count
      supabase.from("assets").select("id", { count: "exact" }).eq("tenant_id", tenantId),
      // Technicians count
      supabase.from("profiles").select("id", { count: "exact" }).eq("tenant_id", tenantId).eq("role", "technician"),
    ]).then(([reportsRes, assetsRes, techRes]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reports: any[] = reportsRes.data ?? [];

      // Stats por mes (últimos 6 meses)
      const monthMap: Record<string, { total: number; completed: number }> = {};
      reports.forEach(r => {
        const m = new Date(r.created_at).toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
        if (!monthMap[m]) monthMap[m] = { total: 0, completed: 0 };
        monthMap[m].total++;
        if (r.status === "completed") monthMap[m].completed++;
      });
      const sortedMonths = Object.entries(monthMap)
        .slice(-6).map(([month, v]) => ({ month, ...v }));
      setMonthStats(sortedMonths);

      // Stats por técnico
      const techMap: Record<string, { total: number; completed: number }> = {};
      reports.forEach(r => {
        const name = (Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name) ?? "Sin asignar";
        if (!techMap[name]) techMap[name] = { total: 0, completed: 0 };
        techMap[name].total++;
        if (r.status === "completed") techMap[name].completed++;
      });
      setTechStats(Object.entries(techMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total).slice(0, 8));

      // Stats por tipo de servicio
      const typeMap: Record<string, number> = {};
      reports.forEach(r => { typeMap[r.service_type] = (typeMap[r.service_type] ?? 0) + 1; });
      setTypeStats(Object.entries(typeMap).map(([type, count]) => ({ type, count })));

      // Duración promedio
      const durs = reports
        .map(r => Array.isArray(r.report_details) ? r.report_details[0] : r.report_details)
        .filter(d => d?.started_at && d?.finished_at)
        .map(d => (new Date(d.finished_at).getTime() - new Date(d.started_at).getTime()) / 60000);
      const avgDur = durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;

      setTotals({
        reports: reports.length,
        assets: assetsRes.count ?? 0,
        technicians: techRes.count ?? 0,
        avgDuration: avgDur,
      });

      // ── MTBF / MTTR por activo ────────────────────────────
      // Solo reportes correctivos completados con duración conocida
      const correctiveCompleted = reports.filter(
        r => r.service_type === "corrective" && r.status === "completed"
      );

      // Agrupar por asset
      const assetMap: Record<string, {
        name: string; location: string;
        repairs: { start: Date; end: Date; dur: number }[];
      }> = {};

      correctiveCompleted.forEach(r => {
        const asset = Array.isArray(r.assets) ? r.assets[0] : r.assets;
        if (!asset?.id) return;
        const detail = Array.isArray(r.report_details) ? r.report_details[0] : r.report_details;
        if (!detail?.started_at || !detail?.finished_at) return;

        const start = new Date(detail.started_at);
        const end   = new Date(detail.finished_at);
        const dur   = (end.getTime() - start.getTime()) / 60000; // minutos
        if (dur <= 0) return;

        if (!assetMap[asset.id]) {
          assetMap[asset.id] = { name: asset.name, location: asset.location ?? "", repairs: [] };
        }
        assetMap[asset.id].repairs.push({ start, end, dur });
      });

      const kpis: AssetKPI[] = Object.entries(assetMap)
        .map(([id, { name, location, repairs }]) => {
          repairs.sort((a, b) => a.start.getTime() - b.start.getTime());
          const failures = repairs.length;
          const totalDowntime = repairs.reduce((s, r) => s + r.dur, 0);
          const mttr = Math.round(totalDowntime / failures);

          // MTBF: tiempo promedio entre inicio de fallas (en días)
          let mtbf: number | null = null;
          if (failures >= 2) {
            const gaps: number[] = [];
            for (let i = 1; i < repairs.length; i++) {
              gaps.push((repairs[i].start.getTime() - repairs[i - 1].start.getTime()) / 86400000);
            }
            mtbf = Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10;
          }

          return { id, name, location, failures, mttr, mtbf, totalDowntime };
        })
        .sort((a, b) => b.failures - a.failures)
        .slice(0, 10);

      setAssetKPIs(kpis);
      setLoading(false);
    });
  }, [user]);

  const maxMonth = Math.max(...monthStats.map(m => m.total), 1);
  const maxTech  = Math.max(...techStats.map(t => t.total), 1);

  const TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
    preventive:   { label: "Preventivo",  color: "#3b82f6", icon: "🔧" },
    corrective:   { label: "Correctivo",  color: "#ef4444", icon: "🚨" },
    predictive:   { label: "Predictivo",  color: "#8b5cf6", icon: "📊" },
    installation: { label: "Instalación", color: "#10b981", icon: "⚙️" },
  };

  const totalTypes = typeStats.reduce((a, b) => a + b.count, 0);

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-6 max-w-screen-xl mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Analíticas</h1>
          <p className="text-sm text-slate-400 mt-0.5">Rendimiento global del equipo de mantenimiento</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Calculando métricas...
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: "Total Reportes", value: totals.reports, icon: "📋", sub: "En todos los períodos",     color: "text-blue-600",    bg: "bg-blue-50" },
                { label: "Activos",        value: totals.assets,       icon: "⚙",  sub: "Equipos registrados",    color: "text-slate-700",   bg: "bg-slate-50" },
                { label: "Técnicos",       value: totals.technicians,  icon: "👷", sub: "En tu equipo",           color: "text-purple-600",  bg: "bg-purple-50" },
                { label: "Duración Prom.", value: `${totals.avgDuration}m`, icon: "⏱", sub: "Por reporte cerrado", color: "text-emerald-600", bg: "bg-emerald-50" },
              ].map(k => (
                <div key={k.label} className="stat-card">
                  <div className={`w-10 h-10 ${k.bg} rounded-xl flex items-center justify-center text-lg mb-3`}>{k.icon}</div>
                  <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">{k.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Gráfica de barras por mes */}
              <div className="card p-5">
                <h2 className="font-semibold text-slate-700 mb-1">Reportes por Mes</h2>
                <p className="text-xs text-slate-400 mb-5">Total vs completados</p>
                {monthStats.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">Sin datos suficientes</p>
                ) : (
                  <div className="space-y-3">
                    {monthStats.map(m => (
                      <div key={m.month} className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span className="font-medium capitalize">{m.month}</span>
                          <span>{m.completed}/{m.total}</span>
                        </div>
                        <div className="h-6 bg-slate-100 rounded-lg overflow-hidden relative">
                          <div className="absolute inset-y-0 left-0 bg-blue-100 rounded-lg"
                            style={{ width: `${(m.total / maxMonth) * 100}%` }} />
                          <div className="absolute inset-y-0 left-0 bg-blue-500 rounded-lg"
                            style={{ width: `${(m.completed / maxMonth) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-4 pt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-blue-500 rounded" />Completados</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-blue-100 rounded" />Total</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Tipos de servicio — donut visual */}
              <div className="card p-5">
                <h2 className="font-semibold text-slate-700 mb-1">Tipos de Servicio</h2>
                <p className="text-xs text-slate-400 mb-5">Distribución de reportes</p>
                {typeStats.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">Sin datos</p>
                ) : (
                  <div className="space-y-3">
                    {typeStats.map(t => {
                      const cfg = TYPE_LABELS[t.type] ?? { label: t.type, color: "#94a3b8", icon: "🔧" };
                      const pct = Math.round((t.count / totalTypes) * 100);
                      return (
                        <div key={t.type} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-600 font-medium flex items-center gap-1.5">
                              {cfg.icon} {cfg.label}
                            </span>
                            <span className="text-slate-400">{t.count} ({pct}%)</span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: cfg.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* MTBF / MTTR por activo */}
            <div className="card overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h2 className="font-semibold text-slate-700">KPIs por Activo — MTBF & MTTR</h2>
                <p className="text-xs text-slate-400 mt-0.5">Basado en reportes correctivos completados</p>
              </div>

              {assetKPIs.length === 0 ? (
                <div className="p-10 text-center text-slate-400">
                  <p className="text-4xl mb-3">📊</p>
                  <p className="font-medium">Sin datos suficientes</p>
                  <p className="text-sm mt-1">Se necesitan reportes correctivos completados con hora de inicio y fin.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {["Activo", "Ubicación", "Fallas", "MTTR", "MTBF", "Tiempo parado", "Criticidad"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {assetKPIs.map(a => {
                        // Criticidad: alta si MTBF < 30d o MTTR > 240min
                        const criticality =
                          (a.mtbf !== null && a.mtbf < 30) || a.mttr > 240 ? "alta" :
                          (a.mtbf !== null && a.mtbf < 90) || a.mttr > 120 ? "media" : "baja";
                        const critConfig = {
                          alta:  { label: "Alta",  cls: "bg-red-50 text-red-600" },
                          media: { label: "Media", cls: "bg-amber-50 text-amber-700" },
                          baja:  { label: "Baja",  cls: "bg-emerald-50 text-emerald-700" },
                        }[criticality];

                        const mttrHours = a.mttr >= 60
                          ? `${Math.floor(a.mttr / 60)}h ${a.mttr % 60}m`
                          : `${a.mttr}m`;
                        const downtimeHours = a.totalDowntime >= 60
                          ? `${Math.floor(a.totalDowntime / 60)}h ${Math.round(a.totalDowntime % 60)}m`
                          : `${Math.round(a.totalDowntime)}m`;

                        return (
                          <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3.5 font-semibold text-slate-800 text-sm">{a.name}</td>
                            <td className="px-4 py-3.5 text-sm text-slate-500">{a.location || "—"}</td>
                            <td className="px-4 py-3.5">
                              <span className="text-sm font-bold text-red-600">{a.failures}</span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-slate-700">{mttrHours}</span>
                                <span className="text-xs text-slate-400">prom.</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              {a.mtbf !== null ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold text-slate-700">{a.mtbf}d</span>
                                  <span className="text-xs text-slate-400">entre fallas</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-300">Insuf. datos</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-sm text-slate-600">{downtimeHours}</td>
                            <td className="px-4 py-3.5">
                              <span className={`badge ${critConfig.cls}`}>{critConfig.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Leyenda */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-400">
                <span><strong className="text-slate-600">MTTR</strong> — Tiempo Medio de Reparación (cuánto tarda arreglar el equipo)</span>
                <span><strong className="text-slate-600">MTBF</strong> — Tiempo Medio Entre Fallas (cada cuántos días falla)</span>
              </div>
            </div>

            {/* Ranking de técnicos */}
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-1">Rendimiento por Técnico</h2>
              <p className="text-xs text-slate-400 mb-5">Reportes totales y tasa de cierre</p>
              {techStats.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Sin datos de técnicos</p>
              ) : (
                <div className="space-y-4">
                  {techStats.map((t, i) => {
                    const rate = t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0;
                    const rateColor = rate >= 80 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";
                    return (
                      <div key={t.name} className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-300 w-5 text-right">{i + 1}</span>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: `hsl(${t.name.charCodeAt(0) * 7}, 60%, 50%)` }}>
                          {t.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium text-slate-700 truncate">{t.name}</span>
                            <span className="text-xs font-bold ml-2 flex-shrink-0" style={{ color: rateColor }}>{rate}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${(t.total / maxTech) * 100}%`, background: "#e2e8f0" }} />
                            <div className="h-full rounded-full -mt-2 transition-all"
                              style={{ width: `${(t.completed / maxTech) * 100}%`, background: rateColor }} />
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-slate-800">{t.total}</p>
                          <p className="text-xs text-slate-400">reportes</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
