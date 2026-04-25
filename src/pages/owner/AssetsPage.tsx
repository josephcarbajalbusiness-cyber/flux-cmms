import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";
import { useData } from "@/hooks/useData";
import type { Asset } from "@/types/database";

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  operational:       { label: "Operativo",        color: "bg-emerald-50 text-emerald-700", dot: "#10b981" },
  under_maintenance: { label: "En mantenimiento", color: "bg-amber-50 text-amber-700",    dot: "#f59e0b" },
  out_of_service:    { label: "Fuera de servicio",color: "bg-red-50 text-red-600",        dot: "#ef4444" },
};

const EMPTY: Partial<Asset> = {
  name: "", location: "", category: "", serial_number: "",
  manufacturer: "", model: "", status: "operational", description: "",
  qr_code: "",
};

export default function AssetsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Asset>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [autoOtAsset, setAutoOtAsset] = useState<{ id: string; name: string } | null>(null);
  const [creatingOt, setCreatingOt] = useState(false);

  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("tenant_id", user!.tenant.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Asset[];
  }, [user]);

  const { data: assets = [], loading, refresh } = useData(fetcher);

  const filtered = (assets ?? []).filter(a =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.location.toLowerCase().includes(search.toLowerCase()) ||
    (a.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditing({ ...EMPTY, qr_code: `ASSET-${Date.now()}` });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (asset: Asset) => {
    setEditing({ ...asset });
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editing.name?.trim() || !editing.location?.trim()) {
      setFormError("Nombre y ubicación son obligatorios.");
      return;
    }
    setSaving(true); setFormError(null);
    try {
      const previousStatus = editing.id
        ? (assets ?? []).find((a) => a.id === editing.id)?.status
        : null;

      if (editing.id) {
        const { error } = await supabase.from("assets").update(editing).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("assets").insert({ ...editing, tenant_id: user!.tenant.id });
        if (error) throw error;
      }
      setShowModal(false);
      refresh();

      // Auto-OT: si el activo cambió a fuera de servicio, preguntar si crear OT
      if (
        editing.id &&
        editing.status === "out_of_service" &&
        previousStatus !== "out_of_service"
      ) {
        setAutoOtAsset({ id: editing.id, name: editing.name! });
      }
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const createAutoOt = async () => {
    if (!autoOtAsset || !user) return;
    setCreatingOt(true);
    try {
      // Generate report number
      const reportNumber = `OT-AUTO-${Date.now().toString().slice(-6)}`;

      const { data, error } = await supabase
        .from("service_reports")
        .insert({
          tenant_id: user.tenant.id,
          asset_id: autoOtAsset.id,
          technician_id: user.profile.id,
          report_number: reportNumber,
          service_type: "corrective",
          priority: "high",
          status: "draft",
          notes: `Orden de trabajo generada automáticamente por cambio de estado del activo "${autoOtAsset.name}" a "Fuera de servicio".`,
        })
        .select("id")
        .single();

      if (error) throw error;
      setAutoOtAsset(null);
      // Navigate to the new report
      navigate(`/owner/reports/${data.id}`);
    } catch (e) {
      alert(`Error al crear OT: ${(e as Error).message}`);
    } finally {
      setCreatingOt(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este activo?")) return;
    await supabase.from("assets").delete().eq("id", id);
    refresh();
  };

  const stats = {
    total: (assets ?? []).length,
    operational: (assets ?? []).filter(a => a.status === "operational").length,
    maintenance:  (assets ?? []).filter(a => a.status === "under_maintenance").length,
    outOfService: (assets ?? []).filter(a => a.status === "out_of_service").length,
  };

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-6 max-w-screen-xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Activos / Equipos</h1>
            <p className="text-sm text-slate-400 mt-0.5">{stats.total} equipos registrados</p>
          </div>
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <span>+</span> Nuevo Activo
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total",            value: stats.total,        color: "bg-slate-50",   icon: "⚙" },
            { label: "Operativos",       value: stats.operational,  color: "bg-emerald-50", icon: "✅" },
            { label: "En Mantenimiento", value: stats.maintenance,  color: "bg-amber-50",   icon: "🔧" },
            { label: "Fuera de Servicio",value: stats.outOfService, color: "bg-red-50",     icon: "🚫" },
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
          <div className="p-4 border-b border-slate-100 flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, ubicación o categoría..." className="input pl-8" />
            </div>
            <button onClick={refresh} className="btn-secondary text-xs px-3 py-2">↻ Actualizar</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Activo", "Ubicación", "Categoría", "Código QR", "Último Servicio", "Estado", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-3 text-slate-400">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Cargando activos...
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-400">
                    <p className="text-4xl mb-3">⚙</p>
                    <p className="font-medium">{search ? "Sin resultados" : "No hay activos registrados"}</p>
                    <p className="text-sm mt-1">{search ? "Intenta con otro término" : "Agrega tu primer equipo"}</p>
                  </td></tr>
                ) : filtered.map(asset => {
                  const st = STATUS_CONFIG[asset.status];
                  return (
                    <tr key={asset.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 text-sm">{asset.name}</p>
                        {asset.model && <p className="text-xs text-slate-400">{asset.manufacturer} · {asset.model}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">{asset.location}</td>
                      <td className="px-4 py-3.5">
                        {asset.category && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{asset.category}</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded-lg text-slate-600">{asset.qr_code}</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        {asset.last_service_at
                          ? new Date(asset.last_service_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                          : <span className="text-slate-300">Sin servicio</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`badge ${st.color} flex items-center gap-1.5 w-fit`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(asset)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 text-sm">✏️</button>
                          <button onClick={() => handleDelete(asset.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-400 text-sm">🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-slate-800">{editing.id ? "Editar Activo" : "Nuevo Activo"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{formError}</div>}
              <Field label="Nombre del Equipo *">
                <input value={editing.name ?? ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="Compresor Industrial A1" className="input" />
              </Field>
              <Field label="Ubicación *">
                <input value={editing.location ?? ""} onChange={e => setEditing(p => ({ ...p, location: e.target.value }))} placeholder="Planta 2 — Sección B" className="input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Categoría">
                  <select value={editing.category ?? ""} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))} className="input">
                    <option value="">Seleccionar...</option>
                    {["Eléctrico","Mecánico","HVAC","Hidráulico","Neumático","Electrónico"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Estado">
                  <select value={editing.status ?? "operational"} onChange={e => setEditing(p => ({ ...p, status: e.target.value as Asset["status"] }))} className="input">
                    <option value="operational">Operativo</option>
                    <option value="under_maintenance">En mantenimiento</option>
                    <option value="out_of_service">Fuera de servicio</option>
                  </select>
                </Field>
                <Field label="Fabricante">
                  <input value={editing.manufacturer ?? ""} onChange={e => setEditing(p => ({ ...p, manufacturer: e.target.value }))} placeholder="Siemens, ABB..." className="input" />
                </Field>
                <Field label="Modelo">
                  <input value={editing.model ?? ""} onChange={e => setEditing(p => ({ ...p, model: e.target.value }))} placeholder="XR-2000" className="input" />
                </Field>
                <Field label="N° Serie">
                  <input value={editing.serial_number ?? ""} onChange={e => setEditing(p => ({ ...p, serial_number: e.target.value }))} placeholder="SN-12345" className="input" />
                </Field>
                <Field label="Código QR">
                  <input value={editing.qr_code ?? ""} onChange={e => setEditing(p => ({ ...p, qr_code: e.target.value }))} placeholder="ASSET-001" className="input font-mono text-xs" />
                </Field>
              </div>
              <Field label="Descripción">
                <textarea value={editing.description ?? ""} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} rows={2} className="input resize-none" />
              </Field>
            </div>
            <div className="flex gap-3 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? "Guardando..." : editing.id ? "Guardar Cambios" : "Crear Activo"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Auto-OT Confirmation Modal */}
      {autoOtAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-2xl flex-shrink-0">
                🚨
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-lg">Activo fuera de servicio</h2>
                <p className="text-slate-500 text-sm mt-1">
                  <span className="font-semibold text-slate-700">"{autoOtAsset.name}"</span> fue marcado como{" "}
                  <span className="text-red-600 font-semibold">Fuera de servicio</span>.
                  ¿Deseas crear una Orden de Trabajo correctiva automáticamente?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <span>🔧</span><span>Tipo: <strong>Correctivo</strong></span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <span>🔴</span><span>Prioridad: <strong>Alta</strong></span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <span>📋</span><span>Estado inicial: <strong>Borrador</strong></span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setAutoOtAsset(null)}
                className="btn-secondary flex-1"
              >
                No, omitir
              </button>
              <button
                onClick={createAutoOt}
                disabled={creatingOt}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50"
              >
                {creatingOt ? "Creando OT..." : "✓ Crear OT automática"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
