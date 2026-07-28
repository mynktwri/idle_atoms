import { motion } from "framer-motion";
import { requestSpawnAtom } from "../lib/atomSpawner";

export function CollideButton() {
  return (
    <div className="p-6 flex flex-col items-center justify-center border-b border-border/50">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => requestSpawnAtom()}
        className="w-full max-w-[280px] py-6 px-4 rounded-xl bg-gradient-to-b from-primary/20 to-primary/5 border border-primary/30 text-primary-foreground font-semibold text-lg shadow-[0_0_15px_rgba(138,43,226,0.15)] hover:shadow-[0_0_25px_rgba(138,43,226,0.3)] transition-shadow duration-300 group"
        data-testid="button-manual-collide"
      >
        <span className="block mb-1 group-active:text-white transition-colors">ADD ATOM</span>
        <span className="block text-sm font-mono font-normal text-primary/70">
          release into the chamber
        </span>
      </motion.button>
    </div>
  );
}
