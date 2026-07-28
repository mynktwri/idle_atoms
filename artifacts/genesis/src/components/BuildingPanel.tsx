import { BUILDINGS } from "../config/buildings";
import { useGameState } from "../hooks/useGameState";
import { getBuildingCost } from "../lib/gameLogic";
import { formatNumber } from "../lib/formatNumber";

export function BuildingPanel() {
  const state = useGameState();

  return (
    <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto">
      {BUILDINGS.map(b => {
        const isUnlocked = state.tier >= b.unlockTier;
        const count = state.buildings[b.id] || 0;
        const cost = getBuildingCost(b.id, count);
        const canAfford = state.joules >= cost;

        if (!isUnlocked && count === 0) {
          return (
            <div key={b.id} className="p-4 rounded-lg border border-border/30 bg-muted/20 opacity-50 flex items-center justify-center">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Locked — Tier {b.unlockTier}</span>
            </div>
          );
        }

        return (
          <div 
            key={b.id}
            className={`p-4 rounded-lg border transition-colors ${canAfford ? 'border-primary/30 bg-card hover:border-primary/50' : 'border-border/50 bg-card/50 opacity-80'}`}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold text-foreground">{b.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{b.description}</p>
              </div>
              <span className="text-xl font-bold font-mono text-primary/80">{count}</span>
            </div>
            
            <div className="flex justify-between items-end mt-4">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-mono text-muted-foreground">Output</span>
                <span className="text-xs font-mono">+{formatNumber(b.baseOutput)} J/s</span>
                {b.matterOutput && (
                  <span className="text-xs font-mono text-secondary mt-0.5">+{formatNumber(b.matterOutput)} M/s</span>
                )}
              </div>
              
              <button
                disabled={!canAfford}
                onClick={() => state.buyBuilding(b.id)}
                data-testid={`button-buy-${b.id}`}
                className={`px-4 py-2 rounded-md font-mono text-sm font-bold transition-all ${
                  canAfford 
                    ? 'bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30' 
                    : 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
                }`}
              >
                {formatNumber(cost)} J
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
