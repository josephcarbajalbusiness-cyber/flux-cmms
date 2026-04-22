import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, uploadFile, STORAGE_BUCKETS, getStoragePath } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useGeolocation } from "@/hooks/useGeolocation";
import type { Asset, Checklist, Photos, Supply, ServiceType, Priority, ChecklistTemplate } from "@/types/database";

// ── Paso del wizard ──────────────────────────────────────────
type Step = "asset" | "info" | "checklist" | "photos" | "supplies" | "signature" | "review";

const STEPS: Step[] = ["asset", "info", "checklist", "photos", "supplies", "signature", "review"];

const STEP_LABELS: Record<Step, string> = {
  asset: "Activo",
  info: "Información",
  checklist: "Checklist",
  photos: "Evidencia",
  supplies: "Insumos",
  signature: "Firmas",
  review: "Revisar",
};

const DEFAULT_CHECKLIST: Checklist = {
  items: [
    { id: "1", label: "Limpieza general del equipo", checked: false },
    { id: "2", label: "Revisión de componentes eléctricos", checked: false },
    { id: "3", label: "Verificación de niveles de lubricación", checked: false },
    { id: "4", label: "Inspección de rodamientos y correas", checked: false },
    { id: "5", label: "Prueba de funcionamiento en vacío", checked: false },
    { id: "6", label: "Prueba de funcionamiento con carga", checked: false },
  ],
};

