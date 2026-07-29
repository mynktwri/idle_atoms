import { GameState } from '../hooks/useGameState';

export interface UpgradeConfig {
  id: string;
  name: string;
  description: string;
  cost: number;           // eV
  unlockCondition: (state: GameState) => boolean;  // when it appears in the shop
  effect: string;         // description of the effect
  multiplier?: number;    // for simple multiplier effects
  targetBuilding?: string; // which building this applies to
}

/**
 * Costs sit on the same eV ladder as the buildings: the first upgrade is a few
 * dozen eV — reachable from raw reactions alone — and the late ones run into
 * the hundreds of keV.
 */
export const UPGRADES: UpgradeConfig[] = [
  {
    id: "click-boost-1",
    name: "Quantum Spark",
    description: "Manual click power ×2.",
    cost: 60,        // 60 eV
    unlockCondition: () => true,
    effect: "Click power ×2",
    multiplier: 2
  },
  {
    id: "click-boost-2",
    name: "Quantum Burst",
    description: "Manual click power ×5.",
    cost: 900,       // 900 eV
    unlockCondition: (state) => state.upgrades.has("click-boost-1"),
    effect: "Click power ×5",
    multiplier: 5
  },
  {
    id: "collider-boost-1",
    name: "Resonance Field",
    description: "Atom Colliders ×2 output.",
    cost: 400,       // 400 eV
    unlockCondition: (state) => (state.buildings["atom-collider"] || 0) >= 10,
    effect: "Atom Colliders ×2",
    multiplier: 2,
    targetBuilding: "atom-collider"
  },
  {
    id: "collider-boost-2",
    name: "Particle Storm",
    description: "Atom Colliders ×4 output.",
    cost: 4500,      // 4.50 keV
    unlockCondition: (state) => (state.buildings["atom-collider"] || 0) >= 50,
    effect: "Atom Colliders ×4",
    multiplier: 4,
    targetBuilding: "atom-collider"
  },
  {
    id: "fusion-boost",
    name: "Chain Reaction",
    description: "Fusion Chambers ×2 output.",
    cost: 12000,     // 12.0 keV
    unlockCondition: (state) => (state.buildings["fusion-chamber"] || 0) >= 10,
    effect: "Fusion Chambers ×2",
    multiplier: 2,
    targetBuilding: "fusion-chamber"
  },
  {
    id: "stellar-boost",
    name: "Nebula Tap",
    description: "Stellar Nurseries ×3 output.",
    cost: 120000,    // 120 keV
    unlockCondition: (state) => (state.buildings["stellar-nursery"] || 0) >= 10,
    effect: "Stellar Nurseries ×3",
    multiplier: 3,
    targetBuilding: "stellar-nursery"
  },
  {
    id: "auto-collide-1",
    name: "Automated Lab",
    description: "+1 eV/sec passive click income added to production.",
    cost: 150,       // 150 eV
    unlockCondition: (state) => (state.buildings["atom-collider"] || 0) >= 5,
    effect: "+1 eV/sec passive"
  },
  {
    id: "matter-harvest",
    name: "Matter Condenser",
    description: "Fusion Chambers produce ×3 matter.",
    cost: 25000,     // 25.0 keV
    unlockCondition: (state) => state.matter > 10,
    effect: "Fusion Chambers matter ×3",
    multiplier: 3,
    targetBuilding: "fusion-chamber-matter"
  }
];
