import { BUILDINGS } from "../config/buildings";
import { UPGRADES } from "../config/upgrades";
import { GameState } from "../hooks/useGameState";

export function getBuildingCost(buildingId: string, owned: number): number {
  const building = BUILDINGS.find(b => b.id === buildingId);
  if (!building) return Infinity;
  return building.baseCost * Math.pow(building.costScaling, owned);
}

export function computeRates(state: GameState) {
  let jouleDelta = 0;
  let matterDelta = 0;

  // Compute base rates from buildings
  BUILDINGS.forEach(building => {
    const count = state.buildings[building.id] || 0;
    if (count > 0) {
      let bJouleOutput = building.baseOutput * count;
      let bMatterOutput = (building.matterOutput || 0) * count;

      // Apply upgrades for this building
      UPGRADES.forEach(upg => {
        if (state.upgrades.has(upg.id)) {
          if (upg.targetBuilding === building.id && upg.multiplier) {
            bJouleOutput *= upg.multiplier;
          }
          if (upg.targetBuilding === `${building.id}-matter` && upg.multiplier) {
            bMatterOutput *= upg.multiplier;
          }
        }
      });

      jouleDelta += bJouleOutput;
      matterDelta += bMatterOutput;
    }
  });

  // Calculate click power
  let clickPower = 1;
  if (state.upgrades.has("click-boost-1")) clickPower *= 2;
  if (state.upgrades.has("click-boost-2")) clickPower *= 5;

  // Add passive clicks if upgraded
  if (state.upgrades.has("auto-collide-1")) {
    jouleDelta += clickPower; // +1 click per second
  }

  // Apply prestige multiplier
  jouleDelta *= state.prestigeMultiplier;
  matterDelta *= state.prestigeMultiplier;
  clickPower *= state.prestigeMultiplier;

  return { jouleDelta, matterDelta, clickPower };
}

export function calculateCosmicDust(lifetimeJoules: number): number {
  return Math.floor(Math.sqrt(lifetimeJoules / 1000000));
}
