import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";
import { useData } from "@/hooks/useData";
import type { ChecklistTemplate, ChecklistItem } from "@/types/database";

const CATEGORIES = ["General", "Eléctrico", "Mecánico", "HVAC", "Hidráulico", "Neumático", "Electrónico"];
const ICONS = ["🔧", "⚡", "❄️", "💧", "⚙️", "📋", "🔩", "🛠️", "🔌", "🏭"];

const EMPTY = {
  name: "", description: "" as string, category: "General", icon: "🔧",
  items: [] as ChecklistItem[], is_global: false,
};

export default function ChecklistTemplatesPage() {
  const { user } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<typeof EMPTY & { id?: string }>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetcher = useCallback(async (): Promise<ChecklistTemplate[]> => {
    const { data, error } = await supabase
      .from("checklist_templates")
      .select("*")
      .eq("tenant_id", user!.tenant.id)
      .order("category").order("name");
    if (error) throw error;
    return (data ?? []) as ChecklistTemplate[];
  }, [user]);

  const { data: templates = [], loading, error: fetchError, refresh } = useData(fetcher);
  const allTemplates = (templates ?? []) as ChecklistTemplate[];

  const filtered = allTemplates.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === "all" || t.category === filterCategory;
    return matchSearch && matchCat;
  });

  // Agrupar por categoría
  const byCategory: Record<string, ChecklistTemplate[]> = {};
  filtered.forEach(t => {
    byCategory[t.category] = [...(byCategory[t.category] ?? []), t];
  });

  // Cargar plantillas predefinidas del sistema
  const seedTemplates = async () => {
    if (!confirm("¿Cargar las 6 plantillas predefinidas del sistema? Solo se agregarán si no existen.")) return;
    setSeeding(true);
    try {
      await supabase.rpc("seed_checklist_templates", { p_tenant_id: user!.tenant.id });
      refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  // Abrir modal nuevo
  const openNew = () => {
    setEditing({ ...EMPTY });
    setNewItemLabel("");
    setFormError(null);
    setShowModal(true);
  };

  // Abrir modal editar
  const openEdit = (t: ChecklistTemplate) => {
    setEditing({ id: t.id, name: t.name, description: t.description ?? "", category: t.category, icon: t.icon, items: [...t.items], is_global: t.is_global });
    setNewItemLabel("");
    setFormError(null);
    setShowModal(true);
  };

  // Guardar
  const handleSave = async () => {
    if (!editing.name.trim())        { setFormError("El nombre es obligatorio."); return; }
    if (editing.items.length === 0)  { setFormError("Agrega al menos un punto de inspección."); return; }
    setSaving(true); setFormError(null);

    const payload = {
      tenant_id:   user!.tenant.id,
      name:        editing.name.trim(),
      description: editing.description.trim() || null,
      category:    editing.category,
      icon:        editing.icon,
      items:       editing.items,
      is_global:   false,
    };

    try {
      if (editing.id) {
        const { error } = await supabase.from("checklist_templates").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("checklist_templates").insert(payload);
        if (error) throw error;
      }
      setShowModal(false);
      refresh();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  // Eliminar
  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla? Los reportes existentes no se verán afectados.")) return;
    await supabase.from("checklist_templates").delete().eq("id", id);
    refresh();
  };

  // Duplicar
  const handleDuplicate = async (t: ChecklistTemplate) => {
    await supabase.from("checklist_templates").insert({
      tenant_id: user!.tenant.id,
      name: `${t.name} (copia)`,
      description: t.description,
      category: t.category,
      icon: t.icon,
      items: t.items,
      is_global: false,
    });
    refresh();
  };

  // Items del checklist en edición
  const addItem = () => {
    if (!newItemLabel.trim()) return;
    const item: ChecklistItem = { id: Date.now().toString(), label: newItemLabel.trim(), checked: false };
    setEditing(p => ({ ...p, items: [...p.items, item] }));
    setNewItemLabel("");
  };
  const removeItem = (id: string) => setEditing(p => ({ ...p, items: p.items.filter(i => i.id !== id) }));
  const moveItem = (index: number, dir: -1 | 1) => {
    const items = [...editing.items];
    const swap = index + dir;
    if (swap < 0 || swap >= items.length) return;
    [items[index], items[swap]] = [items[swap], items[index]];
    setEditing(p => ({ ...p, items }));
  };

  return (
    <Layout>
      <div className="p-4 lg:p-6 space-y-6 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Plantillas de Checklist</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {allTemplates.length} plantilla{allTemplates.length !== 1 ? "s" : ""} · Los técnicos las seleccionan al crear reportes
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={seedTemplates} disabled={seeding}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50">
              {seeding ? "Cargando..." : "⬇ Cargar predefinidas"}
            </button>
            <button onClick={openNew} className="btn-primary flex items-center gap-2">
              <span>+</span> Nueva Plantilla
            </button>
          </div>
        </div>

        {/* Stats por categoría */}
        {allTemplates.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.filter(c => allTemplates.some(t => t.category === c)).map(c => (
              <button key={c}
                onClick={() => setFilterCategory(filterCategory === c ? "all" : c)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all border ${
                  filterCategory === c
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                }`}>
                {c} ({allTemplates.filter(t => t.category === c).length})
              </button>
            ))}
          </div>
        )}

        {/* Buscador */}
        <div className="relative max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plantilla..." className="input pl-8" />
        </div>

        {/* Error de carga */}
        {fetchError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
            ⚠️ {fetchError} — Es posible que la tabla no exista aún. Ejecuta el SQL de migración en Supabase.
          </div>
        )}

        {/* Estado vacío */}
        {!loading && allTemplates.length === 0 && (
          <div className="card p-16 text-center text-slate-400 space-y-4">
            <p className="text-5xl">☑️</p>
            <div>
              <p className="font-medium text-slate-600">Sin plantillas todavía</p>
              <p className="text-sm mt-1">Carga las plantillas predefinidas del sistema o crea las tuyas</p>
            </div>
            <button onClick={seedTemplates} disabled={seeding}
              className="btn-primary mx-auto flex items-center gap-2 disabled:opacity-50">
              {seeding ? "Cargando..." : "⬇ Cargar plantillas predefinidas"}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Cargando plantillas...
          </div>
        )}

        {/* Plantillas agrupadas por categoría */}
        {Object.entries(byCategory).map(([category, items]) => (
          <div key={category} className="space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
              {category} ({items.length})
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {items.map(t => (
                <div key={t.id} className="card overflow-hidden">
                  {/* Cabecera tarjeta */}
                  <div className="flex items-start gap-3 p-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">
                      {t.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">{t.name}</p>
                        <span className="badge bg-slate-100 text-slate-500 text-xs">{t.category}</span>
                        <span className="badge bg-blue-50 text-blue-600 text-xs">
                          {t.items.length} puntos
                        </span>
                      </div>
                      {t.description && (
                        <p className="text-xs text-slate-400 mt-1 truncate">{t.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-sm transition-colors"
                        title="Ver puntos">
                        {expandedId === t.id ? "▲" : "▼"}
                      </button>
                      <button onClick={() => handleDuplicate(t)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-sm transition-colors"
                        title="Duplicar">⧉</button>
                      <button onClick={() => openEdit(t)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 text-sm transition-colors"
                        title="Editar">✏️</button>
                      <button onClick={() => handleDelete(t.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 text-sm transition-colors"
                        title="Eliminar">🗑</button>
                    </div>
                  </div>

                  {/* Lista de puntos expandible */}
                  {expandedId === t.id && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-1.5 bg-slate-50">
                      {t.items.map((item, idx) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                          <span className="text-xs text-slate-600">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal crear / editar ─────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-slate-800">
                {editing.id ? "✏️ Editar Plantilla" : "✨ Nueva Plantilla"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{formError}</div>
              )}

              {/* Nombre */}
              <div>
                <label className="label-field">Nombre de la plantilla *</label>
                <input value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Revisión mensual compresor" className="input" />
              </div>

              {/* Categoría e ícono */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-field">Categoría</label>
                  <select value={editing.category} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))} className="input">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-field">Ícono</label>
                  <div className="flex gap-1 flex-wrap">
                    {ICONS.map(icon => (
                      <button key={icon} type="button"
                        onClick={() => setEditing(p => ({ ...p, icon }))}
                        className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all ${
                          editing.icon === icon ? "bg-blue-100 ring-2 ring-blue-400" : "hover:bg-slate-100"
                        }`}>
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="label-field">Descripción</label>
                <textarea value={editing.description ?? ""} rows={2}
                  onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                  className="input resize-none" placeholder="¿Para qué tipo de equipo o servicio es esta plantilla?" />
              </div>

              {/* Items del checklist */}
              <div className="space-y-2">
                <label className="label-field">
                  Puntos de inspección ({editing.items.length})
                </label>

                {/* Input nuevo item */}
                <div className="flex gap-2">
                  <input value={newItemLabel}
                    onChange={e => setNewItemLabel(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addItem())}
                    placeholder="Ej: Verificar nivel de aceite..." className="input flex-1 text-sm" />
                  <button onClick={addItem} className="btn-primary px-3 text-sm">+ Añadir</button>
                </div>

                {/* Lista editable */}
                {editing.items.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 border-2 border-dashed border-slate-200 rounded-xl">
                    Agrega puntos de inspección usando el campo de arriba
                  </p>
                ) : (
                  <div className="space-y-1 max-h-56 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50">
                    {editing.items.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
                        <span className="text-xs text-slate-400 w-5 text-right flex-shrink-0">{idx + 1}</span>
                        <span className="flex-1 text-sm text-slate-700">{item.label}</span>
                        <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                          className="text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs px-1">↑</button>
                        <button onClick={() => moveItem(idx, 1)} disabled={idx === editing.items.length - 1}
                          className="text-slate-300 hover:text-slate-500 disabled:opacity-30 text-xs px-1">↓</button>
                        <button onClick={() => removeItem(item.id)}
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
                {saving ? "Guardando..." : editing.id ? "Guardar Cambios" : "Crear Plantilla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
