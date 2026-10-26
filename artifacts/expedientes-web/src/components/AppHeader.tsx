import { Link, useLocation } from "wouter";
import { Building2, ClipboardList, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: Building2 },
  { href: "/registros", label: "Registros", icon: ClipboardList },
  { href: "/inscripcion", label: "Nueva inscripción", icon: UserPlus },
] as const;

export function AppHeader() {
  const [location] = useLocation();

  return (
    <header className="border-b border-slate-200 bg-[#0f2744] text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-300">
            Municipalidad de Colón, Entre Ríos
          </div>
          <h1 className="text-lg font-semibold leading-tight md:text-xl">
            Dirección de Obras Privadas y Planeamiento
          </h1>
          <p className="text-sm text-slate-300">
            Sistema de Gestión de Expedientes de Obras Privadas
          </p>
        </div>

        <nav className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => {
            const active = location === item.href
              || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/15 text-white"
                    : "text-slate-200 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
