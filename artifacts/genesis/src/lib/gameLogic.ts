import { BUILDINGS } from "../config/buildings";
import { UPGRADES } from "../config/upgrades";
import { GameState } from "../hooks/useGameState";

/**
 * Lifetime energy (eV) that must be earned per point of Cosmic Dust.
 * Dust = floor(sqrt(lifetimeEnergy / this)), so the first point lands at 4 MeV.
 */
export const DUST_ENERGY_DIVISOR = 4_000_000;

export function getBuildingCost(buildingId: string, owned: number): number {
  const building = BUILDINGS.find(b => b.id === buildingId);
  if (!building) return Infinity;
  return building.baseCost * Math.pow(building.costScaling, owned);
}

/** All energy quantities here are in eV — see lib/energyUnits.ts. */
export function computeRates(state: GameState) {
  let energyDelta = 0;
  let matterDelta = 0;

  // Compute base rates from buildings
  BUILDINGS.forEach(building => {
    const count = state.buildings[building.id] || 0;
    if (count > 0) {
      let bEnergyOutput = building.baseOutput * count;
      let bMatterOutput = (building.matterOutput || 0) * count;

      // Apply upgrades for this building
      UPGRADES.forEach(upg => {
        if (state.upgrades.has(upg.id)) {
          if (upg.targetBuilding === building.id && upg.multiplier) {
            bEnergyOutput *= upg.multiplier;
          }
          if (upg.targetBuilding === `${building.id}-matter` && upg.multiplier) {
            bMatterOutput *= upg.multiplier;
          }
        }
      });

      energyDelta += bEnergyOutput;
      matterDelta += bMatterOutput;
    }
  });

  // Calculate click power
  let clickPower = 1;
  if (state.upgrades.has("click-boost-1")) clickPower *= 2;
  if (state.upgrades.has("click-boost-2")) clickPower *= 5;

  // Add passive clicks if upgraded
  if (state.upgrades.has("auto-collide-1")) {
    energyDelta += clickPower; // +1 eV/sec per click power
  }

  // Apply prestige multiplier
  energyDelta *= state.prestigeMultiplier;
  matterDelta *= state.prestigeMultiplier;
  clickPower *= state.prestigeMultiplier;

  return { energyDelta, matterDelta, clickPower };
}

export function calculateCosmicDust(lifetimeEnergy: number): number {
  return Math.floor(Math.sqrt(lifetimeEnergy / DUST_ENERGY_DIVISOR));
}
