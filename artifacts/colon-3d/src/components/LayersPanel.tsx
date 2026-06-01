import { useState } from "react";
import { ChevronDown, ChevronRight, Layers, Eye, EyeOff, Globe, Download } from "lucide-react";
import { LAYERS, LAYER_GROUPS, type ExternalLayerDef } from "@/lib/layers";

interface LayersPanelProps {
  visibleLayers: Record<string, boolean>;
  onToggleLayer: (layerId: string) => void;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  visibleExternalLayers: Record<string, boolean>;
  onToggleExternalLayer: (layerId: string) => void;
  /** External layer definitions from the catalog (API or static fallback) */
  externalLayers: ExternalLayerDef[];
  /** Ordered list of external group names */
  externalLayerGroups: string[];
  manzanaVisualMode: "suaves" | "normales";
  onChangeManzanaVisualMode: (mode: "suaves" | "normales") => void;
}

export default function LayersPanel({ visibleLayers, onToggleLayer, isOpen, onClose, isAdmin, visibleExternalLayers, onToggleExternalLayer, externalLayers, externalLayerGroups, manzanaVisualMode, onChangeManzanaVisualMode }: LayersPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [manzanaOptionsOpen, setManzanaOptionsOpen] = useState(false);

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  if (!isOpen) return null;

  return (
    <div
      className="w-[88vw] sm:w-72 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)" }}
      data-testid="layers-panel"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Capas</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors text-xs"
          data-testid="button-close-layers"
        >
          ✕
        </button>
      </div>

      <div className="overflow-y-auto">
        {LAYER_GROUPS.map(group => {
          const groupLayers = LAYERS.filter(l => l.group === group && (!l.adminOnly || isAdmin));
          if (groupLayers.length === 0) return null;
          const isCollapsed = collapsedGroups[group];
          const visibleCount = groupLayers.filter(l => visibleLayers[l.id]).length;

          return (
            <div key={group} className="border-b border-border last:border-b-0">
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent transition-colors"
                onClick={() => toggleGroup(group)}
                data-testid={`group-toggle-${group}`}
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight size={13} className="text-muted-foreground" />
                  ) : (
                    <ChevronDown size={13} className="text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</span>
                </div>
                {visibleCount > 0 && (
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                    {visibleCount}
                  </span>
                )}
              </button>

              {!isCollapsed && (
                <div className="pb-1">
                  {groupLayers.map(layer => {
                    const isVisible = visibleLayers[layer.id] ?? layer.defaultVisible;
                    return (
                      <div key={layer.id}>
                        <div
                          className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer group"
                          onClick={() => {
                            const nextVisible = !isVisible;
                            onToggleLayer(layer.id);
                            if (layer.id === "manzana" && nextVisible) setManzanaOptionsOpen(true);
                          }}
                          data-testid={`layer-toggle-${layer.id}`}
                          title={layer.description}
                        >
                          <div
                            className="w-3.5 h-3.5 rounded-sm flex-shrink-0 ring-1 ring-white/10"
                            style={{
                              background: isVisible ? layer.color : "transparent",
                              borderColor: layer.color,
                              border: `2px solid ${layer.color}`,
                            }}
                          />
                          <span
                            className={`text-xs flex-1 transition-colors ${
                              isVisible ? "text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {layer.label}
                            {layer.lazy && (
                              <span className="ml-1 text-[9px] text-muted-foreground opacity-60">(bajo demanda)</span>
                            )}
                          </span>

                          {/* Descarga disponible para todos los usuarios en capas públicas,
                              y para admins en capas adminOnly */}
                          {(!layer.adminOnly || isAdmin) && (
                            <a
                              href={`/data/${layer.file}`}
                              download={layer.file}
                              onClick={(e) => e.stopPropagation()}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1 py-0.5 rounded border border-white/20 text-white/60 hover:text-white hover:bg-white/10 flex items-center"
                              title={`Descargar ${layer.label} (GeoJSON)`}
                            >
                              <Download size={10} />
                            </a>
                          )}

                          {layer.id === "manzana" && isVisible && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setManzanaOptionsOpen((v) => !v);
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-white/20 text-white/80 hover:bg-white/10"
                              aria-label="Opciones de manzanas"
                            >
                              {manzanaOptionsOpen ? "Ocultar" : "Modo"}
                            </button>
                          )}

                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {isVisible ? (
                              <Eye size={12} className="text-primary" />
                            ) : (
                              <EyeOff size={12} className="text-muted-foreground" />
                            )}
                          </span>
                        </div>

                        {layer.id === "manzana" && isVisible && manzanaOptionsOpen && (
                          <div className="mx-4 mb-2 px-2 py-2 rounded bg-black/35 border border-white/10">
                            <p className="text-[10px] text-white/70 mb-1">Modo visual de manzanas</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeManzanaVisualMode("suaves");
                                }}
                                className={`px-2 py-1 text-[11px] rounded border transition-colors ${manzanaVisualMode === "suaves" ? "bg-white/20 border-white/40 text-white" : "bg-white/10 hover:bg-white/15 border-white/20 text-white/80"}`}
                              >
                                Suaves
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeManzanaVisualMode("normales");
                                }}
                                className={`px-2 py-1 text-[11px] rounded border transition-colors ${manzanaVisualMode === "normales" ? "bg-white/20 border-white/40 text-white" : "bg-white/10 hover:bg-white/15 border-white/20 text-white/80"}`}
                              >
                                Normales
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Capas externas (TMS / WMS) ──────────────────────────────── */}
        <div className="border-t border-border mt-1">
          <div className="px-4 py-2.5 flex items-center gap-2">
            <Globe size={13} className="text-sky-400" />
            <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Capas externas</span>
            <span className="ml-auto text-[9px] text-muted-foreground/60">TMS / WMS</span>
          </div>
          {externalLayerGroups.map(group => {
            const groupLayers = externalLayers.filter(l => l.group === group);
            if (groupLayers.length === 0) return null;
            const isCollapsed = collapsedGroups[`ext_${group}`];
            const visibleCount = groupLayers.filter(l => visibleExternalLayers[l.id]).length;
            return (
              <div key={group} className="border-b border-border/50 last:border-b-0">
                <button
                  className="w-full flex items-center justify-between px-4 py-2 hover:bg-accent transition-colors"
                  onClick={() => toggleGroup(`ext_${group}`)}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight size={13} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown size={13} className="text-muted-foreground" />
                    )}
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</span>
                  </div>
                  {visibleCount > 0 && (
                    <span className="text-xs bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full">{visibleCount}</span>
                  )}
                </button>
                {!isCollapsed && (
                  <div className="pb-1">
                    {groupLayers.map(layer => {
                      const isVisible = visibleExternalLayers[layer.id] ?? false;
                      return (
                        <div key={layer.id}>
                          <div
                            className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer group"
                            onClick={() => onToggleExternalLayer(layer.id)}
                            title={layer.description}
                          >
                            <div
                              className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                              style={{
                                background: isVisible ? layer.color : "transparent",
                                border: `2px solid ${layer.color}`,
                              }}
                            />
                            <span className={`text-xs flex-1 transition-colors ${isVisible ? "text-foreground" : "text-muted-foreground"}`}>
                              {layer.label}
                              <span className="ml-1 text-[9px] text-muted-foreground/50">{layer.type.toUpperCase()}</span>
                            </span>
                            {layer.healthStatus && layer.healthStatus !== "unknown" && (
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  background:
                                    layer.healthStatus === "ok" ? "#22c55e" :
                                    layer.healthStatus === "degraded" ? "#eab308" :
                                    "#ef4444",
                                }}
                                title={`Estado del servicio: ${layer.healthStatus}`}
                              />
                            )}
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                              {isVisible ? (
                                <Eye size={12} className="text-sky-400" />
                              ) : (
                                <EyeOff size={12} className="text-muted-foreground" />
                              )}
                            </span>
                          </div>
                          {isVisible && layer.legend && layer.legend.length > 0 && (
                            <div className="mx-4 mb-2 px-2 py-1.5 rounded bg-black/30 border border-white/5">
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                {layer.legend.map(entry => (
                                  <div key={entry.label} className="flex items-center gap-1.5 min-w-0">
                                    <div
                                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-white/10"
                                      style={{
                                        background: entry.color === "transparent" ? "transparent" : entry.color,
                                        borderColor: entry.color === "transparent" ? "#555" : entry.color,
                                        border: `1.5px solid ${entry.color === "transparent" ? "#555" : entry.color}`,
                                      }}
                                    />
                                    <span className="text-[9px] text-muted-foreground/80 truncate leading-tight">
                                      {entry.label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// helper consumed only by this file
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ExternalLayerDefUsed = ExternalLayerDef;
