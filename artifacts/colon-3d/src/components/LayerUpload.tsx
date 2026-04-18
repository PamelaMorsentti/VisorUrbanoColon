import { useState, useRef, useCallback } from "react";
import { Upload, X, Layers, CheckCircle, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import L from "leaflet";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGeoJSON = any;

interface UploadedLayer {
  id: string;
  name: string;
  count: number;
  color: string;
  leafletLayer: L.GeoJSON;
  visible: boolean;
}

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ef4444", "#ec4899", "#06b6d4"];

interface LayerUploadProps {
  mapRef: React.RefObject<L.Map | null>;
  onClose: () => void;
  canUpload: boolean;
}

export default function LayerUpload({ mapRef, onClose, canUpload }: LayerUploadProps) {
  const [layers, setLayers] = useState<UploadedLayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorIdx = useRef(0);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const map = mapRef.current;
    if (!map) { setLoading(false); return; }

    try {
      const name = file.name.replace(/\.(zip|shp|geojson|json|kml)$/i, "");
      const ext = file.name.split(".").pop()?.toLowerCase();

      let geojson: AnyGeoJSON = null;

      if (ext === "geojson" || ext === "json") {
        const text = await file.text();
        geojson = JSON.parse(text);
      } else if (ext === "zip") {
        const arrayBuffer = await file.arrayBuffer();
        const shpjs = (await import("shpjs")).default;
        geojson = await shpjs(arrayBuffer);
      } else if (ext === "kml") {
        const text = await file.text();
        const parser = new DOMParser();
        const dom = parser.parseFromString(text, "application/xml");
        // Basic KML point/line/polygon extraction
        const placemarks = Array.from(dom.querySelectorAll("Placemark"));
        const features = placemarks.map(pm => {
          const coords = pm.querySelector("coordinates")?.textContent?.trim();
          if (!coords) return null;
          const pts = coords.split(/\s+/).map(c => {
            const [lon, lat] = c.split(",").map(Number);
            return [lon, lat];
          });
          return {
            type: "Feature",
            properties: { name: pm.querySelector("name")?.textContent || "" },
            geometry: pts.length === 1
              ? { type: "Point", coordinates: pts[0] }
              : { type: "LineString", coordinates: pts },
          };
        }).filter(Boolean);
        geojson = { type: "FeatureCollection", features };
      } else {
        throw new Error("Formato no soportado. Usá .zip (SHP), .geojson o .kml");
      }

      if (!geojson || (!geojson.features && !geojson.type)) {
        throw new Error("No se pudo parsear el archivo como GeoJSON válido.");
      }

      const fc = geojson.type === "FeatureCollection" ? geojson : { type: "FeatureCollection", features: [geojson] };
      const count = fc.features?.length || 0;
      const color = COLORS[colorIdx.current % COLORS.length];
      colorIdx.current++;

      const leafletLayer = L.geoJSON(fc, {
        style: { color, weight: 1.5, fillColor: color, fillOpacity: 0.25, opacity: 0.85 },
        pointToLayer: (_, latlng) => L.circleMarker(latlng, { radius: 5, color, fillColor: color, fillOpacity: 0.7, weight: 1.5 }),
        onEachFeature: (feature, layer) => {
          if (feature.properties) {
            const lines = Object.entries(feature.properties)
              .filter(([, v]) => v != null)
              .map(([k, v]) => `<b>${k}</b>: ${v}`)
              .join("<br>");
            if (lines) layer.bindPopup(`<div style="font-size:11px;color:#e2e8f0">${lines}</div>`, { className: "dark-popup" });
          }
        },
      }).addTo(map);

      // Zoom to layer
      try {
        const bounds = leafletLayer.getBounds();
        if (bounds.isValid()) map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 18, duration: 1 });
      } catch {}

      const id = `upload_${Date.now()}`;
      setLayers(prev => [...prev, { id, name, count, color, leafletLayer, visible: true }]);
      setSuccess(`Capa "${name}" cargada (${count} features)`);
    } catch (err) {
      setError((err as Error).message || "Error al procesar el archivo.");
    } finally {
      setLoading(false);
    }
  }, [mapRef]);

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files).forEach(f => processFile(f));
  };

  const toggleLayer = (id: string) => {
    const map = mapRef.current;
    if (!map) return;
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l;
      if (l.visible) map.removeLayer(l.leafletLayer);
      else l.leafletLayer.addTo(map);
      return { ...l, visible: !l.visible };
    }));
  };

  const removeLayer = (id: string) => {
    const map = mapRef.current;
    const layer = layers.find(l => l.id === id);
    if (layer && map) map.removeLayer(layer.leafletLayer);
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[1500] flex flex-col w-80 border-l border-border shadow-2xl"
      style={{ background: "hsl(220 16% 11%)", top: "52px" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Upload size={14} className="text-amber-400" />
          <div>
            <div className="text-sm font-bold text-foreground">Cargar capas GIS</div>
            <div className="text-[10px] text-muted-foreground">SHP (ZIP), GeoJSON, KML</div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
      </div>

      {!canUpload ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <AlertTriangle size={32} className="text-amber-400/50" />
          <p className="text-sm text-muted-foreground">Esta función requiere rol de <b className="text-foreground">Registrado</b> o <b className="text-foreground">Administrador</b>.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              loading ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-card/30"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#3b82f6"; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = ""; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = ""; handleFiles(e.dataTransfer.files); }}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={24} className="text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Procesando archivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={24} className="text-muted-foreground" />
                <p className="text-xs text-foreground font-medium">Arrastrá o hacé clic</p>
                <p className="text-[10px] text-muted-foreground">.zip (SHP+DBF+PRJ) · .geojson · .kml</p>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".zip,.shp,.geojson,.json,.kml"
            multiple
            onChange={e => handleFiles(e.target.files)}
          />

          {/* Messages */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
              <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-300">{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2">
              <CheckCircle size={13} className="text-green-400 flex-shrink-0" />
              <p className="text-[11px] text-green-300">{success}</p>
            </div>
          )}

          {/* Uploaded layers list */}
          {layers.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Capas cargadas ({layers.length})
              </div>
              <div className="space-y-1.5">
                {layers.map(l => (
                  <div key={l.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card/30">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: l.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{l.name}</div>
                      <div className="text-[10px] text-muted-foreground">{l.count} features</div>
                    </div>
                    <button
                      onClick={() => toggleLayer(l.id)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        l.visible ? "border-primary/30 text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {l.visible ? "Visible" : "Oculto"}
                    </button>
                    <button onClick={() => removeLayer(l.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="rounded-lg border border-border/40 bg-card/20 px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground">Notas</p>
            <ul className="space-y-1 text-[10px] text-muted-foreground/70">
              <li>• <b className="text-foreground/60">SHP</b>: comprimí .shp + .dbf + .prj en un .zip</li>
              <li>• Las capas temporales se pierden al recargar</li>
              <li>• Admin puede agregar capas permanentes al sistema</li>
              <li>• Coordenadas aceptadas: WGS84 (EPSG:4326)</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
