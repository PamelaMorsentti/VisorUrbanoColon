import { useState } from "react";
import { ChevronDown, ChevronRight, Layers, Eye, EyeOff } from "lucide-react";
import { LAYERS, LAYER_GROUPS } from "@/lib/layers";

interface LayersPanelProps {
  visibleLayers: Record<string, boolean>;
  onToggleLayer: (layerId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function LayersPanel({ visibleLayers, onToggleLayer, isOpen, onClose }: LayersPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  if (!isOpen) return null;

  return (
    <div
      className="absolute top-14 left-3 w-64 rounded-xl overflow-hidden shadow-xl border border-border"
      style={{ background: "hsl(220 16% 12%)", maxHeight: "calc(100vh - 80px)", zIndex: 1001 }}
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

      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 150px)" }}>
        {LAYER_GROUPS.map(group => {
          const groupLayers = LAYERS.filter(l => l.group === group);
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
                      <div
                        key={layer.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer group"
                        onClick={() => onToggleLayer(layer.id)}
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
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {isVisible ? (
                            <Eye size={12} className="text-primary" />
                          ) : (
                            <EyeOff size={12} className="text-muted-foreground" />
                          )}
                        </span>
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
  );
}
