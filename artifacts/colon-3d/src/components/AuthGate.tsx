import { useState } from "react";
import { Shield, User, Eye, Lock, X, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_PASSWORD, ROLE_LABELS, ROLE_BADGES, type Role } from "@/lib/auth";

// ─── Auth button in header (compact) ─────────────────────────────────────────

export function AuthButton({
  onOpenPanel,
  dashboardUrl,
  adminEditorUrl,
}: {
  onOpenPanel: () => void;
  dashboardUrl?: string;
  adminEditorUrl?: string;
}) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const openExternal = (url?: string) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  };

  if (!user) {
    return (
      <button
        onClick={onOpenPanel}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
        title="Iniciar sesión"
      >
        <User size={13} />
        <span className="hidden sm:inline">Acceso</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors font-medium ${ROLE_BADGES[user.role]}`}
        title={ROLE_LABELS[user.role]}
      >
        <RoleIcon role={user.role} size={13} />
        <span className="hidden sm:inline max-w-[80px] truncate">{user.username}</span>
        <ChevronDown size={10} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
      </button>
      {menuOpen && (
        <div
          className="absolute right-0 top-full mt-1 z-[2000] rounded-xl border border-border shadow-2xl overflow-hidden min-w-[160px]"
          style={{ background: "hsl(220 16% 12%)" }}
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[10px] text-muted-foreground">{ROLE_LABELS[user.role]}</div>
            <div className="text-xs font-semibold text-foreground truncate">{user.username}</div>
          </div>
          <button
            onClick={() => openExternal(dashboardUrl)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-card/50 transition-colors"
          >
            <Eye size={12} />
            Abrir dashboard
          </button>
          {user.role === "admin" && (
            <button
              onClick={() => openExternal(adminEditorUrl)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-card/50 transition-colors"
            >
              <Shield size={12} />
              Abrir editor admin
            </button>
          )}
          <button
            onClick={() => { logout(); setMenuOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-card/50 transition-colors"
          >
            <LogOut size={12} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Login panel ──────────────────────────────────────────────────────────────

interface AuthPanelProps {
  onClose: () => void;
}

export default function AuthPanel({ onClose }: AuthPanelProps) {
  const { login } = useAuth();
  const [tab, setTab] = useState<"acceso" | "invitado">("acceso");
  const [selectedRole, setSelectedRole] = useState<Role>("registrado");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleLogin = () => {
    const rawName = username.trim();

    if (selectedRole === "admin") {
      if (password !== ADMIN_PASSWORD) {
        setError("Contraseña de administrador incorrecta.");
        return;
      }
      login({ role: "admin", username: rawName || "Administrador" });
      onClose();
      return;
    }

    if (!rawName) { setError("Ingresá un nombre de usuario."); return; }
    login({ role: selectedRole, username: rawName });
    onClose();
  };

  const handleGuest = () => {
    login({ role: "invitado", username: "Visitante" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-sm rounded-2xl border border-border shadow-2xl overflow-hidden"
        style={{ background: "hsl(220 16% 12%)" }}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <div>
              <div className="text-sm font-bold text-foreground">Acceso al Visor Urbano</div>
              <div className="text-[10px] text-muted-foreground">Colón 3D — Municipalidad de Colón</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Role selector */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Rol de acceso</label>
            <div className="grid grid-cols-3 gap-2">
              {(["admin", "registrado", "invitado"] as Role[]).map(role => (
                <button
                  key={role}
                  onClick={() => { setSelectedRole(role); setError(null); }}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-[10px] font-medium transition-all ${
                    selectedRole === role
                      ? ROLE_BADGES[role] + " ring-1 ring-current"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <RoleIcon role={role} size={16} />
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              {selectedRole === "invitado" || selectedRole === "admin" ? "Usuario / nombre (opcional)" : "Usuario / nombre"}
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(null); }}
              placeholder={selectedRole === "admin" ? "Administrador" : "Tu nombre"}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
          </div>

          {/* Password (admin only) */}
          {selectedRole === "admin" && (
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                <Lock size={10} className="inline mr-1" />Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                placeholder="Contraseña de administrador"
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Role capabilities */}
          <RoleCapabilities role={selectedRole} />

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleGuest}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye size={12} />
              Ver como visitante
            </button>
            <button
              onClick={handleLogin}
              className="flex-1 px-3 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              Ingresar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function RoleIcon({ role, size }: { role: Role; size: number }) {
  if (role === "admin") return <Shield size={size} />;
  if (role === "registrado") return <User size={size} />;
  return <Eye size={size} />;
}

function RoleCapabilities({ role }: { role: Role }) {
  const caps: Record<Role, string[]> = {
    admin: ["Ver todas las capas", "Subir y gestionar capas GIS", "Imprimir informes", "Ejecutar todos los análisis", "Administrar el sistema"],
    registrado: ["Ver todas las capas", "Subir capas temporales", "Imprimir informes", "Ejecutar análisis básicos"],
    invitado: ["Ver el mapa y capas públicas", "Navegar por la ciudad"],
  };
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2.5">
      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Permisos de este rol</div>
      <ul className="space-y-1">
        {caps[role].map(c => (
          <li key={c} className="text-[10px] text-foreground/70 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-primary/60 flex-shrink-0" />
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
