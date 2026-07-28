import { motion } from "framer-motion";
import { useGameState } from "../hooks/useGameState";
import { computeRates } from "../lib/gameLogic";
import { formatNumber } from "../lib/formatNumber";

export function CollideButton() {
  const state = useGameState();
  const rates = computeRates(state);

  return (
    <div className="p-6 flex flex-col items-center justify-center border-b border-border/50">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => state.addJoules(rates.clickPower, true)}
        className="w-full max-w-[280px] py-6 px-4 rounded-xl bg-gradient-to-b from-primary/20 to-primary/5 border border-primary/30 text-primary-foreground font-semibold text-lg shadow-[0_0_15px_rgba(138,43,226,0.15)] hover:shadow-[0_0_25px_rgba(138,43,226,0.3)] transition-shadow duration-300 group"
        data-testid="button-manual-collide"
      >
        <span className="block mb-1 group-active:text-white transition-colors">INITIATE COLLISION</span>
        <span className="block text-sm font-mono font-normal text-primary/70">
          +{formatNumber(rates.clickPower)} J
        </span>
      </motion.button>
    </div>
  );
}