// ── Componente principal ─────────────────────────────────────
export default function CreateReport() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getPosition } = useGeolocation();

  const [currentStep, setCurrentStep] = useState<Step>("asset");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del reporte
  const [asset, setAsset] = useState<Asset | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("preventive");
  const [priority, setPriority] = useState<Priority>("normal");
  const [checklist, setChecklist] = useState<Checklist>(DEFAULT_CHECKLIST);
  const [photos, setPhotos] = useState<Photos>({ before: [], during: [], after: [], extra: [] });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [observations, setObservations] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [clientName, setClientName] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);
  const [startPosition, setStartPosition] = useState<{ latitude: number; longitude: number } | null>(null);

  // Plantillas de checklist
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Cargar plantillas disponibles
  useEffect(() => {
    if (!user) return;
    supabase.from("checklist_templates")
      .select("id, name, description, category, icon, items")
      .eq("tenant_id", user.tenant.id)
      .order("category").order("name")
      .then(({ data }) => setTemplates((data ?? []) as ChecklistTemplate[]));
  }, [user]);

  const applyTemplate = (t: ChecklistTemplate) => {
    setChecklist({
      items: t.items.map(item => ({ ...item, checked: false })),
    });
    setShowTemplateModal(false);
  };

  // Canvas para firma
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const clientSignatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [techSignatureUrl, setTechSignatureUrl] = useState<string | null>(null);
  const [clientSignatureUrl, setClientSignatureUrl] = useState<string | null>(null);
  const isDrawing = useRef(false);

  // ── Buscar activo por QR ─────────────────────────────────
  const loadAssetByQr = useCallback(async (qrCode: string) => {
    setError(null);
    const { data, error: dbError } = await supabase
      .from("assets")
      .select("*")
      .eq("qr_code", qrCode)
      .eq("tenant_id", user!.tenant.id)
      .single();

    if (dbError || !data) {
      setError("Activo no encontrado. Verifica el código QR.");
      return;
    }
    setAsset(data as Asset);

    // Capturar posición GPS al escanear
    try {
      const pos = await getPosition();
      setStartPosition(pos);
    } catch {
      // GPS no bloqueante en este paso
    }
  }, [user, getPosition]);

  // Auto-cargar si viene QR en URL (/report/new?qr=ASSET-001)
  useState(() => {
    const qr = searchParams.get("qr");
    if (qr) loadAssetByQr(qr);
  });

  // ── Crear el reporte borrador en la BD ───────────────────
  const createDraftReport = useCallback(async (): Promise<string> => {
    if (reportId) return reportId;

    const { data, error: dbError } = await supabase
      .from("service_reports")
      .insert({
        tenant_id: user!.tenant.id,
        asset_id: asset!.id,
        technician_id: user!.id,
        service_type: serviceType,
        priority,
        status: "in_progress",
      })
      .select("id")
      .single();

    if (dbError) throw dbError;

    const newReportId = data.id;
    setReportId(newReportId);

    // Crear detalle vacío con posición GPS inicial
    await supabase.from("report_details").insert({
      report_id: newReportId,
      tenant_id: user!.tenant.id,
      started_at: new Date().toISOString(),
      start_latitude: startPosition?.latitude,
      start_longitude: startPosition?.longitude,
      checklist: DEFAULT_CHECKLIST,
      photos: { before: [], during: [], after: [], extra: [] },
      supplies: [],
    });

    return newReportId;
  }, [reportId, user, asset, serviceType, priority, startPosition]);

  // ── Subir foto a Storage ─────────────────────────────────
  const handlePhotoCapture = useCallback(async (
    type: keyof Photos,
    file: File
  ) => {
    setUploadingPhoto(true);
    setError(null);
    try {
      const rId = await createDraftReport();
      const filename = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const path = getStoragePath(user!.tenant.id, rId, type as "before" | "during" | "after" | "extra", filename);
      const url = await uploadFile(STORAGE_BUCKETS.REPORT_MEDIA, path, file, file.type);

      setPhotos((prev) => ({
        ...prev,
        [type]: [...prev[type], url],
      }));

      // Actualizar en BD
      const updatedPhotos = { ...photos, [type]: [...photos[type], url] };
      await supabase
        .from("report_details")
        .update({ photos: updatedPhotos })
        .eq("report_id", rId);
    } catch (err) {
      setError(`Error al subir foto: ${(err as Error).message}`);
    } finally {
      setUploadingPhoto(false);
    }
  }, [createDraftReport, user, photos]);

  // ── Guardar firma desde canvas ───────────────────────────
  const saveSignature = useCallback(async (
    canvasRef: React.RefObject<HTMLCanvasElement>,
    type: "technician" | "client"
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const rId = reportId || await createDraftReport();
      const path = getStoragePath(user!.tenant.id, rId, "signature", `${type}-${Date.now()}.png`);
      const url = await uploadFile(STORAGE_BUCKETS.SIGNATURES, path, blob, "image/png");

      if (type === "technician") setTechSignatureUrl(url);
      else setClientSignatureUrl(url);
    });
  }, [reportId, createDraftReport, user]);

  // ── Canvas de firma: handlers ────────────────────────────
  const startDrawing = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    isDrawing.current = true;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    if (!isDrawing.current) return;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const stopDrawing = () => { isDrawing.current = false; };

  const clearCanvas = (ref: React.RefObject<HTMLCanvasElement>) => {
    const ctx = ref.current?.getContext("2d");
    if (ctx && ref.current) ctx.clearRect(0, 0, ref.current.width, ref.current.height);
  };

  // ── Guardar reporte final ────────────────────────────────
  const submitReport = async () => {
    setSaving(true);
    setError(null);
    try {
      // Validar fotos mínimas
      if (photos.before.length === 0 || photos.during.length === 0 || photos.after.length === 0) {
        throw new Error("Se requiere al menos una foto Antes, Durante y Después.");
      }

      const rId = reportId || await createDraftReport();

      // Capturar GPS de cierre
      let endPos = null;
      try { endPos = await getPosition(); } catch { /* opcional */ }

      // Actualizar detalle del reporte
      await supabase.from("report_details").update({
        finished_at: new Date().toISOString(),
        end_latitude: endPos?.latitude,
        end_longitude: endPos?.longitude,
        checklist,
        photos,
        supplies,
        observations,
        diagnosis,
        recommendations,
        technician_signature: techSignatureUrl,
        client_signature: clientSignatureUrl,
        client_name: clientName,
        device_info: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
      }).eq("report_id", rId);

      // Cambiar estado a completado
      await supabase.from("service_reports").update({
        status: techSignatureUrl && clientSignatureUrl ? "completed" : "pending_signature",
      }).eq("id", rId);

      // Actualizar última revisión del activo
      await supabase.from("assets").update({
        last_service_at: new Date().toISOString(),
      }).eq("id", asset!.id);

      navigate("/technician/reports", { state: { success: true } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Navegación entre pasos ───────────────────────────────
  const currentStepIndex = STEPS.indexOf(currentStep);
  const goNext = () => setCurrentStep(STEPS[currentStepIndex + 1]);
  const goPrev = () => setCurrentStep(STEPS[currentStepIndex - 1]);

  const canGoNext = (): boolean => {
    if (currentStep === "asset") return !!asset;
    if (currentStep === "photos") {
      return photos.before.length > 0 && photos.during.length > 0 && photos.after.length > 0;
    }
    return true;
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 py-4 sticky top-0 z-10 shadow-md">
        <h1 className="text-lg font-bold">Nuevo Reporte</h1>
        {asset && <p className="text-sm text-blue-200 truncate">{asset.name} — {asset.location}</p>}
      </div>

      {/* Progress Bar */}
      <div className="bg-white border-b px-4 py-3">
        <div className="flex gap-1">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i <= currentStepIndex ? "bg-blue-600" : "bg-slate-200"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Paso {currentStepIndex + 1} de {STEPS.length}: <strong>{STEP_LABELS[currentStep]}</strong>
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="px-4 py-6 space-y-4">

        {/* ── PASO 1: Seleccionar activo ── */}
        {currentStep === "asset" && (
          <StepAsset
            asset={asset}
            onQrScan={(qr) => loadAssetByQr(qr)}
            onManualSearch={(qr) => loadAssetByQr(qr)}
          />
        )}

        {/* ── PASO 2: Información del servicio ── */}
        {currentStep === "info" && (
          <StepInfo
            serviceType={serviceType}
            priority={priority}
            onServiceTypeChange={setServiceType}
            onPriorityChange={setPriority}
          />
        )}

        {/* ── PASO 3: Checklist ── */}
        {currentStep === "checklist" && (
          <>
            {/* Selector de plantilla */}
            {templates.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-blue-800">Usar plantilla</p>
                  <p className="text-xs text-blue-600">Precarga los puntos de inspección automáticamente</p>
                </div>
                <button onClick={() => setShowTemplateModal(true)}
                  className="btn-primary text-sm px-3 py-1.5">
                  ☑️ Seleccionar
                </button>
              </div>
            )}
            <StepChecklist checklist={checklist} onChange={setChecklist} />
          </>
        )}

        {/* ── PASO 4: Fotos (obligatorio: antes/durante/después) ── */}
        {currentStep === "photos" && (
          <StepPhotos
            photos={photos}
            uploading={uploadingPhoto}
            onCapture={handlePhotoCapture}
          />
        )}

        {/* ── PASO 5: Insumos/Refacciones ── */}
        {currentStep === "supplies" && (
          <StepSupplies
            supplies={supplies}
            observations={observations}
            diagnosis={diagnosis}
            recommendations={recommendations}
            onSuppliesChange={setSupplies}
            onObservationsChange={setObservations}
            onDiagnosisChange={setDiagnosis}
            onRecommendationsChange={setRecommendations}
          />
        )}

        {/* ── PASO 6: Firmas ── */}
        {currentStep === "signature" && (
          <StepSignature
            techSignatureUrl={techSignatureUrl}
            clientSignatureUrl={clientSignatureUrl}
            clientName={clientName}
            signatureCanvasRef={signatureCanvasRef}
            clientSignatureCanvasRef={clientSignatureCanvasRef}
            onClientNameChange={setClientName}
            onStartDrawing={startDrawing}
            onDraw={draw}
            onStopDrawing={stopDrawing}
            onClearCanvas={clearCanvas}
            onSaveSignature={saveSignature}
          />
        )}

        {/* ── PASO 7: Revisión final ── */}
        {currentStep === "review" && (
          <StepReview
            asset={asset!}
            serviceType={serviceType}
            priority={priority}
            checklist={checklist}
            photos={photos}
            supplies={supplies}
            observations={observations}
            techSignatureUrl={techSignatureUrl}
            clientSignatureUrl={clientSignatureUrl}
          />
        )}
      </div>

      {/* Footer de navegación */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3 flex gap-3">
        {currentStepIndex > 0 && (
          <button
            onClick={goPrev}
            className="flex-1 py-3 border border-slate-300 rounded-xl text-slate-700 font-medium"
          >
            Anterior
          </button>
        )}
        {currentStep !== "review" ? (
          <button
            onClick={goNext}
            disabled={!canGoNext()}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-40"
          >
            Siguiente
          </button>
        ) : (
          <button
            onClick={submitReport}
            disabled={saving}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold disabled:opacity-40"
          >
            {saving ? "Guardando..." : "Finalizar Reporte"}
          </button>
        )}
      </div>

      {/* ── Modal selección de plantilla ─────────────────── */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-slate-800">☑️ Seleccionar Plantilla</h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-3 space-y-2">
              {templates.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 transition-colors text-left border border-transparent hover:border-blue-200">
                  <span className="text-2xl flex-shrink-0">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{t.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t.category} · {t.items.length} puntos de inspección
                    </p>
                    {t.description && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{t.description}</p>
                    )}
                  </div>
                  <span className="text-blue-400 text-lg flex-shrink-0">›</span>
                </button>
              ))}
            </div>
            <div className="p-4 border-t">
              <button onClick={() => setShowTemplateModal(false)} className="btn-secondary w-full text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes de pasos ─────────────────────────────────

function StepAsset({
  asset,
  onQrScan,
  onManualSearch,
}: {
  asset: Asset | null;
  onQrScan: (qr: string) => void;
  onManualSearch: (qr: string) => void;
}) {
  const [manualCode, setManualCode] = useState("");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Identificar Activo</h2>

      {/* Botón para abrir cámara QR — integración con html5-qrcode */}
      <button
        onClick={() => {
          // Integración con html5-qrcode o @zxing/library
          // El componente QRScanner maneja esto
          document.getElementById("qr-file-input")?.click();
        }}
        className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
      >
        <span className="text-2xl">📷</span>
        Escanear código QR
      </button>

      {/* Input file como fallback para cámara */}
      <input
        id="qr-file-input"
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          // En producción usar html5-qrcode para decodificar
          // Por ahora el QR viene en la URL
        }}
      />

      <div className="flex gap-2">
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Código manual (ej: MACH-001)"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={() => onManualSearch(manualCode)}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm"
        >
          Buscar
        </button>
      </div>

      {asset && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-semibold text-slate-800">{asset.name}</p>
              <p className="text-sm text-slate-500">{asset.location}</p>
              {asset.category && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {asset.category}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepInfo({
  serviceType,
  priority,
  onServiceTypeChange,
  onPriorityChange,
}: {
  serviceType: ServiceType;
  priority: Priority;
  onServiceTypeChange: (v: ServiceType) => void;
  onPriorityChange: (v: Priority) => void;
}) {
  const serviceTypes: { value: ServiceType; label: string; icon: string }[] = [
    { value: "preventive", label: "Preventivo", icon: "🔧" },
    { value: "corrective", label: "Correctivo", icon: "🚨" },
    { value: "predictive", label: "Predictivo", icon: "📊" },
    { value: "installation", label: "Instalación", icon: "⚙️" },
  ];

  const priorities: { value: Priority; label: string; color: string }[] = [
    { value: "low", label: "Baja", color: "bg-green-100 text-green-700 border-green-300" },
    { value: "normal", label: "Normal", color: "bg-blue-100 text-blue-700 border-blue-300" },
    { value: "high", label: "Alta", color: "bg-orange-100 text-orange-700 border-orange-300" },
    { value: "critical", label: "Crítica", color: "bg-red-100 text-red-700 border-red-300" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
          Tipo de Servicio
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {serviceTypes.map((st) => (
            <button
              key={st.value}
              onClick={() => onServiceTypeChange(st.value)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                serviceType === st.value
                  ? "border-blue-600 bg-blue-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <span className="text-2xl block mb-1">{st.icon}</span>
              <span className="text-sm font-medium text-slate-700">{st.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
          Prioridad
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {priorities.map((p) => (
            <button
              key={p.value}
              onClick={() => onPriorityChange(p.value)}
              className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${p.color} ${
                priority === p.value ? "ring-2 ring-offset-1 ring-blue-500" : ""
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepChecklist({
  checklist,
  onChange,
}: {
  checklist: Checklist;
  onChange: (c: Checklist) => void;
}) {
  const toggle = (id: string) => {
    onChange({
      items: checklist.items.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      ),
    });
  };

  const updateNote = (id: string, notes: string) => {
    onChange({
      items: checklist.items.map((item) =>
        item.id === id ? { ...item, notes } : item
      ),
    });
  };

  const completed = checklist.items.filter((i) => i.checked).length;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-800">Lista de Inspección</h2>
        <span className="text-sm text-slate-500">{completed}/{checklist.items.length}</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all"
          style={{ width: `${(completed / checklist.items.length) * 100}%` }}
        />
      </div>
      {checklist.items.map((item) => (
        <div
          key={item.id}
          className={`p-3 rounded-xl border transition-colors ${
            item.checked ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"
          }`}
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => toggle(item.id)}
              className="mt-0.5 w-5 h-5 accent-blue-600 flex-shrink-0"
            />
            <span className={`text-sm ${item.checked ? "text-green-700 line-through" : "text-slate-700"}`}>
              {item.label}
            </span>
          </label>
          {item.checked && (
            <input
              value={item.notes ?? ""}
              onChange={(e) => updateNote(item.id, e.target.value)}
              placeholder="Observación (opcional)"
              className="mt-2 w-full text-xs border border-slate-200 rounded-lg px-2 py-1"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function StepPhotos({
  photos,
  uploading,
  onCapture,
}: {
  photos: Photos;
  uploading: boolean;
  onCapture: (type: keyof Photos, file: File) => void;
}) {
  const sections: { key: keyof Photos; label: string; icon: string; required: boolean }[] = [
    { key: "before", label: "Antes del servicio", icon: "📸", required: true },
    { key: "during", label: "Durante el servicio", icon: "🔧", required: true },
    { key: "after", label: "Después del servicio", icon: "✅", required: true },
    { key: "extra", label: "Evidencia adicional", icon: "📎", required: false },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-800">Evidencia Fotográfica</h2>
      <p className="text-sm text-slate-500">
        Se requiere mínimo 1 foto en cada categoría obligatoria (📸🔧✅).
      </p>

      {sections.map((section) => (
        <div key={section.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1">
              {section.icon} {section.label}
              {section.required && <span className="text-red-500">*</span>}
            </h3>
            <span className="text-xs text-slate-400">{photos[section.key].length} foto(s)</span>
          </div>

          {/* Miniaturas */}
          <div className="flex gap-2 flex-wrap">
            {photos[section.key].map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`${section.label} ${i + 1}`}
                className="w-20 h-20 object-cover rounded-lg border border-slate-200"
              />
            ))}

            {/* Botón de captura */}
            <label className={`w-20 h-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
              uploading ? "opacity-50 cursor-not-allowed" : "border-blue-300 hover:bg-blue-50"
            }`}>
              <span className="text-xl">+</span>
              <span className="text-xs text-slate-500">Foto</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onCapture(section.key, file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      ))}

      {uploading && (
        <div className="text-center py-3 text-blue-600 text-sm">Subiendo foto...</div>
      )}
    </div>
  );
}

function StepSupplies({
  supplies,
  observations,
  diagnosis,
  recommendations,
  onSuppliesChange,
  onObservationsChange,
  onDiagnosisChange,
  onRecommendationsChange,
}: {
  supplies: Supply[];
  observations: string;
  diagnosis: string;
  recommendations: string;
  onSuppliesChange: (s: Supply[]) => void;
  onObservationsChange: (v: string) => void;
  onDiagnosisChange: (v: string) => void;
  onRecommendationsChange: (v: string) => void;
}) {
  const addSupply = () => {
    onSuppliesChange([...supplies, { name: "", qty: 1, unit: "pza" }]);
  };

  const updateSupply = (index: number, field: keyof Supply, value: string | number) => {
    const updated = supplies.map((s, i) => i === index ? { ...s, [field]: value } : s);
    onSuppliesChange(updated);
  };

  const removeSupply = (index: number) => {
    onSuppliesChange(supplies.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-slate-800">Insumos Utilizados</h2>
          <button onClick={addSupply} className="text-sm text-blue-600 font-medium">+ Agregar</button>
        </div>

        {supplies.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">Sin insumos registrados</p>
        )}

        {supplies.map((supply, i) => (
          <div key={i} className="p-3 border border-slate-200 rounded-xl space-y-2 mb-2">
            <div className="flex gap-2">
              <input
                value={supply.name}
                onChange={(e) => updateSupply(i, "name", e.target.value)}
                placeholder="Nombre del insumo"
                className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-sm"
              />
              <button onClick={() => removeSupply(i)} className="text-red-400 px-2">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={supply.qty}
                min={0}
                onChange={(e) => updateSupply(i, "qty", parseFloat(e.target.value))}
                className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm"
              />
              <select
                value={supply.unit}
                onChange={(e) => updateSupply(i, "unit", e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-sm"
              >
                {["pza", "lt", "kg", "m", "par", "juego"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <input
                type="number"
                value={supply.cost ?? ""}
                placeholder="$"
                onChange={(e) => updateSupply(i, "cost", parseFloat(e.target.value))}
                className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-slate-700">Observaciones</label>
          <textarea
            value={observations}
            onChange={(e) => onObservationsChange(e.target.value)}
            rows={3}
            className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            placeholder="Condiciones encontradas..."
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Diagnóstico</label>
          <textarea
            value={diagnosis}
            onChange={(e) => onDiagnosisChange(e.target.value)}
            rows={3}
            className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            placeholder="Causa raíz del problema..."
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Recomendaciones</label>
          <textarea
            value={recommendations}
            onChange={(e) => onRecommendationsChange(e.target.value)}
            rows={2}
            className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
            placeholder="Acciones futuras sugeridas..."
          />
        </div>
      </div>
    </div>
  );
}

function StepSignature({
  techSignatureUrl,
  clientSignatureUrl,
  clientName,
  signatureCanvasRef,
  clientSignatureCanvasRef,
  onClientNameChange,
  onStartDrawing,
  onDraw,
  onStopDrawing,
  onClearCanvas,
  onSaveSignature,
}: {
  techSignatureUrl: string | null;
  clientSignatureUrl: string | null;
  clientName: string;
  signatureCanvasRef: React.RefObject<HTMLCanvasElement>;
  clientSignatureCanvasRef: React.RefObject<HTMLCanvasElement>;
  onClientNameChange: (v: string) => void;
  onStartDrawing: (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => void;
  onDraw: (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => void;
  onStopDrawing: () => void;
  onClearCanvas: (ref: React.RefObject<HTMLCanvasElement>) => void;
  onSaveSignature: (ref: React.RefObject<HTMLCanvasElement>, type: "technician" | "client") => void;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">Firmas</h2>

      {/* Firma del técnico */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Firma del Técnico</h3>
        {techSignatureUrl ? (
          <div className="space-y-2">
            <img src={techSignatureUrl} alt="Firma técnico" className="border rounded-xl max-h-24" />
            <button onClick={() => onSaveSignature(signatureCanvasRef, "technician")} className="text-sm text-blue-600">
              Volver a firmar
            </button>
          </div>
        ) : (
          <SignaturePad
            canvasRef={signatureCanvasRef}
            onStartDrawing={onStartDrawing}
            onDraw={onDraw}
            onStopDrawing={onStopDrawing}
            onClear={() => onClearCanvas(signatureCanvasRef)}
            onSave={() => onSaveSignature(signatureCanvasRef, "technician")}
          />
        )}
      </div>

      {/* Firma del cliente */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Firma del Cliente / Receptor</h3>
        <input
          value={clientName}
          onChange={(e) => onClientNameChange(e.target.value)}
          placeholder="Nombre de quien recibe el servicio"
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-3"
        />
        {clientSignatureUrl ? (
          <div className="space-y-2">
            <img src={clientSignatureUrl} alt="Firma cliente" className="border rounded-xl max-h-24" />
            <button onClick={() => onSaveSignature(clientSignatureCanvasRef, "client")} className="text-sm text-blue-600">
              Volver a firmar
            </button>
          </div>
        ) : (
          <SignaturePad
            canvasRef={clientSignatureCanvasRef}
            onStartDrawing={onStartDrawing}
            onDraw={onDraw}
            onStopDrawing={onStopDrawing}
            onClear={() => onClearCanvas(clientSignatureCanvasRef)}
            onSave={() => onSaveSignature(clientSignatureCanvasRef, "client")}
          />
        )}
      </div>
    </div>
  );
}

function SignaturePad({
  canvasRef,
  onStartDrawing,
  onDraw,
  onStopDrawing,
  onClear,
  onSave,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onStartDrawing: (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => void;
  onDraw: (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => void;
  onStopDrawing: () => void;
  onClear: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={320}
        height={120}
        className="w-full border-2 border-dashed border-slate-300 rounded-xl touch-none bg-white"
        onMouseDown={(e) => canvasRef.current && onStartDrawing(e, canvasRef.current)}
        onMouseMove={(e) => canvasRef.current && onDraw(e, canvasRef.current)}
        onMouseUp={onStopDrawing}
        onTouchStart={(e) => canvasRef.current && onStartDrawing(e, canvasRef.current)}
        onTouchMove={(e) => canvasRef.current && onDraw(e, canvasRef.current)}
        onTouchEnd={onStopDrawing}
      />
      <div className="flex gap-2">
        <button onClick={onClear} className="flex-1 py-2 border border-slate-300 rounded-lg text-sm">
          Borrar
        </button>
        <button onClick={onSave} className="flex-1 py-2 bg-slate-700 text-white rounded-lg text-sm">
          Guardar firma
        </button>
      </div>
    </div>
  );
}

function StepReview({
  asset,
  serviceType,
  priority,
  checklist,
  photos,
  supplies,
  observations,
  techSignatureUrl,
  clientSignatureUrl,
}: {
  asset: Asset;
  serviceType: ServiceType;
  priority: Priority;
  checklist: Checklist;
  photos: Photos;
  supplies: Supply[];
  observations: string;
  techSignatureUrl: string | null;
  clientSignatureUrl: string | null;
}) {
  const completed = checklist.items.filter((i) => i.checked).length;
  const totalPhotos = Object.values(photos).flat().length;
  const totalCost = supplies.reduce((acc, s) => acc + (s.cost ?? 0) * s.qty, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Resumen del Reporte</h2>

      <ReviewRow label="Activo" value={asset.name} />
      <ReviewRow label="Tipo" value={serviceType} />
      <ReviewRow label="Prioridad" value={priority} />
      <ReviewRow label="Checklist" value={`${completed}/${checklist.items.length} puntos`} />
      <ReviewRow label="Fotos" value={`${totalPhotos} imagen(es)`} />
      <ReviewRow label="Insumos" value={`${supplies.length} item(s) — $${totalCost.toFixed(2)}`} />
      <ReviewRow label="Firma técnico" value={techSignatureUrl ? "✅ Capturada" : "❌ Pendiente"} />
      <ReviewRow label="Firma cliente" value={clientSignatureUrl ? "✅ Capturada" : "⚠️ Opcional"} />

      {observations && (
        <div className="p-3 bg-slate-50 rounded-xl">
          <p className="text-xs font-medium text-slate-500 mb-1">Observaciones</p>
          <p className="text-sm text-slate-700">{observations}</p>
        </div>
      )}

      {(!photos.before.length || !photos.during.length || !photos.after.length) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          ⚠️ Faltan fotos requeridas (Antes, Durante, Después)
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-100">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-700">{value}</span>
    </div>
  );
}
