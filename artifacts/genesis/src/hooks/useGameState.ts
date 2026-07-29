import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getBuildingCost, computeRates, calculateCosmicDust } from "../lib/gameLogic";
import { UPGRADES } from "../config/upgrades";
import { TIERS } from "../config/tiers";

/**
 * All energy in this store is measured in **electronvolts (eV)** — the scale a
 * single atomic reaction pays out at. See lib/energyUnits.ts for the sliding
 * unit scale used to display it (eV → keV → MeV → … → J → kJ …).
 */
export interface GameState {
  energy: number;          // eV
  matter: number;
  stardust: number; // Cosmic Dust
  lifetimeEnergy: number;  // eV
  buildings: Record<string, number>;
  upgrades: Set<string>;
  tier: number;
  prestigeMultiplier: number;
  clickPower: number;      // eV per click, computed, but stored for ease

  // Actions
  addEnergy: (amount: number, isClick?: boolean) => void;
  addMatter: (amount: number) => void;
  buyBuilding: (id: string) => void;
  buyUpgrade: (id: string) => void;
  prestige: () => void;
  resetSave: () => void;
  tick: (energyDelta: number, matterDelta: number) => void;
}

const initialState = {
  energy: 0,
  matter: 0,
  stardust: 0,
  lifetimeEnergy: 0,
  buildings: {},
  upgrades: new Set<string>(),
  tier: 1,
  prestigeMultiplier: 1,
  clickPower: 1,
};

/**
 * Bring a persisted save onto the current schema.
 *
 * v1 stored `joules` / `lifetimeJoules`. The economy is now denominated in eV
 * on the same numeric ladder — building costs and tier requirements kept their
 * magnitudes — so the stored amounts carry over 1:1 and only the field names
 * and the displayed unit change.
 */
function migrateSave(persisted: any): any {
  if (!persisted) return persisted;
  const { joules, lifetimeJoules, ...rest } = persisted;
  if (joules === undefined && lifetimeJoules === undefined) return persisted;
  return {
    ...rest,
    energy: rest.energy ?? joules ?? 0,
    lifetimeEnergy: rest.lifetimeEnergy ?? lifetimeJoules ?? 0,
  };
}

export const useGameState = create<GameState>()(
  persist(
    (set, get) => ({
      ...initialState,

      addEnergy: (amount: number, isClick = false) => {
        set((state) => {
          const newEnergy = state.energy + amount;
          const newLifetime = state.lifetimeEnergy + amount;
          
          let newTier = state.tier;
          TIERS.forEach(t => {
            if (newLifetime >= t.lifetimeEnergyReq && t.level > newTier) {
              newTier = t.level;
            }
          });

          return {
            energy: newEnergy,
            lifetimeEnergy: newLifetime,
            tier: newTier
          };
        });
      },

      addMatter: (amount: number) => {
        set((state) => ({ matter: state.matter + amount }));
      },

      tick: (energyDelta: number, matterDelta: number) => {
        set((state) => {
          const newEnergy = state.energy + (energyDelta * 0.2);
          const newLifetime = state.lifetimeEnergy + (energyDelta * 0.2);
          const newMatter = state.matter + (matterDelta * 0.2);
          
          let newTier = state.tier;
          TIERS.forEach(t => {
            if (newLifetime >= t.lifetimeEnergyReq && t.level > newTier) {
              newTier = t.level;
            }
          });

          return {
            energy: newEnergy,
            lifetimeEnergy: newLifetime,
            matter: newMatter,
            tier: newTier
          };
        });
      },

      buyBuilding: (id: string) => {
        const state = get();
        const count = state.buildings[id] || 0;
        const cost = getBuildingCost(id, count);

        if (state.energy >= cost) {
          set((s) => ({
            energy: s.energy - cost,
            buildings: { ...s.buildings, [id]: count + 1 }
          }));
        }
      },

      buyUpgrade: (id: string) => {
        const state = get();
        const upg = UPGRADES.find(u => u.id === id);
        
        if (upg && state.energy >= upg.cost && !state.upgrades.has(id)) {
          const newUpgrades = new Set(state.upgrades);
          newUpgrades.add(id);
          set((s) => ({
            energy: s.energy - upg.cost,
            upgrades: newUpgrades
          }));
        }
      },

      prestige: () => {
        const state = get();
        const earnedDust = calculateCosmicDust(state.lifetimeEnergy);
        
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
      version: 2,
      // Need to handle Map/Set serialization
      partialize: (state) => ({
        ...state,
        upgrades: Array.from(state.upgrades),
      }),
      // The rename happens here rather than in `migrate`: pre-v2 saves were
      // written before this store declared a `version`, and zustand only runs
      // `migrate` when the stored version is a number — so those saves would
      // slip past it entirely. `merge` runs on every hydration.
      merge: (persistedState: any, currentState) => {
        const persisted = migrateSave(persistedState);
        return {
          ...currentState,
          ...persisted,
          upgrades: new Set(persisted.upgrades || []),
        };
      }
    }
  )
);
