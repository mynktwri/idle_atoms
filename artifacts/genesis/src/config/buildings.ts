export interface BuildingConfig {
  id: string;
  name: string;
  description: string;
  baseCost: number;     // cost of first purchase, in joules
  costScaling: number;  // multiplier per purchase (1.15 standard)
  baseOutput: number;   // joules/sec per building (base, before upgrades)
  unlockTier: number;   // which tier unlocks this building (1–5)
  matterOutput?: number; // matter/sec if it produces matter too
}

export const BUILDINGS: BuildingConfig[] = [
  {
    id: "atom-collider",
    name: "Atom Collider",
    description: "Smashes atoms together to generate quantum sparks.",
    baseCost: 10,
    costScaling: 1.15,
    baseOutput: 0.1,
    unlockTier: 1
  },
  {
    id: "fusion-chamber",
    name: "Fusion Chamber",
    description: "Fuses atoms into stable molecules, yielding matter.",
    baseCost: 100,
    costScaling: 1.15,
    baseOutput: 0.8,
    unlockTier: 2,
    matterOutput: 0.01
  },
  {
    id: "stellar-nursery",
    name: "Stellar Nursery",
    description: "Births protostars from vast molecular gas clouds.",
    baseCost: 1200,
    costScaling: 1.15,
    baseOutput: 8,
    unlockTier: 3
  },
  {
    id: "planetary-forge",
    name: "Planetary Forge",
    description: "Condenses dense matter into living worlds.",
    baseCost: 15000,
    costScaling: 1.15,
    baseOutput: 75,
    unlockTier: 4,
    matterOutput: 0.5
  },
  {
    id: "galactic-core",
    name: "Galactic Core",
    description: "Spins up a galaxy's gravitational heart.",
    baseCost: 200000,
    costScaling: 1.15,
    baseOutput: 800,
    unlockTier: 5
  },
  {
    id: "dark-matter-lens",
    name: "Dark Matter Lens",
    description: "Bends spacetime to harvest dark energy.",
    baseCost: 2500000,
    costScaling: 1.15,
    baseOutput: 8500,
    unlockTier: 5
  }
];
