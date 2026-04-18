export type Role = "admin" | "registrado" | "invitado";

export interface AuthUser {
  role: Role;
  username: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  registrado: "Registrado",
  invitado: "Visitante",
};

export const ROLE_COLORS: Record<Role, string> = {
  admin: "text-red-400",
  registrado: "text-sky-400",
  invitado: "text-slate-400",
};

export const ROLE_BADGES: Record<Role, string> = {
  admin: "bg-red-500/15 border-red-500/30 text-red-400",
  registrado: "bg-sky-500/15 border-sky-500/30 text-sky-400",
  invitado: "bg-slate-500/10 border-slate-500/20 text-slate-400",
};

export const PERMISSIONS = {
  admin: {
    canUploadLayers: true,
    canManageLayers: true,
    canRunAnalysis: true,
    canViewAll: true,
    canPrint: true,
  },
  registrado: {
    canUploadLayers: true,
    canManageLayers: false,
    canRunAnalysis: true,
    canViewAll: true,
    canPrint: true,
  },
  invitado: {
    canUploadLayers: false,
    canManageLayers: false,
    canRunAnalysis: false,
    canViewAll: true,
    canPrint: false,
  },
} satisfies Record<Role, Record<string, boolean>>;

export type Permission = keyof typeof PERMISSIONS.admin;

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role][permission];
}

// Admin password — read from env or fallback
export const ADMIN_PASSWORD =
  (import.meta as unknown as { env: { VITE_ADMIN_PASSWORD?: string } }).env.VITE_ADMIN_PASSWORD || "colon2024";

const LS_KEY = "colon3d_auth";

export function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch { return null; }
}

export function saveUser(user: AuthUser | null) {
  if (user) localStorage.setItem(LS_KEY, JSON.stringify(user));
  else localStorage.removeItem(LS_KEY);
}
