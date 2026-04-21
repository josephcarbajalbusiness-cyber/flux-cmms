import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";
import { useData } from "@/hooks/useData";
import type {
  MaintenanceSchedule, Asset, Profile,
  ServiceType, Priority, FrequencyType, ChecklistItem,
} from "@/types/database";

// ── Configuración visual ────────────────────────────────────
const PRIORITY_CFG: Record<string, { label: string; color: string; dot: string; ring: string }> = {
  low:      { label: "Baja",    color: "bg-slate-100 text-slate-600",    dot: "#94a3b8", ring: "#e2e8f0" },
  normal:   { label: "Normal",  color: "bg-blue-50 text-blue-700",       dot: "#3b82f6", ring: "#bfdbfe" },
  high:     { label: "Alta",    color: "bg-amber-50 text-amber-700",     dot: "#f59e0b", ring: "#fde68a" },
  critical: { label: "Crítica", color: "bg-red-50 text-red-700",         dot: "#ef4444", ring: "#fecaca" },
};

const SERVICE_LABELS: Record<string, string> = {
  preventive: "Preventivo", corrective: "Correctivo",
  predictive: "Predictivo", installation: "Instalación",
};

const FREQ_LABELS: Record<string, string> = {
  daily: "Diario", weekly: "Semanal", monthly: "Mensual", custom: "Personalizado",
};

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  active:    { label: "Activo",   color: "bg-emerald-50 text-emerald-700" },
  paused:    { label: "Pausado",  color: "bg-amber-50 text-amber-700"    },
  completed: { label: "Cerrado",  color: "bg-slate-100 text-slate-500"   },
};

const EMPTY_SCHEDULE = {
  title: "", description: "", service_type: "preventive" as ServiceType,
  priority: "normal" as Priority, frequency_type: "monthly" as FrequencyType,
  frequency_value: 30, next_due_date: new Date().toISOString().split("T")[0],
  estimated_duration: 60 as number | null, asset_id: "", technician_id: "",
  checklist_template: [] as ChecklistItem[],
};

type View = "calendar" | "list";
type DaysUntil = "overdue" | "today" | "soon" | "ok";

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function dueBadge(days: number): { label: string; color: string; type: DaysUntil } {
  if (days < 0)  return { label: `Vencido hace ${Math.abs(days)}d`, color: "bg-red-100 text-red-700",    type: "overdue" };
  if (days === 0) return { label: "Hoy",                             color: "bg-red-50 text-red-600",     type: "today"   };
  if (days <= 7)  return { label: `En ${days} días`,                 color: "bg-amber-50 text-amber-700", type: "soon"    };
  return            { label: `En ${days} días`,                      color: "bg-slate-100 text-slate-500", type: "ok"     };
}

function freqLabel(s: MaintenanceSchedule): string {
  const base = `Cada ${s.frequency_value}`;
  const unit = { daily: "día(s)", weekly: "semana(s)", monthly: "mes(es)", custom: "día(s)" }[s.frequency_type];
  return `${base} ${unit}`;
}

