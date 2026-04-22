import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

const ownerNav = [
  { path: "/owner",             icon: "⊞",  label: "Dashboard"     },
  { path: "/owner/reports",     icon: "📋", label: "Reportes"      },
  { path: "/owner/scheduling",  icon: "📅", label: "Planificación" },
  { path: "/owner/templates",   icon: "☑️", label: "Plantillas"    },
  { path: "/owner/assets",      icon: "⚙",  label: "Activos"       },
  { path: "/owner/technicians", icon: "👷", label: "Técnicos"      },
  { path: "/owner/analytics",   icon: "📊", label: "Analíticas"    },
  { path: "/owner/settings",    icon: "⚙️", label: "Configuración" },
];

const techNav = [
  { path: "/technician", icon: "📋", label: "Mis Reportes" },
  { path: "/technician/reports/new", icon: "➕", label: "Nuevo Reporte" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isOwner = user?.profile.role !== "technician";
  const nav = isOwner ? ownerNav : techNav;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "#0f172a" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          {user?.tenant.logo_url ? (
            <img src={user.tenant.logo_url} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              {user?.tenant.name[0]}
            </div>
          )}
          <div>
            <p className="text-white font-semibold text-sm truncate">{user?.tenant.name}</p>
            <p className="text-slate-400 text-xs capitalize">{user?.tenant.plan}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 mb-3">
            {isOwner ? "Gestión" : "Operaciones"}
          </p>
          {nav.map((item) => {
            const active = location.pathname === item.path ||
              (item.path !== "/owner" && item.path !== "/technician" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`sidebar-link ${active ? "active" : ""}`}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-white/10 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.profile.full_name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.profile.full_name}</p>
              <p className="text-slate-400 text-xs capitalize">{user?.profile.role}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
          >
            <span>⏻</span>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-100 px-4 lg:px-6 py-3.5 flex items-center justify-between flex-shrink-0">
          <button
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="hidden lg:block">
            <h2 className="text-slate-800 font-semibold text-sm">
              {nav.find(n => location.pathname === n.path ||
                (n.path !== "/owner" && n.path !== "/technician" && location.pathname.startsWith(n.path))
              )?.label ?? "Panel"}
            </h2>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <span className="hidden sm:block text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {user?.profile.full_name[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
