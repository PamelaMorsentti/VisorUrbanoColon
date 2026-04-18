import { useEffect, useRef, useCallback, type ReactNode } from "react";
import L from "leaflet";
import { Ruler, Square, X, Trash2 } from "lucide-react";

// ─── Haversine distance ───────────────────────────────────────────────────────

function haversine(a: L.LatLng, b: L.LatLng): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ─── Shoelace area (spherical approximation) ─────────────────────────────────

function polygonArea(pts: L.LatLng[]): number {
  if (pts.length < 3) return 0;
  const R = 6371000;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const xi = pts[i].lng * Math.PI / 180;
    const yi = pts[i].lat * Math.PI / 180;
    const xj = pts[j].lng * Math.PI / 180;
    const yj = pts[j].lat * Math.PI / 180;
    area += (xj - xi) * (2 + Math.sin(yi) + Math.sin(yj));
  }
  return Math.abs(area * R * R / 2);
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtDist(m: number): string {
  if (m < 1000) return `${m.toFixed(1)} m`;
  return `${(m / 1000).toFixed(3)} km`;
}

function fmtArea(m2: number): string {
  if (m2 < 10000) return `${m2.toFixed(1)} m²`;
  return `${(m2 / 10000).toFixed(4)} ha`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MeasureMode = "none" | "distance" | "area";

interface MeasureToolProps {
  mapRef: React.RefObject<L.Map | null>;
  mode: MeasureMode;
  onChangeMode: (m: MeasureMode) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MeasureTool({ mapRef, mode, onChangeMode }: MeasureToolProps) {
  const pointsRef = useRef<L.LatLng[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const polygonRef = useRef<L.Polygon | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const tooltipsRef = useRef<L.Tooltip[]>([]);
  const cursorLineRef = useRef<L.Polyline | null>(null);
  const totalDistRef = useRef<number>(0);

  const clearAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => map.removeLayer(m));
    tooltipsRef.current.forEach(t => map.removeLayer(t));
    if (polylineRef.current) { map.removeLayer(polylineRef.current); polylineRef.current = null; }
    if (polygonRef.current) { map.removeLayer(polygonRef.current); polygonRef.current = null; }
    if (cursorLineRef.current) { map.removeLayer(cursorLineRef.current); cursorLineRef.current = null; }
    markersRef.current = [];
    tooltipsRef.current = [];
    pointsRef.current = [];
    totalDistRef.current = 0;
  }, [mapRef]);

  const addDistanceTooltip = useCallback((map: L.Map, pos: L.LatLng, text: string) => {
    const tt = L.tooltip({ permanent: true, direction: "right", offset: [10, 0], className: "measure-tooltip" })
      .setLatLng(pos)
      .setContent(text)
      .addTo(map);
    tooltipsRef.current.push(tt);
  }, []);

  const redrawPolyline = useCallback((map: L.Map, pts: L.LatLng[]) => {
    if (polylineRef.current) map.removeLayer(polylineRef.current);
    if (pts.length >= 2) {
      polylineRef.current = L.polyline(pts, {
        color: "#3b82f6", weight: 2.5, opacity: 0.9, dashArray: "6 3"
      }).addTo(map);
    }
  }, []);

  const redrawPolygon = useCallback((map: L.Map, pts: L.LatLng[]) => {
    if (polygonRef.current) map.removeLayer(polygonRef.current);
    if (pts.length >= 3) {
      polygonRef.current = L.polygon(pts, {
        color: "#10b981", weight: 2, fillColor: "#10b981", fillOpacity: 0.12
      }).addTo(map);
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mode === "none") {
      clearAll();
      map.getContainer().style.cursor = "";
      return;
    }

    map.getContainer().style.cursor = "crosshair";

    const onClick = (e: L.LeafletMouseEvent) => {
      const pts = pointsRef.current;
      pts.push(e.latlng);

      // Add vertex marker
      const marker = L.circleMarker(e.latlng, {
        radius: 4, color: "#3b82f6", fillColor: "#fff", fillOpacity: 1, weight: 2
      }).addTo(map);
      markersRef.current.push(marker);

      if (mode === "distance") {
        if (pts.length >= 2) {
          const d = haversine(pts[pts.length - 2], pts[pts.length - 1]);
          totalDistRef.current += d;
          addDistanceTooltip(map, e.latlng, `+${fmtDist(d)} (total: ${fmtDist(totalDistRef.current)})`);
        }
        redrawPolyline(map, pts);
      } else {
        redrawPolygon(map, pts);
      }
    };

    const onDblClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      if (cursorLineRef.current) { map.removeLayer(cursorLineRef.current); cursorLineRef.current = null; }
      // Finish measurement - summary shown via tooltip on last point
      const pts = pointsRef.current;
      if (mode === "area" && pts.length >= 3) {
        const area = polygonArea(pts);
        const perimeter = pts.reduce((acc, p, i) => {
          const next = pts[(i + 1) % pts.length];
          return acc + haversine(p, next);
        }, 0);
        const center = L.polygon(pts).getBounds().getCenter();
        const tt = L.tooltip({ permanent: true, direction: "center", className: "measure-tooltip measure-tooltip--result" })
          .setLatLng(center)
          .setContent(`<b>${fmtArea(area)}</b><br><span style="font-size:10px">Perímetro: ${fmtDist(perimeter)}</span>`)
          .addTo(map);
        tooltipsRef.current.push(tt);
      }
      // Don't clear — user can see result and clear manually
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const pts = pointsRef.current;
      if (!pts.length) return;
      const last = pts[pts.length - 1];
      if (cursorLineRef.current) map.removeLayer(cursorLineRef.current);
      cursorLineRef.current = L.polyline([last, e.latlng], {
        color: "#3b82f6", weight: 1.5, opacity: 0.5, dashArray: "4 4"
      }).addTo(map);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { clearAll(); onChangeMode("none"); }
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    map.on("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      map.off("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      if (cursorLineRef.current) { map.removeLayer(cursorLineRef.current); cursorLineRef.current = null; }
    };
  }, [mode, mapRef, clearAll, redrawPolyline, redrawPolygon, addDistanceTooltip, onChangeMode]);

  // ─── Toolbar ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* CSS for measure tooltips */}
      <style>{`
        .measure-tooltip { background: hsl(220 16% 14%) !important; border: 1px solid hsl(220 16% 25%) !important; color: #e2e8f0 !important; font-size: 11px !important; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important; padding: 3px 8px !important; border-radius: 6px !important; }
        .measure-tooltip::before { border-right-color: hsl(220 16% 25%) !important; }
        .measure-tooltip--result { font-size: 12px !important; padding: 5px 10px !important; border-color: #10b981 !important; }
      `}</style>

      {/* Floating toolbar (shown when mode != none) */}
      {mode !== "none" && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[900] flex items-center gap-2 px-4 py-2 rounded-2xl border border-border shadow-2xl"
          style={{ background: "hsl(220 16% 12% / 0.97)", backdropFilter: "blur(8px)" }}
        >
          <div className="text-xs text-muted-foreground">
            {mode === "distance"
              ? "Clic para agregar puntos · doble clic para finalizar · Esc para cancelar"
              : "Clic para trazar el polígono · doble clic para cerrar · Esc para cancelar"}
          </div>
          <button
            onClick={() => { clearAll(); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground border border-border hover:bg-card/50 transition-colors"
            title="Borrar medición"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => { clearAll(); onChangeMode("none"); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground border border-border hover:bg-card/50 transition-colors"
            title="Cerrar herramienta"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </>
  );
}

// ─── Measure buttons (used in Header) ────────────────────────────────────────

interface MeasureButtonsProps {
  mode: MeasureMode;
  onChangeMode: (m: MeasureMode) => void;
}

export function MeasureButtons({ mode, onChangeMode }: MeasureButtonsProps) {
  const toggle = (m: MeasureMode) => onChangeMode(mode === m ? "none" : m);
  return (
    <div className="flex gap-1">
      <MeasureBtn
        active={mode === "distance"}
        onClick={() => toggle("distance")}
        icon={<Ruler size={13} />}
        label="Medir dist."
        title="Medir distancia"
      />
      <MeasureBtn
        active={mode === "area"}
        onClick={() => toggle("area")}
        icon={<Square size={13} />}
        label="Medir sup."
        title="Medir superficie"
      />
    </div>
  );
}

function MeasureBtn({ active, onClick, icon, label, title }: {
  active: boolean; onClick: () => void; icon: ReactNode; label: string; title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all font-medium ${
        active
          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
          : "bg-card border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}
