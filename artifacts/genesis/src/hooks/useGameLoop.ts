import { useEffect, useRef } from "react";
import { useGameState } from "./useGameState";
import { computeRates } from "../lib/gameLogic";

export function useGameLoop() {
  const state = useGameState();
  const lastSaveTime = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const rates = computeRates(state);
      state.tick(rates.jouleDelta, rates.matterDelta);
    }, 200);

    return () => clearInterval(interval);
  }, [state]);

  // We could implement autosave by leveraging Zustand persist automatically,
  // but let's manually trigger a re-render or save loop if needed, 
  // actually Zustand persist autosaves whenever state changes.
  // We can just trust Zustand to save.
}
