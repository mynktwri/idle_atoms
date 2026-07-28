import { useGameState } from "../hooks/useGameState";
import { formatNumber } from "../lib/formatNumber";
import { computeRates } from "../lib/gameLogic";

export function ResourceBar() {
  const state = useGameState();
  const rates = computeRates(state);

  return (
    <div className="w-full flex flex-col gap-2 p-6 border-b border-border/50 bg-card/30 backdrop-blur-sm">
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Joules</span>
          <div className="text-4xl font-mono font-bold tracking-tight text-primary drop-shadow-[0_0_8px_rgba(138,43,226,0.5)]">
            {formatNumber(state.joules)}
          </div>
          <span className="text-xs font-mono text-muted-foreground mt-1">
            +{formatNumber(rates.jouleDelta)} / sec
          </span>
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono font-medium text-primary">
            TIER {state.tier}
          </div>
          
          {state.tier >= 2 && (
            <div className="flex flex-col items-end mt-2">
              <span className="text-xs font-mono text-muted-foreground uppercase">Matter</span>
              <span className="text-lg font-mono font-semibold text-secondary drop-shadow-[0_0_5px_rgba(0,191,255,0.4)]">
                {formatNumber(state.matter)}
              </span>
              {rates.matterDelta > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  +{formatNumber(rates.matterDelta)} / sec
                </span>
              )}
            </div>
          )}

          {state.stardust > 0 && (
            <div className="flex flex-col items-end mt-2">
              <span className="text-xs font-mono text-accent uppercase">Cosmic Dust</span>
              <span className="text-lg font-mono font-semibold text-accent drop-shadow-[0_0_5px_rgba(255,20,147,0.4)]">
                {formatNumber(state.stardust)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
