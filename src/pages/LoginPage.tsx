import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const { signIn } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate("/");
    } catch {
      setError("Credenciales incorrectas. Verifica tu email y contraseña.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#0f172a" }}>
      {/* Panel izquierdo — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">F</span>
          </div>
          <span className="text-white font-bold text-xl">Flux CMMS</span>
        </div>

        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-full px-4 py-2">
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
            <span className="text-blue-300 text-sm font-medium">Sistema Multi-Tenant</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight">
            Gestión de Mantenimiento<br />
            <span className="text-blue-400">Industrial Inteligente</span>
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Controla activos, técnicos y reportes de servicio desde una plataforma unificada con evidencia multimedia y firma digital.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { icon: "📱", title: "Mobile-First", desc: "Escaneo QR y captura en campo" },
              { icon: "📊", title: "Analíticas", desc: "Métricas en tiempo real" },
              { icon: "🔒", title: "Multi-tenant", desc: "Aislamiento total por empresa" },
              { icon: "🤖", title: "IA Integrada", desc: "Chat con historial" },
            ].map((f) => (
              <div key={f.title} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <span className="text-2xl block mb-2">{f.icon}</span>
                <p className="text-white font-semibold text-sm">{f.title}</p>
                <p className="text-slate-400 text-xs mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-600 text-sm">© 2026 Flux Inc. Todos los derechos reservados.</p>
      </div>

      {/* Panel derecho — login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6"
        style={{ background: "#111827" }}>
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">F</span>
            </div>
            <span className="text-white font-bold text-xl">Flux CMMS</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Iniciar Sesión</h2>
            <p className="text-slate-400 mt-1">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">✉</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="usuario@empresa.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
                  style={{ background: "#1e293b" }}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔒</span>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
                  style={{ background: "#1e293b" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  {showPass ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl">
                <span className="text-red-400 text-sm flex-shrink-0 mt-0.5">⚠</span>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{ letterSpacing: "0.01em" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verificando...
                </span>
              ) : "Ingresar al sistema"}
            </button>
          </form>

          <div className="mt-8 p-4 rounded-xl border border-white/5" style={{ background: "#1e293b" }}>
            <p className="text-slate-400 text-xs text-center">
              ¿Problemas para ingresar? Contacta al administrador de tu empresa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
