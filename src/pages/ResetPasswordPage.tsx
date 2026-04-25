import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type Mode = "request" | "reset" | "done" | "sent";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase manda el token en el hash de la URL (#access_token=...)
  // Cuando detectamos eso, cambiamos a modo "reset"
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token") && hash.includes("type=recovery")) {
      setMode("reset");
    }
  }, []);

  // Pedir link de recuperación
  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError("No se pudo enviar el correo. Verifica el email e intenta de nuevo.");
    } else {
      setMode("sent");
    }
  };

  // Establecer nueva contraseña
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(`Error: ${error.message}`);
    } else {
      setMode("done");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#0f172a" }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">F</span>
          </div>
          <span className="text-white font-bold text-xl">Flux CMMS</span>
        </div>

        <div className="rounded-2xl border border-white/10 p-8" style={{ background: "#111827" }}>

          {/* ── Paso 1: pedir link ── */}
          {mode === "request" && (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white">Recuperar contraseña</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Ingresa tu correo y te enviaremos un link para crear una nueva contraseña.
                </p>
              </div>
              <form onSubmit={handleRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">✉</span>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="usuario@empresa.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
                      style={{ background: "#1e293b" }}
                    />
                  </div>
                </div>

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all text-sm disabled:opacity-50"
                >
                  {loading ? <Spinner /> : "Enviar link de recuperación"}
                </button>
              </form>
            </>
          )}

          {/* ── Paso 2: link enviado ── */}
          {mode === "sent" && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto">
                <span className="text-4xl">📧</span>
              </div>
              <h2 className="text-xl font-bold text-white">Revisa tu correo</h2>
              <p className="text-slate-400 text-sm">
                Enviamos un link a <strong className="text-white">{email}</strong>.
                Haz clic en el link del correo para crear tu nueva contraseña.
              </p>
              <p className="text-slate-500 text-xs">
                ¿No llegó? Revisa la carpeta de spam.
              </p>
            </div>
          )}

          {/* ── Paso 3: ingresar nueva contraseña ── */}
          {mode === "reset" && (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white">Nueva contraseña</h2>
                <p className="text-slate-400 text-sm mt-1">Elige una contraseña segura para tu cuenta.</p>
              </div>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔒</span>
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      placeholder="Mínimo 6 caracteres"
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

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔒</span>
                    <input
                      type={showPass ? "text" : "password"}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required
                      placeholder="Repite la contraseña"
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
                      style={{ background: "#1e293b" }}
                    />
                  </div>
                </div>

                {/* Indicador de fortaleza */}
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                          password.length >= i * 3
                            ? i <= 1 ? "bg-red-500" : i <= 2 ? "bg-amber-500" : i <= 3 ? "bg-blue-500" : "bg-emerald-500"
                            : "bg-white/10"
                        }`} />
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      {password.length < 6 ? "Muy corta" : password.length < 9 ? "Débil" : password.length < 12 ? "Buena" : "Fuerte"}
                    </p>
                  </div>
                )}

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all text-sm disabled:opacity-50"
                >
                  {loading ? <Spinner /> : "Guardar nueva contraseña"}
                </button>
              </form>
            </>
          )}

          {/* ── Paso 4: éxito ── */}
          {mode === "done" && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <span className="text-4xl">✅</span>
              </div>
              <h2 className="text-xl font-bold text-white">¡Contraseña actualizada!</h2>
              <p className="text-slate-400 text-sm">
                Tu contraseña fue cambiada exitosamente. Ya puedes iniciar sesión.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all text-sm mt-2"
              >
                Ir al inicio de sesión
              </button>
            </div>
          )}

          {/* Volver al login */}
          {(mode === "request" || mode === "sent") && (
            <button
              onClick={() => navigate("/login")}
              className="w-full mt-4 text-center text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              ← Volver al inicio de sesión
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl">
      <span className="text-red-400 text-sm flex-shrink-0 mt-0.5">⚠</span>
      <p className="text-red-300 text-sm">{message}</p>
    </div>
  );
}

function Spinner() {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      Procesando...
    </span>
  );
}
