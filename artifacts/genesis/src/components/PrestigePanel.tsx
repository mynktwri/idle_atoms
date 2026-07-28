import { useGameState } from "../hooks/useGameState";
import { calculateCosmicDust } from "../lib/gameLogic";
import { formatNumber } from "../lib/formatNumber";
import { motion } from "framer-motion";
import { useState } from "react";

export function PrestigePanel() {
  const state = useGameState();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const potentialDust = calculateCosmicDust(state.lifetimeJoules);
  const isEligible = state.tier >= 5;
  const canPrestige = isEligible && potentialDust >= 1;

  const handlePrestige = () => {
    state.prestige();
    setConfirmOpen(false);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 relative">
      <div className="mb-8 text-center space-y-2">
        <h2 className="text-2xl font-light tracking-widest text-accent">THE BIG CRUNCH</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Collapse your universe into a singularity. All Joules, Matter, Buildings, and Upgrades will be destroyed.<br/>
          You will be reborn with Cosmic Dust.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-4 rounded-xl bg-card border border-border flex flex-col items-center justify-center">
          <span className="text-xs font-mono text-muted-foreground uppercase mb-1">Current Dust</span>
          <span className="text-2xl font-bold text-accent drop-shadow-[0_0_8px_rgba(255,20,147,0.5)]">
            {formatNumber(state.stardust)}
          </span>
        </div>
        <div className="p-4 rounded-xl bg-card border border-border flex flex-col items-center justify-center">
          <span className="text-xs font-mono text-muted-foreground uppercase mb-1">Multiplier</span>
          <span className="text-2xl font-bold text-primary">
            x{(state.prestigeMultiplier).toFixed(1)}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-accent/30 rounded-xl p-6 bg-accent/5">
        <span className="text-sm font-mono text-muted-foreground uppercase mb-2">Dust on Collapse</span>
        <span className="text-5xl font-bold text-accent mb-6">+{formatNumber(potentialDust)}</span>

        {!isEligible ? (
          <p className="text-xs text-muted-foreground text-center font-mono">
            Requires Tier 5 (Galactic)<br/>Current: Tier {state.tier}
          </p>
        ) : !canPrestige ? (
          <p className="text-xs text-muted-foreground text-center font-mono">
            Requires at least 1 Cosmic Dust potential.<br/>
            (Reach {formatNumber(1000000)} lifetime Joules)
          </p>
        ) : confirmOpen ? (
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <span className="text-xs text-destructive text-center uppercase tracking-widest mb-2 font-bold">Are you absolutely sure?</span>
            <button
              onClick={handlePrestige}
              className="w-full py-3 rounded-md bg-destructive/20 text-destructive border border-destructive hover:bg-destructive hover:text-white transition-colors font-bold tracking-wider"
              data-testid="button-confirm-prestige"
            >
              COLLAPSE UNIVERSE
            </button>
            <button
              onClick={() => setConfirmOpen(false)}
              className="w-full py-3 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              CANCEL
            </button>
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setConfirmOpen(true)}
            className="px-8 py-4 rounded-lg bg-accent text-white font-bold tracking-widest shadow-[0_0_20px_rgba(255,20,147,0.4)]"
            data-testid="button-initiate-prestige"
          >
            INITIATE BIG CRUNCH
          </motion.button>
        )}
      </div>
      
      {state.stardust > 0 && (
         <p className="text-xs text-center text-muted-foreground mt-6">
           Each Cosmic Dust permanently increases all production by 10%.
         </p>
      )}
    </div>
  );
}
