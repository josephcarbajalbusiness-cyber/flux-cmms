import { useState, useRef } from "react";
import { supabase, uploadFile, STORAGE_BUCKETS } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/shared/Layout";

export default function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"company" | "profile" | "security">("company");

  // Company
  const [companyName, setCompanyName] = useState(user?.tenant.name ?? "");
  const [plan] = useState(user?.tenant.plan ?? "starter");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(user?.tenant.logo_url ?? "");
  const logoRef = useRef<HTMLInputElement>(null);

  // Profile
  const [fullName, setFullName] = useState(user?.profile.full_name ?? "");
  const [phone, setPhone] = useState(user?.profile.phone ?? "");

  // Security
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMsg = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const path = `${user!.tenant.id}/logo-${Date.now()}.${file.name.split(".").pop()}`;
      const url = await uploadFile(STORAGE_BUCKETS.LOGOS, path, file, file.type);
      await supabase.from("tenants").update({ logo_url: url }).eq("id", user!.tenant.id);
      setLogoUrl(url);
      showMsg("success", "Logo actualizado correctamente.");
    } catch (e) {
      showMsg("error", (e as Error).message);
    } finally {
      setLogoUploading(false);
    }
  };

  const saveCompany = async () => {
    if (!companyName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("tenants").update({ name: companyName }).eq("id", user!.tenant.id);
    setSaving(false);
    error ? showMsg("error", error.message) : showMsg("success", "Empresa actualizada correctamente.");
  };

  const saveProfile = async () => {
    if (!fullName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone: phone || null }).eq("id", user!.id);
    setSaving(false);
    error ? showMsg("error", error.message) : showMsg("success", "Perfil actualizado correctamente.");
  };

  const savePassword = async () => {
    if (newPass !== confirmPass) { showMsg("error", "Las contraseñas no coinciden."); return; }
    if (newPass.length < 8)      { showMsg("error", "La contraseña debe tener al menos 8 caracteres."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setSaving(false);
    if (error) { showMsg("error", error.message); return; }
    showMsg("success", "Contraseña actualizada. Por seguridad, vuelve a iniciar sesión.");
    setCurrentPass(""); setNewPass(""); setConfirmPass("");
  };

  const PLAN_LABELS: Record<string, { label: string; color: string; features: string[] }> = {
    starter:      { label: "Starter",      color: "bg-slate-100 text-slate-600",  features: ["Hasta 5 activos", "2 técnicos", "Exportación PDF"] },
    professional: { label: "Professional", color: "bg-blue-50 text-blue-700",     features: ["Activos ilimitados", "10 técnicos", "IA + Analytics"] },
    enterprise:   { label: "Enterprise",   color: "bg-purple-50 text-purple-700", features: ["Todo ilimitado", "Soporte 24/7", "API acceso"] },
  };

  const tabs = [
    { id: "company",  label: "Empresa",    icon: "🏢" },
    { id: "profile",  label: "Mi Perfil",  icon: "👤" },
    { id: "security", label: "Seguridad",  icon: "🔒" },
  ] as const;

  return (
    <Layout>
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Configuración</h1>
          <p className="text-sm text-slate-400 mt-0.5">Gestiona tu cuenta y preferencias</p>
        </div>

        {/* Mensaje feedback */}
        {msg && (
          <div className={`flex items-center gap-3 p-4 rounded-2xl border text-sm ${
            msg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-600"
          }`}>
            <span>{msg.type === "success" ? "✅" : "⚠"}</span>
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* TAB: Empresa */}
        {activeTab === "company" && (
          <div className="space-y-5">
            {/* Logo */}
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-4">Logo de la Empresa</h2>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50 flex-shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl text-slate-300">🏢</span>
                  )}
                </div>
                <div>
                  <button
                    onClick={() => logoRef.current?.click()}
                    disabled={logoUploading}
                    className="btn-secondary"
                  >
                    {logoUploading ? "Subiendo..." : "Cambiar logo"}
                  </button>
                  <p className="text-xs text-slate-400 mt-2">PNG, JPG o SVG. Máx 2MB. Recomendado: 200×200px</p>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
                </div>
              </div>
            </div>

            {/* Nombre */}
            <div className="card p-5 space-y-4">
              <h2 className="font-semibold text-slate-700">Información de la Empresa</h2>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Nombre de la Empresa</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Plan Actual</label>
                <div className="flex items-center gap-3">
                  <span className={`badge ${PLAN_LABELS[plan]?.color}`}>{PLAN_LABELS[plan]?.label}</span>
                  <ul className="text-xs text-slate-400 flex gap-3 flex-wrap">
                    {PLAN_LABELS[plan]?.features.map(f => <li key={f}>• {f}</li>)}
                  </ul>
                </div>
              </div>
              <button onClick={saveCompany} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>

            {/* Zona de peligro */}
            <div className="card p-5 border-red-100">
              <h2 className="font-semibold text-red-600 mb-2">Zona de Peligro</h2>
              <p className="text-sm text-slate-500 mb-4">Estas acciones son permanentes e irreversibles.</p>
              <button
                onClick={() => { if (confirm("¿Cerrar sesión?")) signOut(); }}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl text-sm transition-colors border border-red-200"
              >
                ⏻ Cerrar Sesión
              </button>
            </div>
          </div>
        )}

        {/* TAB: Mi Perfil */}
        {activeTab === "profile" && (
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-slate-700">Información Personal</h2>

            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                {user?.profile.full_name[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-800">{user?.profile.full_name}</p>
                <p className="text-xs text-slate-400">{user?.email}</p>
                <span className="badge bg-blue-50 text-blue-700 mt-1 inline-block capitalize">{user?.profile.role}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Nombre Completo</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Teléfono</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+52 55 0000 0000" className="input" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Correo Electrónico</label>
              <input value={user?.email ?? ""} disabled className="input bg-slate-50 text-slate-400 cursor-not-allowed" />
              <p className="text-xs text-slate-400 mt-1">El email no se puede cambiar desde aquí.</p>
            </div>
            <button onClick={saveProfile} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? "Guardando..." : "Actualizar Perfil"}
            </button>
          </div>
        )}

        {/* TAB: Seguridad */}
        {activeTab === "security" && (
          <div className="space-y-5">
            <div className="card p-5 space-y-4">
              <h2 className="font-semibold text-slate-700">Cambiar Contraseña</h2>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Nueva Contraseña</label>
                <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                  placeholder="Mínimo 8 caracteres" className="input" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Confirmar Contraseña</label>
                <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                  placeholder="Repite la nueva contraseña" className="input" />
                {confirmPass && newPass !== confirmPass && (
                  <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
                )}
              </div>
              <button
                onClick={savePassword}
                disabled={saving || !newPass || newPass !== confirmPass}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? "Actualizando..." : "Cambiar Contraseña"}
              </button>
            </div>

            {/* Sesión activa */}
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-3">Sesión Activa</h2>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💻</span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Sesión actual</p>
                    <p className="text-xs text-slate-400">{navigator.platform} · {navigator.userAgent.includes("Chrome") ? "Chrome" : "Navegador"}</p>
                  </div>
                </div>
                <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full font-medium">● Activa</span>
              </div>
              <button
                onClick={() => { if (confirm("¿Cerrar sesión en este dispositivo?")) signOut(); }}
                className="mt-3 text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                Cerrar sesión →
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