// ── Calendario simple ───────────────────────────────────────
function CalendarView({ schedules, onSelect }: {
  schedules: MaintenanceSchedule[];
  onSelect: (s: MaintenanceSchedule) => void;
}) {
  const [cal, setCal] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  const firstDay = new Date(cal.year, cal.month, 1).getDay();
  const daysInMonth = new Date(cal.year, cal.month + 1, 0).getDate();
  const today = new Date();

  // Agrupar schedules por fecha
  const byDate: Record<string, MaintenanceSchedule[]> = {};
  schedules.forEach(s => {
    const d = new Date(s.next_due_date);
    if (d.getFullYear() === cal.year && d.getMonth() === cal.month) {
      const key = d.getDate().toString();
      byDate[key] = [...(byDate[key] ?? []), s];
    }
  });

  const prevMonth = () => setCal(c => {
    if (c.month === 0) return { year: c.year - 1, month: 11 };
    return { ...c, month: c.month - 1 };
  });
  const nextMonth = () => setCal(c => {
    if (c.month === 11) return { year: c.year + 1, month: 0 };
    return { ...c, month: c.month + 1 };
  });

  const monthName = new Date(cal.year, cal.month).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  return (
    <div className="card overflow-hidden">
      {/* Header del calendario */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">‹</button>
        <h3 className="font-semibold text-slate-800 capitalize">{monthName}</h3>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">›</button>
      </div>

      {/* Días de la semana */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {days.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400">{d}</div>
        ))}
      </div>

      {/* Grilla de días */}
      <div className="grid grid-cols-7">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-slate-50" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = today.getDate() === day && today.getMonth() === cal.month && today.getFullYear() === cal.year;
          const items = byDate[day.toString()] ?? [];

          return (
            <div key={day}
              className={`min-h-[80px] border-b border-r border-slate-50 p-1.5 ${isToday ? "bg-blue-50/40" : "hover:bg-slate-50"} transition-colors`}>
              <span className={`text-xs font-semibold inline-flex w-6 h-6 items-center justify-center rounded-full mb-1 ${
                isToday ? "bg-blue-600 text-white" : "text-slate-500"
              }`}>
                {day}
              </span>
              <div className="space-y-0.5">
                {items.slice(0, 3).map(s => {
                  const p = PRIORITY_CFG[s.priority];
                  return (
                    <button key={s.id} onClick={() => onSelect(s)}
                      className="w-full text-left truncate text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-opacity hover:opacity-80"
                      style={{ background: `${p.dot}20`, color: p.dot }}>
                      {s.title}
                    </button>
                  );
                })}
                {items.length > 3 && (
                  <p className="text-[10px] text-slate-400 pl-1">+{items.length - 3} más</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Componente principal ────────────────────────────────────
export default function SchedulingPage() {
  const { user } = useAuthStore();
  const [view, setView] = useState<View>("calendar");
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<MaintenanceSchedule | null>(null);
  const [editing, setEditing] = useState<typeof EMPTY_SCHEDULE & { id?: string }>(EMPTY_SCHEDULE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("active");
  const [newCheckItem, setNewCheckItem] = useState("");

  // Datos
  const schedFetcher = useCallback(async (): Promise<MaintenanceSchedule[]> => {
    const { data, error } = await supabase
      .from("maintenance_schedules")
      .select(`*, assets (id, name, location, category), profiles (id, full_name)`)
      .eq("tenant_id", user!.tenant.id)
      .order("next_due_date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(s => ({
      ...s,
      assets:   Array.isArray(s.assets)   ? s.assets[0]   : s.assets,
      profiles: Array.isArray(s.profiles) ? s.profiles[0] : s.profiles,
    })) as MaintenanceSchedule[];
  }, [user]);

  const assetsFetcher = useCallback(async (): Promise<Asset[]> => {
    const { data } = await supabase.from("assets").select("id,name,location,category")
      .eq("tenant_id", user!.tenant.id).order("name");
    return (data ?? []) as Asset[];
  }, [user]);

  const techsFetcher = useCallback(async (): Promise<Profile[]> => {
    const { data } = await supabase.from("profiles").select("id,full_name,role")
      .eq("tenant_id", user!.tenant.id).eq("is_active", true)
      .in("role", ["technician", "admin"]).order("full_name");
    return (data ?? []) as Profile[];
  }, [user]);

  const { data: schedules = [], refresh } = useData(schedFetcher);
  const { data: assets = [] } = useData(assetsFetcher);
  const { data: techs = [] } = useData(techsFetcher);

  const allSchedules = (schedules ?? []) as MaintenanceSchedule[];
  const filtered = filterStatus === "all"
    ? allSchedules
    : allSchedules.filter(s => s.status === filterStatus);

  // Stats
  const overdue = allSchedules.filter(s => s.status === "active" && daysUntil(s.next_due_date) < 0).length;
  const dueThisWeek = allSchedules.filter(s => s.status === "active" && daysUntil(s.next_due_date) >= 0 && daysUntil(s.next_due_date) <= 7).length;
  const activeCount = allSchedules.filter(s => s.status === "active").length;

  // Abrir modal nuevo
  const openNew = () => {
    setEditing({ ...EMPTY_SCHEDULE, next_due_date: new Date().toISOString().split("T")[0] });
    setFormError(null);
    setSelected(null);
    setShowModal(true);
  };

  // Abrir modal editar (desde tarjeta o calendario)
  const openEdit = (s: MaintenanceSchedule) => {
    setEditing({
      id: s.id,
      title: s.title,
      description: s.description ?? "",
      service_type: s.service_type,
      priority: s.priority,
      frequency_type: s.frequency_type,
      frequency_value: s.frequency_value,
      next_due_date: s.next_due_date,
      estimated_duration: s.estimated_duration ?? 60,
      asset_id: s.asset_id,
      technician_id: s.technician_id ?? "",
      checklist_template: s.checklist_template ?? [],
    });
    setFormError(null);
    setSelected(null);
    setShowModal(true);
  };

  // Guardar
  const handleSave = async () => {
    if (!editing.title.trim())    { setFormError("El título es obligatorio.");  return; }
    if (!editing.asset_id)        { setFormError("Selecciona un activo.");       return; }
    if (!editing.next_due_date)   { setFormError("La fecha de inicio es obligatoria."); return; }
    setSaving(true); setFormError(null);

    const payload = {
      tenant_id:          user!.tenant.id,
      asset_id:           editing.asset_id,
      technician_id:      editing.technician_id || null,
      title:              editing.title.trim(),
      description:        editing.description.trim() || null,
      service_type:       editing.service_type,
      priority:           editing.priority,
      frequency_type:     editing.frequency_type,
      frequency_value:    editing.frequency_value,
      next_due_date:      editing.next_due_date,
      estimated_duration: editing.estimated_duration || null,
      checklist_template: editing.checklist_template,
    };

    try {
      if (editing.id) {
        const { error } = await supabase.from("maintenance_schedules").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("maintenance_schedules").insert({ ...payload, status: "active" });
        if (error) throw error;
      }
      setShowModal(false);
      refresh();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  // Pausar / activar
  const toggleStatus = async (s: MaintenanceSchedule) => {
    const newStatus = s.status === "active" ? "paused" : "active";
    await supabase.from("maintenance_schedules").update({ status: newStatus }).eq("id", s.id);
    refresh();
  };

  // Marcar como hecho → avanza next_due_date
  const markDone = async (s: MaintenanceSchedule) => {
    if (!confirm(`¿Marcar "${s.title}" como realizado? La próxima fecha se calculará automáticamente.`)) return;
    await supabase.rpc("advance_schedule", { schedule_id: s.id });
    refresh();
  };

  // Eliminar
  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta programación?")) return;
    await supabase.from("maintenance_schedules").delete().eq("id", id);
    refresh();
  };

  // Checklist template helpers
  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    const item: ChecklistItem = {
      id: Date.now().toString(),
      label: newCheckItem.trim(),
      checked: false,
    };
    setEditing(p => ({ ...p, checklist_template: [...p.checklist_template, item] }));
    setNewCheckItem("");
  };
  const removeCheckItem = (id: string) => {
    setEditing(p => ({ ...p, checklist_template: p.checklist_template.filter(i => i.id !== id) }));
  };

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-6 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Planificación</h1>
            <p className="text-sm text-slate-400 mt-0.5">Calendario de mantenimiento preventivo</p>
          </div>
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <span>+</span> Nueva Programación
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Programaciones activas", value: activeCount,   icon: "📅", color: "bg-blue-50"    },
            { label: "Vencidas",               value: overdue,       icon: "🔴", color: "bg-red-50"     },
            { label: "Esta semana",            value: dueThisWeek,   icon: "⏰", color: "bg-amber-50"   },
            { label: "Total programadas",      value: allSchedules.length, icon: "📋", color: "bg-slate-50" },
          ].map(k => (
            <div key={k.label} className={`${k.color} rounded-2xl p-4 border border-slate-100`}>
              <span className="text-2xl block mb-2">{k.icon}</span>
              <p className="text-2xl font-bold text-slate-800">{k.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Alertas de vencidos */}
        {overdue > 0 && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <span className="text-red-500 text-xl flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-800">
                {overdue} mantenimiento{overdue > 1 ? "s" : ""} vencido{overdue > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Revisa las programaciones marcadas en rojo y agenda los servicios pendientes.
              </p>
            </div>
          </div>
        )}

        {/* Controles de vista */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            {(["calendar", "list"] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  view === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}>
                {v === "calendar" ? "📅 Calendario" : "☰ Lista"}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {["all", "active", "paused"].map(st => (
              <button key={st} onClick={() => setFilterStatus(st)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  filterStatus === st
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {st === "all" ? "Todos" : st === "active" ? "Activos" : "Pausados"}
              </button>
            ))}
          </div>
        </div>

        {/* Vista Calendario */}
        {view === "calendar" && (
          <CalendarView
            schedules={filtered}
            onSelect={s => { setSelected(s); }}
          />
        )}

        {/* Popup detalle desde calendario */}
        {selected && view === "calendar" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-slate-800">{selected.title}</h3>
                <button onClick={() => setSelected(null)} className="text-slate-400 text-xl">✕</button>
              </div>
              <div className="space-y-2 text-sm">
                <p className="text-slate-500">📍 {(selected.assets as Asset | null)?.name} — {(selected.assets as Asset | null)?.location}</p>
                <p className="text-slate-500">👷 {(selected.profiles as Profile | null)?.full_name ?? "Sin asignar"}</p>
                <p className="text-slate-500">🔁 {freqLabel(selected)}</p>
                {selected.estimated_duration && <p className="text-slate-500">⏱ {selected.estimated_duration} min estimados</p>}
                <div className="flex gap-2 flex-wrap">
                  <span className={`badge ${PRIORITY_CFG[selected.priority].color}`}>{PRIORITY_CFG[selected.priority].label}</span>
                  <span className="badge bg-slate-100 text-slate-600">{SERVICE_LABELS[selected.service_type]}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { openEdit(selected); setSelected(null); }}
                  className="btn-secondary flex-1 text-sm">✏️ Editar</button>
                <button onClick={() => { markDone(selected); setSelected(null); }}
                  className="btn-primary flex-1 text-sm">✅ Marcar hecho</button>
              </div>
            </div>
          </div>
        )}

        {/* Vista Lista */}
        {view === "list" && (
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="card p-16 text-center text-slate-400">
                <p className="text-5xl mb-3">📅</p>
                <p className="font-medium">No hay programaciones</p>
                <p className="text-sm mt-1">Crea tu primer plan de mantenimiento preventivo</p>
              </div>
            ) : filtered.map(s => {
              const days = daysUntil(s.next_due_date);
              const badge = dueBadge(days);
              const p = PRIORITY_CFG[s.priority];
              const asset = s.assets as Asset | null;
              const tech  = s.profiles as Profile | null;

              return (
                <div key={s.id}
                  className={`card p-4 border-l-4 transition-opacity ${s.status === "paused" ? "opacity-60" : ""}`}
                  style={{ borderLeftColor: p.dot }}>
                  <div className="flex items-start gap-4">
                    {/* Indicador días */}
                    <div className="flex-shrink-0 w-14 text-center">
                      <p className={`text-2xl font-bold ${
                        days < 0 ? "text-red-600" : days === 0 ? "text-red-500" : days <= 7 ? "text-amber-500" : "text-slate-700"
                      }`}>
                        {days < 0 ? Math.abs(days) : days}
                      </p>
                      <p className="text-xs text-slate-400">{days < 0 ? "vencido" : days === 0 ? "hoy" : "días"}</p>
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-slate-800">{s.title}</p>
                        <span className={`badge ${STATUS_CFG[s.status].color}`}>{STATUS_CFG[s.status].label}</span>
                        <span className={`badge ${p.color}`}>{p.label}</span>
                        <span className={`badge ${badge.color}`}>{badge.label}</span>
                      </div>
                      <p className="text-xs text-slate-500 mb-1">
                        ⚙️ {asset?.name ?? "—"}  ·  📍 {asset?.location ?? "—"}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                        <span>👷 {tech?.full_name ?? "Sin asignar"}</span>
                        <span>🔁 {freqLabel(s)}</span>
                        <span>📅 Próximo: {new Date(s.next_due_date).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        {s.estimated_duration && <span>⏱ {s.estimated_duration} min</span>}
                        {s.checklist_template?.length > 0 && <span>☑️ {s.checklist_template.length} puntos</span>}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => markDone(s)}
                        title="Marcar como realizado"
                        className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors text-sm">✅</button>
                      <button onClick={() => toggleStatus(s)}
                        title={s.status === "active" ? "Pausar" : "Activar"}
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500 transition-colors text-sm">
                        {s.status === "active" ? "⏸" : "▶️"}
                      </button>
                      <button onClick={() => openEdit(s)}
                        title="Editar"
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors text-sm">✏️</button>
                      <button onClick={() => handleDelete(s.id)}
                        title="Eliminar"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors text-sm">🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal crear / editar ─────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-slate-800">
                {editing.id ? "✏️ Editar Programación" : "📅 Nueva Programación"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{formError}</div>
              )}

              {/* Título */}
              <Field label="Título *">
                <input value={editing.title} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
                  placeholder="Ej: Revisión mensual compresor A" className="input" />
              </Field>

              {/* Activo */}
              <Field label="Activo *">
                <select value={editing.asset_id} onChange={e => setEditing(p => ({ ...p, asset_id: e.target.value }))} className="input">
                  <option value="">Seleccionar activo...</option>
                  {(assets ?? []).map(a => (
                    <option key={a.id} value={a.id}>{a.name} — {a.location}</option>
                  ))}
                </select>
              </Field>

              {/* Técnico asignado */}
              <Field label="Técnico responsable">
                <select value={editing.technician_id} onChange={e => setEditing(p => ({ ...p, technician_id: e.target.value }))} className="input">
                  <option value="">Sin asignar</option>
                  {(techs ?? []).map(t => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                {/* Tipo de servicio */}
                <Field label="Tipo">
                  <select value={editing.service_type} onChange={e => setEditing(p => ({ ...p, service_type: e.target.value as ServiceType }))} className="input">
                    {Object.entries(SERVICE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                {/* Prioridad */}
                <Field label="Prioridad">
                  <select value={editing.priority} onChange={e => setEditing(p => ({ ...p, priority: e.target.value as Priority }))} className="input">
                    <option value="low">Baja</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </Field>
              </div>

              {/* Recurrencia */}
              <div className="p-4 bg-blue-50 rounded-xl space-y-3 border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">🔁 Recurrencia</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Frecuencia">
                    <select value={editing.frequency_type}
                      onChange={e => setEditing(p => ({ ...p, frequency_type: e.target.value as FrequencyType }))} className="input">
                      {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Cada cuánto">
                    <input type="number" min={1} value={editing.frequency_value}
                      onChange={e => setEditing(p => ({ ...p, frequency_value: parseInt(e.target.value) || 1 }))}
                      className="input" />
                  </Field>
                </div>
                <p className="text-xs text-blue-600">
                  → Se repetirá cada <strong>{editing.frequency_value} {FREQ_LABELS[editing.frequency_type].toLowerCase()}</strong>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Primera fecha / Próximo *">
                  <input type="date" value={editing.next_due_date}
                    onChange={e => setEditing(p => ({ ...p, next_due_date: e.target.value }))} className="input" />
                </Field>
                <Field label="Duración estimada (min)">
                  <input type="number" min={1} value={editing.estimated_duration ?? ""}
                    onChange={e => setEditing(p => ({ ...p, estimated_duration: parseInt(e.target.value) || null }))}
                    placeholder="60" className="input" />
                </Field>
              </div>

              <Field label="Descripción">
                <textarea value={editing.description} rows={2}
                  onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                  className="input resize-none" placeholder="Pasos generales o notas..." />
              </Field>

              {/* Checklist template */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block">
                  ☑️ Checklist de inspección ({editing.checklist_template.length} puntos)
                </label>
                <div className="flex gap-2">
                  <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCheckItem()}
                    placeholder="Ej: Verificar nivel de aceite..." className="input flex-1 text-sm" />
                  <button onClick={addCheckItem} className="btn-secondary px-3 text-sm">+ Añadir</button>
                </div>
                {editing.checklist_template.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {editing.checklist_template.map(item => (
                      <div key={item.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                        <span className="text-slate-400 text-xs">☐</span>
                        <span className="flex-1 text-sm text-slate-700">{item.label}</span>
                        <button onClick={() => removeCheckItem(item.id)}
                          className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t sticky bottom-0 bg-white">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? "Guardando..." : editing.id ? "Guardar Cambios" : "Crear Programación"}
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
