import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getBuildingCost, computeRates, calculateCosmicDust } from "../lib/gameLogic";
import { UPGRADES } from "../config/upgrades";
import { TIERS } from "../config/tiers";

export interface GameState {
  joules: number;
  matter: number;
  stardust: number; // Cosmic Dust
  lifetimeJoules: number;
  buildings: Record<string, number>;
  upgrades: Set<string>;
  tier: number;
  prestigeMultiplier: number;
  clickPower: number; // computed, but stored for ease

  // Actions
  addJoules: (amount: number, isClick?: boolean) => void;
  addMatter: (amount: number) => void;
  buyBuilding: (id: string) => void;
  buyUpgrade: (id: string) => void;
  prestige: () => void;
  resetSave: () => void;
  tick: (jouleDelta: number, matterDelta: number) => void;
}

const initialState = {
  joules: 0,
  matter: 0,
  stardust: 0,
  lifetimeJoules: 0,
  buildings: {},
  upgrades: new Set<string>(),
  tier: 1,
  prestigeMultiplier: 1,
  clickPower: 1,
};

export const useGameState = create<GameState>()(
  persist(
    (set, get) => ({
      ...initialState,

      addJoules: (amount: number, isClick = false) => {
        set((state) => {
          const newJoules = state.joules + amount;
          const newLifetime = state.lifetimeJoules + amount;
          
          let newTier = state.tier;
          TIERS.forEach(t => {
            if (newLifetime >= t.lifetimeJoulesReq && t.level > newTier) {
              newTier = t.level;
            }
          });

          return {
            joules: newJoules,
            lifetimeJoules: newLifetime,
            tier: newTier
          };
        });
      },

      addMatter: (amount: number) => {
        set((state) => ({ matter: state.matter + amount }));
      },

      tick: (jouleDelta: number, matterDelta: number) => {
        set((state) => {
          const newJoules = state.joules + (jouleDelta * 0.2);
          const newLifetime = state.lifetimeJoules + (jouleDelta * 0.2);
          const newMatter = state.matter + (matterDelta * 0.2);
          
          let newTier = state.tier;
          TIERS.forEach(t => {
            if (newLifetime >= t.lifetimeJoulesReq && t.level > newTier) {
              newTier = t.level;
            }
          });

          return {
            joules: newJoules,
            lifetimeJoules: newLifetime,
            matter: newMatter,
            tier: newTier
          };
        });
      },

      buyBuilding: (id: string) => {
        const state = get();
        const count = state.buildings[id] || 0;
        const cost = getBuildingCost(id, count);

        if (state.joules >= cost) {
          set((s) => ({
            joules: s.joules - cost,
            buildings: { ...s.buildings, [id]: count + 1 }
          }));
        }
      },

      buyUpgrade: (id: string) => {
        const state = get();
        const upg = UPGRADES.find(u => u.id === id);
        
        if (upg && state.joules >= upg.cost && !state.upgrades.has(id)) {
          const newUpgrades = new Set(state.upgrades);
          newUpgrades.add(id);
          set((s) => ({
            joules: s.joules - upg.cost,
            upgrades: newUpgrades
          }));
        }
      },

      prestige: () => {
        const state = get();
        const earnedDust = calculateCosmicDust(state.lifetimeJoules);
        
        if (state.tier >= 5 && earnedDust >= 1) {
          const newStardust = state.stardust + earnedDust;
          const newMultiplier = 1 + (newStardust * 0.1);
          
          set({
            ...initialState,
            buildings: {},
            upgrades: new Set<string>(),
            stardust: newStardust,
            prestigeMultiplier: newMultiplier,
            clickPower: newMultiplier
          });
        }
      },

      resetSave: () => {
        set({ ...initialState, buildings: {}, upgrades: new Set<string>() });
      }
    }),
    {
      name: "genesis_save",
      storage: createJSONStorage(() => localStorage),
      // Need to handle Map/Set serialization
      partialize: (state) => ({
        ...state,
        upgrades: Array.from(state.upgrades),
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        upgrades: new Set(persistedState.upgrades || []),
      })
    }
  )
);
