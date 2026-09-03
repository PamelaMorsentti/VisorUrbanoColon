import { useState, useEffect } from "react";
import { Cloud, AlertTriangle, Droplets, ChevronDown, ExternalLink, X, Car, Siren } from "lucide-react";
import { fetchColonHydrology } from "@/lib/hydrology";

interface WeatherData {
  temp: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  rainChance: number;
}

interface RiverData {
  level: number;
  trend: string;
  delta: number;
  updatedAt: string;
  source: "caru" | "api";
  apiUnavailable?: boolean;
  alertLevel: number;
  evacuationLevel: number;
}

interface RegionalInfoPanelProps {
  latitude?: number;
  longitude?: number;
  open?: boolean;
  onToggle?: () => void;
  hideTrigger?: boolean;
}

type ServiceTab = "clima" | "rio" | "transito" | "emergencias";

const COLON_RIVER_ALERT_LEVEL = 7.1;
const COLON_RIVER_EVAC_LEVEL = 7.9;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export default function RegionalInfoPanel({
  latitude = -32.4667,
  longitude = -58.3167,
  open: openProp,
  onToggle,
  hideTrigger = false,
}: RegionalInfoPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ServiceTab>("clima");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherSource, setWeatherSource] = useState<"openweather" | "openmeteo" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [river, setRiver] = useState<RiverData | null>(null);
  const [riverLoading, setRiverLoading] = useState(false);
  const [riverError, setRiverError] = useState<string | null>(null);

  const isOpen = openProp ?? internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen(v => !v));

  // Fetch weather data with fallback:
  // 1) OpenWeatherMap when VITE_OPENWEATHER_API_KEY is available
  // 2) Open-Meteo (no API key) when key is missing
  useEffect(() => {
    const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
    const controller = new AbortController();

    const loadWeather = async () => {
      setLoading(true);
      setError(null);

      if (API_KEY) {
        try {
          const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&lang=es&appid=${API_KEY}`,
            { signal: controller.signal }
          );
          const data = await res.json();
          if (data.main) {
            setWeather({
              temp: Math.round(data.main.temp),
              condition: data.weather?.[0]?.description ?? data.weather?.[0]?.main ?? "Sin dato",
              humidity: data.main.humidity,
              windSpeed: Math.round(data.wind.speed),
              rainChance: data.clouds?.all ?? 0,
            });
            setWeatherSource("openweather");
            return;
          }
        } catch {
          // fall back to Open-Meteo below
        }
      }

      try {
        const meteoRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,cloud_cover&timezone=auto`,
          { signal: controller.signal }
        );
        const meteo = await meteoRes.json();
        const current = meteo.current;
        if (current) {
          setWeather({
            temp: Math.round(current.temperature_2m),
            condition: weatherCodeToEs(current.weather_code),
            humidity: Math.round(current.relative_humidity_2m ?? 0),
            windSpeed: Math.round((current.wind_speed_10m ?? 0) / 3.6),
            rainChance: Math.round(current.cloud_cover ?? 0),
          });
          setWeatherSource("openmeteo");
          return;
        }

        setError("No se pudo obtener pronóstico");
      } catch {
        setError("No se pudo cargar el pronóstico");
      } finally {
        setLoading(false);
      }
    };

    loadWeather();

    if (!isOpen) return () => controller.abort();

    const intervalId = window.setInterval(() => {
      loadWeather();
    }, 10 * 60 * 1000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [latitude, longitude, isOpen]);

  const climaStatus = getClimaStatus(weather, error);
  const rioStatus = (() => {
    if (riverError) return { label: "Error", tone: "error" as const };
    if (!river) return { label: "Cargando", tone: "info" as const };
    if (river.level >= river.evacuationLevel) return { label: "Evacuar", tone: "error" as const };
    if (river.level >= river.alertLevel) return { label: "Alerta", tone: "warn" as const };
    if (river.level >= river.alertLevel - 0.5) return { label: "Vigilar", tone: "info" as const };
    return { label: "Normal", tone: "ok" as const };
  })();

  const rioToneClass =
    rioStatus.tone === "ok"
      ? "text-emerald-300"
      : rioStatus.tone === "warn"
      ? "text-amber-300"
      : rioStatus.tone === "error"
      ? "text-red-300"
      : "text-sky-300";

  useEffect(() => {
    if (!isOpen) return;

    let alive = true;

    const loadRiverData = async () => {
      setRiverLoading(true);
      setRiverError(null);
      try {
        const data = await fetchColonHydrology(API_BASE_URL);
        if (!alive) return;

        if (!data) {
          setRiverError("No se pudo leer la estación Colón");
          return;
        }

        setRiver({
          level: data.level,
          trend: data.trend ?? "S/D",
          delta: data.delta ?? 0,
          updatedAt: data.updatedAt ?? "S/D",
          source: data.source,
          apiUnavailable: data.apiUnavailable,
          alertLevel: data.alertLevel ?? COLON_RIVER_ALERT_LEVEL,
          evacuationLevel: data.evacuationLevel ?? COLON_RIVER_EVAC_LEVEL,
        });
      } catch {
        if (alive) setRiverError("No se pudo actualizar altura del río");
      } finally {
        if (alive) setRiverLoading(false);
      }
    };

    loadRiverData();
    const intervalId = window.setInterval(loadRiverData, 15 * 60 * 1000);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [isOpen]);

  if (hideTrigger && !isOpen) return null;

  return (
    <div className={hideTrigger ? "w-[88vw] sm:w-72" : "absolute top-14 right-3 z-[800] w-[88vw] sm:w-72"}>
      {/* Minimalist toggle button */}
      {!hideTrigger && (
        <button
          onClick={toggle}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium shadow-lg transition-all ${
            isOpen
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card/90 border-border text-muted-foreground hover:text-foreground"
          }`}
          style={{ backdropFilter: "blur(8px)" }}
          title="Información regional: pronóstico y alertas"
        >
          <Cloud size={14} />
          <span>Información</span>
          <ChevronDown size={12} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      )}

      {/* Expandable panel */}
      {isOpen && (
        <div
          className={`rounded-lg border border-border shadow-2xl overflow-hidden w-full ${hideTrigger ? "" : "absolute top-full mt-2 right-0"}`}
          style={{ background: "hsl(220 16% 12%)", backdropFilter: "blur(8px)" }}
        >
          {hideTrigger && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Servicios regionales</h3>
              <button onClick={toggle} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar servicios">
                <X size={12} />
              </button>
            </div>
          )}

          <div className="p-2 border-b border-border/50">
            <div className="grid grid-cols-2 gap-1">
              <TabButton
                active={activeTab === "clima"}
                onClick={() => setActiveTab("clima")}
                icon={<Cloud size={12} />}
                label="Clima"
                status={climaStatus.label}
                tone={climaStatus.tone}
              />
              <TabButton
                active={activeTab === "rio"}
                onClick={() => setActiveTab("rio")}
                icon={<Droplets size={12} />}
                label="Río"
                status={rioStatus.label}
                tone={rioStatus.tone}
              />
              <TabButton
                active={activeTab === "transito"}
                onClick={() => setActiveTab("transito")}
                icon={<Car size={12} />}
                label="Tránsito"
                status="Info"
                tone="info"
              />
              <TabButton
                active={activeTab === "emergencias"}
                onClick={() => setActiveTab("emergencias")}
                icon={<Siren size={12} />}
                label="Emergencias"
                status="Activo"
                tone="ok"
              />
            </div>
          </div>

          {activeTab === "clima" && (
            <div className="border-b border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Pronóstico - Colón
              </h3>

              {loading && (
                <div className="text-xs text-muted-foreground/70 animate-pulse">Cargando...</div>
              )}

              {error && (
                <div className="text-xs text-yellow-600/80">
                  ⚠️ {error}
                </div>
              )}

              {weather && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Temperatura:</span>
                    <span className="font-semibold text-lg">{weather.temp}°C</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Condición:</span>
                    <span className="capitalize">{weather.condition}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Humedad:</span>
                    <span>{weather.humidity}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Viento:</span>
                    <span>{weather.windSpeed} m/s</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Nubosidad:</span>
                    <span>{weather.rainChance}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Fuente:</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                      {weatherSource === "openweather" ? "OpenWeather" : "Open-Meteo"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "rio" && (
            <div className="border-b border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Droplets size={12} /> Nivel de Ríos
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground/70">
                <p>Seguimiento hidrométrico para Colón (Río Uruguay).</p>
                {riverLoading && <p className="animate-pulse">Actualizando nivel del río...</p>}

                {riverError && (
                  <p className="font-semibold text-yellow-600/80 flex items-center gap-1">
                    <AlertTriangle size={12} /> {riverError}
                  </p>
                )}

                {river && (
                  <div className="space-y-1.5 rounded-md border border-border/50 bg-card/30 p-2.5">
                    <div className="flex items-center justify-between">
                      <span>Nivel actual:</span>
                      <span className="font-semibold text-foreground">{river.level.toFixed(2)} m</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Tendencia:</span>
                      <span className="capitalize">{river.trend} ({river.delta >= 0 ? "+" : ""}{river.delta.toFixed(2)} m)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Alerta / Evacuación:</span>
                      <span>{river.alertLevel.toFixed(2)} / {river.evacuationLevel.toFixed(2)} m</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Última lectura:</span>
                      <span>{river.updatedAt}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Fuente:</span>
                      <span>{river.source === "api" ? "API local (Prefectura/CARU)" : "CARU"}</span>
                    </div>
                    {river.source === "caru" && river.apiUnavailable && (
                      <div className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                        API local de hidrologia no disponible en este entorno. Mostrando fuente alterna (CARU).
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span>Estado:</span>
                      <span className={rioToneClass}>{rioStatus.label}</span>
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  <a
                    href="https://contenidosweb.prefecturanaval.gob.ar/alturas/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Prefectura Naval - Altura de los ríos
                  </a>
                  <a
                    href="http://190.0.152.194:8080/alturas/web/user/alturas"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink size={12} />
                    CARU - Registro de alturas del río Uruguay
                  </a>
                  <a
                    href="https://www.ana.gob.ar/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink size={12} />
                    ANA - Nivel de ríos en tiempo real
                  </a>
                  <a
                    href="https://www.hidraulica.gob.ar/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink size={12} />
                    SIyPH - Recursos hídricos
                  </a>
                </div>
                <p className="text-[10px] text-muted-foreground/60 pt-1">
                  Umbrales de Colón tomados de Prefectura Naval Argentina. Lectura automática de nivel vía CARU.
                </p>
              </div>
            </div>
          )}

          {activeTab === "transito" && (
            <div className="border-b border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Car size={12} /> Tránsito y rutas
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground/70">
                <p>Consulta estado de rutas y cortes antes de circular por zonas ribereñas.</p>
                <div className="mt-3 space-y-2">
                  <a
                    href="https://www.argentina.gob.ar/transporte/vialidad-nacional/estado-de-rutas"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Vialidad Nacional - Estado de rutas
                  </a>
                  <a
                    href="https://www.entrerios.gov.ar/minplan/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Entre Ríos - Infraestructura y transporte
                  </a>
                </div>
              </div>
            </div>
          )}

          {activeTab === "emergencias" && (
            <div className="border-b border-border/50 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Siren size={12} /> Emergencias
              </h3>
              <div className="space-y-2 text-xs text-muted-foreground/70">
                <p>Canales oficiales para alertas, tormentas severas y protección civil.</p>
                <div className="mt-3 space-y-2">
                  <a
                    href="https://www.proteccioncivil.gob.ar/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Alertas de Protección Civil
                  </a>
                  <a
                    href="https://www.smn.gob.ar/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink size={12} />
                    SMN - Servicio Meteorológico Nacional
                  </a>
                  <a
                    href="https://www.argentina.gob.ar/seguridad/sinagir"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <ExternalLink size={12} />
                    SINAGIR - Gestión integral del riesgo
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Quick Info */}
          <div className="p-4 bg-card/30">
            <p className="text-[10px] text-muted-foreground/60">
              💡 Este panel reúne accesos rápidos oficiales para monitoreo climático, hídrico, movilidad y alertas en Colón.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  status: string;
  tone: "ok" | "warn" | "error" | "info";
}

function TabButton({ active, onClick, icon, label, status, tone }: TabButtonProps) {
  const toneClasses: Record<TabButtonProps["tone"], string> = {
    ok: "bg-emerald-500/20 text-emerald-300",
    warn: "bg-amber-500/20 text-amber-300",
    error: "bg-red-500/20 text-red-300",
    info: "bg-sky-500/20 text-sky-300",
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-[11px] border transition-colors ${
        active
          ? "bg-primary/20 border-primary/40 text-primary"
          : "bg-card/40 border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-1">
        {icon}
        <span>{label}</span>
      </span>
      <span className={`rounded px-1 py-0.5 text-[9px] leading-none ${toneClasses[tone]}`}>
        {status}
      </span>
    </button>
  );
}

function weatherCodeToEs(code: number): string {
  if (code === 0) return "Despejado";
  if (code <= 3) return "Parcialmente nublado";
  if (code === 45 || code === 48) return "Niebla";
  if (code >= 51 && code <= 57) return "Llovizna";
  if (code >= 61 && code <= 67) return "Lluvia";
  if (code >= 71 && code <= 77) return "Nieve";
  if (code >= 80 && code <= 82) return "Chaparrones";
  if (code >= 95) return "Tormenta";
  return "Variable";
}

function getClimaStatus(weather: WeatherData | null, error: string | null): { label: string; tone: "ok" | "warn" | "error" | "info" } {
  if (error) return { label: "Error", tone: "error" };
  if (!weather) return { label: "Cargando", tone: "info" };
  if (weather.rainChance >= 80 || weather.windSpeed >= 12) return { label: "Alerta", tone: "warn" };
  if (weather.rainChance >= 60 || weather.windSpeed >= 8) return { label: "Vigilar", tone: "info" };
  return { label: "Normal", tone: "ok" };
}

function getRioStatus(river: RiverData | null, error: string | null): { label: string; tone: "ok" | "warn" | "error" | "info" } {
  if (error) return { label: "Error", tone: "error" };
  if (!river) return { label: "Cargando", tone: "info" };
  if (river.level >= river.evacuationLevel) return { label: "Evacuar", tone: "error" };
  if (river.level >= river.alertLevel) return { label: "Alerta", tone: "warn" };
  if (river.level >= river.alertLevel - 0.5) return { label: "Vigilar", tone: "info" };
  return { label: "Normal", tone: "ok" };
}

function getStatusTextClass(tone: "ok" | "warn" | "error" | "info"): string {
  if (tone === "ok") return "text-emerald-300";
  if (tone === "warn") return "text-amber-300";
  if (tone === "error") return "text-red-300";
  return "text-sky-300";
}

