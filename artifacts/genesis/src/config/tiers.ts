export interface TierConfig {
  level: number;
  name: string;
  /** Lifetime energy required to reach this tier, in eV. */
  lifetimeEnergyReq: number;
  unlocksDescription: string;
}

/**
 * One tier per order-of-magnitude step up the eV ladder: the player crosses
 * into keV around Stellar and into MeV at Galactic, so the resource readout's
 * unit visibly slides as the universe grows.
 */
export const TIERS: TierConfig[] = [
  {
    level: 1,
    name: "Atomic",
    lifetimeEnergyReq: 0,              // eV
    unlocksDescription: "Atom Collider"
  },
  {
    level: 2,
    name: "Molecular",
    lifetimeEnergyReq: 150,            // 150 eV
    unlocksDescription: "Fusion Chamber; Matter resource visible"
  },
  {
    level: 3,
    name: "Stellar",
    lifetimeEnergyReq: 8000,           // 8.00 keV
    unlocksDescription: "Stellar Nursery; reaction window changes color"
  },
  {
    level: 4,
    name: "Planetary",
    lifetimeEnergyReq: 200000,         // 200 keV
    unlocksDescription: "Planetary Forge"
  },
  {
    level: 5,
    name: "Galactic",
    lifetimeEnergyReq: 4000000,        // 4.00 MeV
    unlocksDescription: "Galactic Core + Dark Matter Lens; prestige becomes available"
  }
];
