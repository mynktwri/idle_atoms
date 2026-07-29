export interface BuildingConfig {
  id: string;
  name: string;
  description: string;
  baseCost: number;     // cost of first purchase, in eV
  costScaling: number;  // multiplier per purchase (1.15 standard)
  baseOutput: number;   // eV/sec per building (base, before upgrades)
  unlockTier: number;   // which tier unlocks this building (1–5)
  matterOutput?: number; // matter/sec if it produces matter too
}

/**
 * The ladder starts at eV — a first Atom Collider costs about what two
 * excitation reactions pay out — and climbs into the MeV range by tier 5.
 * Every cost and output is rendered through `formatEnergy`, so the unit shown
 * slides up (eV → keV → MeV) on its own as the numbers grow.
 */
export const BUILDINGS: BuildingConfig[] = [
  {
    id: "atom-collider",
    name: "Atom Collider",
    description: "Smashes atoms together to generate quantum sparks.",
    baseCost: 15,        // 15 eV
    costScaling: 1.15,
    baseOutput: 0.15,    // eV/s
    unlockTier: 1
  },
  {
    id: "fusion-chamber",
    name: "Fusion Chamber",
    description: "Fuses atoms into stable molecules, yielding matter.",
    baseCost: 200,       // 200 eV
    costScaling: 1.15,
    baseOutput: 1.6,     // eV/s
    unlockTier: 2,
    matterOutput: 0.01
  },
  {
    id: "stellar-nursery",
    name: "Stellar Nursery",
    description: "Births protostars from vast molecular gas clouds.",
    baseCost: 2400,      // 2.40 keV
    costScaling: 1.15,
    baseOutput: 16,      // eV/s
    unlockTier: 3
  },
  {
    id: "planetary-forge",
    name: "Planetary Forge",
    description: "Condenses dense matter into living worlds.",
    baseCost: 30000,     // 30.0 keV
    costScaling: 1.15,
    baseOutput: 150,     // eV/s
    unlockTier: 4,
    matterOutput: 0.5
  },
  {
    id: "galactic-core",
    name: "Galactic Core",
    description: "Spins up a galaxy's gravitational heart.",
    baseCost: 400000,    // 400 keV
    costScaling: 1.15,
    baseOutput: 1600,    // 1.60 keV/s
    unlockTier: 5
  },
  {
    id: "dark-matter-lens",
    name: "Dark Matter Lens",
    description: "Bends spacetime to harvest dark energy.",
    baseCost: 5000000,   // 5.00 MeV
    costScaling: 1.15,
    baseOutput: 17000,   // 17.0 keV/s
    unlockTier: 5
  }
];
