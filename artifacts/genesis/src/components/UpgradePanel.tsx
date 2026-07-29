import { UPGRADES } from "../config/upgrades";
import { useGameState } from "../hooks/useGameState";
import { formatEnergy } from "../lib/energyUnits";

export function UpgradePanel() {
  const state = useGameState();

  const visibleUpgrades = UPGRADES.filter(u => u.unlockCondition(state) && !state.upgrades.has(u.id));
  const purchasedCount = state.upgrades.size;
  const totalCount = UPGRADES.length;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-3">
      <div className="flex justify-between items-center px-1 mb-2">
        <span className="text-xs font-mono text-muted-foreground uppercase">Available Upgrades</span>
        <span className="text-xs font-mono text-primary/70">{purchasedCount}/{totalCount} Owned</span>
      </div>

      {visibleUpgrades.length === 0 && (
        <div className="p-8 text-center border border-dashed border-border/50 rounded-lg">
          <p className="text-sm text-muted-foreground">No upgrades available right now.<br/>Keep expanding your universe.</p>
        </div>
      )}

      {visibleUpgrades.map(u => {
        const canAfford = state.energy >= u.cost;
        return (
          <div key={u.id} className={`p-4 rounded-lg border ${canAfford ? 'border-accent/40 bg-accent/5' : 'border-border/50 bg-card/50 opacity-80'}`}>
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-accent-foreground">{u.name}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{u.description}</p>
            <div className="text-[10px] font-mono text-accent/80 mb-3 uppercase tracking-wider">{u.effect}</div>
            
            <div className="flex justify-end">
              <button
                disabled={!canAfford}
                onClick={() => state.buyUpgrade(u.id)}
                data-testid={`button-buy-upg-${u.id}`}
                className={`px-4 py-2 rounded-md font-mono text-sm font-bold transition-all ${
                  canAfford 
                    ? 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30' 
                    : 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
                }`}
              >
                {formatEnergy(u.cost)}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
