export interface TierConfig {
  level: number;
  name: string;
  lifetimeJoulesReq: number;
  unlocksDescription: string;
}

export const TIERS: TierConfig[] = [
  {
    level: 1,
    name: "Atomic",
    lifetimeJoulesReq: 0,
    unlocksDescription: "Atom Collider"
  },
  {
    level: 2,
    name: "Molecular",
    lifetimeJoulesReq: 100,
    unlocksDescription: "Fusion Chamber; Matter resource visible"
  },
  {
    level: 3,
    name: "Stellar",
    lifetimeJoulesReq: 5000,
    unlocksDescription: "Stellar Nursery; reaction window changes color"
  },
  {
    level: 4,
    name: "Planetary",
    lifetimeJoulesReq: 100000,
    unlocksDescription: "Planetary Forge"
  },
  {
    level: 5,
    name: "Galactic",
    lifetimeJoulesReq: 2000000,
    unlocksDescription: "Galactic Core + Dark Matter Lens; prestige becomes available"
  }
];
