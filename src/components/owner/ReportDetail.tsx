import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { generateReportPDF } from "@/lib/pdfGenerator";
import type { ServiceReport } from "@/types/database";
import OrderComments from "./OrderComments";

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    supabase
      .from("service_reports")
      .select(`*, assets (*), profiles (*), report_details (*)`)
      .eq("id", id)
      .eq("tenant_id", user.tenant.id)
      .single()
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }
        // Normalizar joins que Supabase devuelve como arrays
        const normalized = {
          ...data,
          assets:         Array.isArray(data.assets)         ? data.assets[0]         : data.assets,
          profiles:       Array.isArray(data.profiles)       ? data.profiles[0]       : data.profiles,
          report_details: Array.isArray(data.report_details) ? data.report_details[0] : data.report_details,
        };
        setReport(normalized as unknown as ServiceReport);
        setLoading(false);
      });
  }, [id, user]);

  const handleExportPDF = async () => {
    if (!report) return;
    setExportingPdf(true);
    try {
      await generateReportPDF(report, user!.tenant);
    } catch (e) {
      console.error("Error generando PDF:", e);
      alert(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400">Cargando reporte...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-500">Reporte no encontrado.</p>
          <Link to="/owner" className="text-blue-600 text-sm mt-2 block">← Volver al dashboard</Link>
        </div>
      </div>
    );
  }

  const details = report.report_details;
  const photos = details?.photos;
  const supplies = details?.supplies ?? [];
  const checklist = details?.checklist?.items ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/owner" className="text-slate-400 hover:text-slate-600 text-xl">←</Link>
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {report.report_number ?? "Sin folio"}
            </h1>
            <p className="text-xs text-slate-400">{report.assets?.name} — {report.assets?.location}</p>
          </div>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={exportingPdf || report.status !== "completed"}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-40"
        >
          {exportingPdf ? "Generando..." : "📄 Exportar PDF"}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Info general */}
        <Section title="Información General">
          <Grid>
            <Field label="Técnico" value={report.profiles?.full_name} />
            <Field label="Tipo" value={report.service_type} />
            <Field label="Prioridad" value={report.priority} />
            <Field label="Estado" value={report.status} />
            <Field label="Inicio" value={details?.started_at ? new Date(details.started_at).toLocaleString("es-MX") : "—"} />
            <Field label="Fin" value={details?.finished_at ? new Date(details.finished_at).toLocaleString("es-MX") : "—"} />
            {details?.start_latitude && (
              <Field label="GPS Inicio" value={`${details.start_latitude?.toFixed(5)}, ${details.start_longitude?.toFixed(5)}`} />
            )}
            {details?.end_latitude && (
              <Field label="GPS Fin" value={`${details.end_latitude?.toFixed(5)}, ${details.end_longitude?.toFixed(5)}`} />
            )}
          </Grid>
        </Section>

        {/* Checklist */}
        {checklist.length > 0 && (
          <Section title={`Checklist (${checklist.filter((i: { checked: boolean }) => i.checked).length}/${checklist.length})`}>
            <div className="space-y-2">
              {checklist.map((item: { id: string; label: string; checked: boolean; notes?: string }) => (
                <div key={item.id} className="flex items-start gap-2 text-sm">
                  <span className={item.checked ? "text-green-600" : "text-red-400"}>
                    {item.checked ? "✓" : "✗"}
                  </span>
                  <span className={item.checked ? "text-slate-700" : "text-slate-400 line-through"}>
                    {item.label}
                  </span>
                  {item.notes && <span className="text-slate-400 italic">— {item.notes}</span>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Fotos */}
        {photos && (
          <Section title="Evidencia Fotográfica">
            {(["before", "during", "after", "extra"] as const).map((type) => {
              const urls = photos[type] ?? [];
              if (urls.length === 0) return null;
              const labels = { before: "Antes", during: "Durante", after: "Después", extra: "Extra" };
              return (
                <div key={type} className="mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{labels[type]}</p>
                  <div className="flex gap-2 flex-wrap">
                    {urls.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`${labels[type]} ${i + 1}`} className="w-24 h-24 object-cover rounded-xl border hover:opacity-80 transition-opacity" />
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {/* Insumos */}
        {supplies.length > 0 && (
          <Section title="Insumos Utilizados">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b">
                  <th className="pb-2">Descripción</th>
                  <th className="pb-2">Cantidad</th>
                  <th className="pb-2">Unidad</th>
                  <th className="pb-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplies.map((s: { name: string; qty: number; unit: string; cost?: number }, i: number) => (
                  <tr key={i}>
                    <td className="py-2 text-slate-700">{s.name}</td>
                    <td className="py-2 text-slate-600">{s.qty}</td>
                    <td className="py-2 text-slate-600">{s.unit}</td>
                    <td className="py-2 text-right text-slate-700">
                      {s.cost != null ? `$${(s.cost * s.qty).toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* Diagnóstico */}
        {(details?.observations || details?.diagnosis || details?.recommendations) && (
          <Section title="Diagnóstico y Observaciones">
            {details?.observations && <TextField label="Observaciones" value={details.observations} />}
            {details?.diagnosis && <TextField label="Diagnóstico" value={details.diagnosis} />}
            {details?.recommendations && <TextField label="Recomendaciones" value={details.recommendations} />}
          </Section>
        )}

        {/* Firmas */}
        {(details?.technician_signature || details?.client_signature) && (
          <Section title="Firmas de Conformidad">
            <div className="flex gap-6 flex-wrap">
              {details?.technician_signature && (
                <div>
                  <img src={details.technician_signature} alt="Firma técnico" className="h-20 border rounded-xl" />
                  <p className="text-xs text-slate-400 mt-1">Técnico: {report.profiles?.full_name}</p>
                </div>
              )}
              {details?.client_signature && (
                <div>
                  <img src={details.client_signature} alt="Firma cliente" className="h-20 border rounded-xl" />
                  <p className="text-xs text-slate-400 mt-1">Cliente: {details.client_name}</p>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Comentarios y seguimiento */}
        <OrderComments reportId={report.id} />

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-700 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

function TextField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-slate-400 uppercase mb-1">{label}</p>
      <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
