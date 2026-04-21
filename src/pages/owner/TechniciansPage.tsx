import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";
import { useData } from "@/hooks/useData";
import type { Profile } from "@/types/database";

interface TechWithStats extends Profile {
  total_reports: number;
  completed_reports: number;
  last_report_at: string | null;
}

const ROLE_BADGE: Record<string, string> = {
  owner:      "bg-purple-50 text-purple-700",
  admin:      "bg-blue-50 text-blue-700",
  technician: "bg-slate-100 text-slate-600",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario", admin: "Administrador", technician: "Técnico",
};

export default function TechniciansPage() {
  const { user } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Profile> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetcher = useCallback(async (): Promise<TechWithStats[]> => {
    // Perfiles reales del tenant
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("tenant_id", user!.tenant.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Stats de reportes por técnico
    const { data: reports } = await supabase
      .from("service_reports")
      .select("technician_id, status, created_at")
      .eq("tenant_id", user!.tenant.id);

    const statsMap: Record<string, { total: number; completed: number; last: string | null }> = {};
    (reports ?? []).forEach(r => {
      if (!statsMap[r.technician_id]) statsMap[r.technician_id] = { total: 0, completed: 0, last: null };
      statsMap[r.technician_id].total++;
      if (r.status === "completed") statsMap[r.technician_id].completed++;
      if (!statsMap[r.technician_id].last || r.created_at > statsMap[r.technician_id].last!) {
        statsMap[r.technician_id].last = r.created_at;
      }
    });

    return (profiles ?? []).map(p => ({
      ...p,
      total_reports: statsMap[p.id]?.total ?? 0,
      completed_reports: statsMap[p.id]?.completed ?? 0,
      last_report_at: statsMap[p.id]?.last ?? null,
    })) as TechWithStats[];
  }, [user]);

  const { data: technicians = [], loading, refresh } = useData(fetcher);

  const filtered = (technicians ?? []).filter(t =>
    !search ||
    t.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (t.phone ?? "").includes(search) ||
    t.role.includes(search.toLowerCase())
  );

  const openEdit = (tech: TechWithStats) => {
    setEditing({ ...tech });
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editing?.full_name?.trim()) { setFormError("El nombre es obligatorio."); return; }
    setSaving(true); setFormError(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editing.full_name,
          phone: editing.phone || null,
          role: editing.role,
        })
        .eq("id", editing.id!)
        .eq("tenant_id", user!.tenant.id);
      if (error) throw error;
      setShowModal(false);
      refresh();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (tech: TechWithStats) => {
    if (tech.id === user?.id) return; // No desactivarse a sí mismo
    await supabase
      .from("profiles")
      .update({ is_active: !tech.is_active })
      .eq("id", tech.id);
    refresh();
  };

  const totalTechs    = (technicians ?? []).filter(t => t.role === "technician").length;
  const activeTechs   = (technicians ?? []).filter(t => t.role === "technician" && t.is_active).length;
  const totalReports  = (technicians ?? []).reduce((a, t) => a + t.total_reports, 0);
  const totalClosed   = (technicians ?? []).reduce((a, t) => a + t.completed_reports, 0);

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Equipo Técnico</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Usuarios registrados en tu cuenta de Supabase
            </p>
          </div>
          <button onClick={refresh} className="btn-secondary flex items-center gap-2">
            ↻ Actualizar
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Usuarios",  value: (technicians ?? []).length, icon: "👥", color: "bg-slate-50" },
            { label: "Técnicos Activos",value: activeTechs,                icon: "👷", color: "bg-blue-50"  },
            { label: "Reportes Total",  value: totalReports,               icon: "📋", color: "bg-purple-50"},
            { label: "Tasa de Cierre",  value: `${totalReports > 0 ? Math.round((totalClosed/totalReports)*100) : 0}%`, icon: "✅", color: "bg-emerald-50"},
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-2xl p-4 border border-slate-100`}>
              <span className="text-2xl block mb-2">{s.icon}</span>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Info para agregar técnicos */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
          <span className="text-blue-500 text-xl flex-shrink-0">ℹ</span>
          <div>
            <p className="text-sm font-semibold text-blue-800">¿Cómo agregar un técnico?</p>
            <p className="text-sm text-blue-600 mt-0.5">
              Ve a tu panel de Supabase → <strong>Authentication → Users → Add user</strong>.
              Crea el usuario con su email, luego ejecuta en SQL Editor:
            </p>
            <code className="block mt-2 text-xs bg-blue-100 text-blue-800 px-3 py-2 rounded-lg font-mono">
              INSERT INTO profiles (id, tenant_id, full_name, role) VALUES ('UUID-AUTH', '{user?.tenant.id}', 'Nombre', 'technician');
            </code>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar técnico..." className="input pl-8" />
        </div>

        {/* Grid de tarjetas */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Cargando equipo...
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-16 text-center text-slate-400">
            <p className="text-5xl mb-3">👥</p>
            <p className="font-medium">No hay usuarios registrados</p>
            <p className="text-sm mt-1">Crea usuarios desde el panel de Supabase Authentication</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(tech => {
              const rate = tech.total_reports > 0
                ? Math.round((tech.completed_reports / tech.total_reports) * 100) : 0;
              const rateColor = rate >= 80 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";
              const isSelf = tech.id === user?.id;

              return (
                <div key={tech.id}
                  className={`card p-5 space-y-4 transition-opacity ${!tech.is_active ? "opacity-60" : ""}`}>

                  {/* Avatar + info + toggle */}
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-sm"
                      style={{ background: `hsl(${(tech.full_name.charCodeAt(0) * 47) % 360}, 55%, 48%)` }}>
                      {tech.full_name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm truncate">{tech.full_name}</p>
                        {isSelf && <span className="text-xs text-blue-500">(tú)</span>}
                      </div>
                      <span className={`badge ${ROLE_BADGE[tech.role]} mt-1 inline-block`}>
                        {ROLE_LABELS[tech.role]}
                      </span>
                      {tech.phone && (
                        <p className="text-xs text-slate-400 mt-1">📞 {tech.phone}</p>
                      )}
                    </div>

                    {/* Toggle activo/inactivo */}
                    {!isSelf && (
                      <button
                        onClick={() => toggleActive(tech)}
                        title={tech.is_active ? "Desactivar" : "Activar"}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                          tech.is_active ? "bg-blue-500" : "bg-slate-200"
                        }`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          tech.is_active ? "translate-x-5" : "translate-x-0.5"
                        }`} />
                      </button>
                    )}
                  </div>

                  {/* Estadísticas */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-xl p-2">
                      <p className="text-lg font-bold text-slate-800">{tech.total_reports}</p>
                      <p className="text-xs text-slate-400">Total</p>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-2">
                      <p className="text-lg font-bold text-emerald-700">{tech.completed_reports}</p>
                      <p className="text-xs text-slate-400">Cerrados</p>
                    </div>
                    <div className="rounded-xl p-2" style={{ background: `${rateColor}15` }}>
                      <p className="text-lg font-bold" style={{ color: rateColor }}>{rate}%</p>
                      <p className="text-xs text-slate-400">Eficacia</p>
                    </div>
                  </div>

                  {/* Barra de eficacia */}
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${rate}%`, background: rateColor }} />
                  </div>

                  {/* Último reporte */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">
                      {tech.last_report_at
                        ? `Último: ${new Date(tech.last_report_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`
                        : "Sin reportes aún"}
                    </p>
                    <button
                      onClick={() => openEdit(tech)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-blue-50"
                    >
                      ✏️ Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal editar */}
      {showModal && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-slate-800">Editar Perfil</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{formError}</div>
              )}

              {/* Avatar preview */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
                  style={{ background: `hsl(${((editing.full_name ?? "A").charCodeAt(0) * 47) % 360}, 55%, 48%)` }}>
                  {(editing.full_name ?? "?")[0]?.toUpperCase()}
                </div>
                <p className="text-sm text-slate-500">ID: <span className="font-mono text-xs">{editing.id?.slice(0, 8)}...</span></p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Nombre Completo *</label>
                <input value={editing.full_name ?? ""} onChange={e => setEditing(p => ({ ...p!, full_name: e.target.value }))}
                  className="input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Teléfono</label>
                <input value={editing.phone ?? ""} onChange={e => setEditing(p => ({ ...p!, phone: e.target.value }))}
                  placeholder="+52 55 0000 0000" className="input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Rol</label>
                <select value={editing.role ?? "technician"}
                  onChange={e => setEditing(p => ({ ...p!, role: e.target.value as Profile["role"] }))}
                  className="input">
                  <option value="technician">Técnico</option>
                  <option value="admin">Administrador</option>
                  <option value="owner">Propietario</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
