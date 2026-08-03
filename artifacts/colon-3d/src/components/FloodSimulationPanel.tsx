interface FloodSimulationPanelProps {
  enabled: boolean;
  mode: "manual" | "auto";
  cotaInput: string;
  showFloodOverlay: boolean;
  loading: boolean;
  stats: { affected: number; total: number; parcial: number; cota: number } | null;
  realtimeHeight: number | null;
  realtimeLoading: boolean;
  realtimeUpdatedAt: string | null;
  onToggleEnabled: () => void;
  onSetMode: (mode: "manual" | "auto") => void;
  onToggleFloodOverlay: () => void;
  onChangeCotaInput: (value: string) => void;
  onApply: () => void;
}

export default function FloodSimulationPanel({
  enabled,
  mode,
  cotaInput,
  showFloodOverlay,
  loading,
  stats,
  realtimeHeight,
  realtimeLoading,
  realtimeUpdatedAt,
  onToggleEnabled,
  onSetMode,
  onToggleFloodOverlay,
  onChangeCotaInput,
  onApply,
}: FloodSimulationPanelProps) {
  const isAuto = mode === "auto";
  const sliderValue = (() => {
    const n = Number(cotaInput.replace(",", "."));
    return Number.isFinite(n) ? Math.min(40, Math.max(0, n)) : 10;
  })();

  return (
    <div className="w-[88vw] sm:w-72 rounded-xl overflow-hidden shadow-xl border border-border bg-black/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-200">Simulación de crecida</p>
          <p className="text-[10px] text-white/60">Control independiente del panel de capas</p>
        </div>
        <button
          type="button"
          onClick={onToggleEnabled}
          className={`text-[10px] px-2 py-1 rounded border transition-colors ${enabled ? "bg-rose-500/20 border-rose-400/50 text-rose-100" : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"}`}
        >
          {enabled ? "Visible" : "Oculta"}
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div>
          <p className="text-[10px] text-white/70 mb-1">Modo de cota</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSetMode("manual")}
              className={`text-[11px] px-2 py-1.5 rounded border transition-colors ${!isAuto ? "bg-white/15 border-white/40 text-white" : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10"}`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => onSetMode("auto")}
              className={`text-[11px] px-2 py-1.5 rounded border transition-colors ${isAuto ? "bg-sky-500/20 border-sky-400/50 text-sky-100" : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10"}`}
            >
              Automática (río)
            </button>
          </div>
        </div>

        {isAuto ? (
          <div className="rounded border border-sky-300/20 bg-sky-500/10 px-2.5 py-2">
            <p className="text-[10px] text-sky-100/85">
              {realtimeLoading ? "Leyendo altura real del río..." : realtimeHeight != null ? `Altura real aplicada: ${realtimeHeight.toFixed(2)} m` : "Esperando datos hidrométricos..."}
            </p>
            {realtimeUpdatedAt && <p className="text-[10px] text-sky-100/60 mt-1">Actualizado: {realtimeUpdatedAt}</p>}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-white/75" htmlFor="flood-cota-input">Cota (m)</label>
              <input
                id="flood-cota-input"
                type="text"
                inputMode="decimal"
                value={cotaInput}
                onChange={(e) => onChangeCotaInput(e.target.value)}
                className="w-20 h-7 rounded border border-white/20 bg-black/30 px-2 text-[11px] text-white"
                placeholder="10,00"
              />
              <button
                type="button"
                onClick={onApply}
                disabled={loading}
                className="ml-auto text-[11px] px-2.5 py-1 rounded border border-rose-300/35 text-rose-100 bg-rose-500/15 hover:bg-rose-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Calculando..." : "Aplicar"}
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-white/55 mb-1">
                <span>0 m</span>
                <span>{sliderValue.toFixed(2)} m</span>
                <span>40 m</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={0.1}
                value={sliderValue}
                onChange={(e) => onChangeCotaInput(Number(e.target.value).toFixed(2).replace(".", ","))}
                className="w-full accent-rose-400"
                aria-label="Seleccionar cota de simulacion"
              />
            </div>
          </>
        )}

        {stats && (
          <p className="text-[10px] text-white/70 border-t border-white/10 pt-2">
            Cota +{stats.cota.toFixed(2)} m: {stats.affected} parcelas (total {stats.total}, parcial {stats.parcial})
          </p>
        )}

        <div className="border-t border-white/10 pt-2">
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showFloodOverlay}
              onChange={onToggleFloodOverlay}
              className="mt-0.5 accent-sky-400"
            />
            <span className="text-[10px] text-white/75">
              Mostrar curva de crecida y zona estimada (vista visual complementaria)
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
