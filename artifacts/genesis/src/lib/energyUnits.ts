/**
 * Energy display — sliding unit scale
 * ===================================
 * The game's base energy unit is the **electronvolt (eV)**: that's the scale a
 * single atomic reaction actually pays out at, so it's where the player starts.
 * Every energy quantity in game state, building configs, upgrade costs and tier
 * requirements is a number of eV.
 *
 * Rather than showing "1.2K" style suffixes, the tracker slides up through real
 * physical units as the player's numbers grow:
 *
 *   eV → keV → MeV → GeV → TeV → PeV → EeV → J → kJ → MJ → … → YJ → exponential
 *
 * The eV ladder tops out at EeV (1e18 eV ≈ 0.16 J); once a quantity is worth a
 * whole joule the display switches to the joule ladder, so the sequence stays
 * monotonic and never repeats a magnitude.
 */

import { EV_TO_J } from "./atomPhysics";

/** 1 J = 6.241509074e18 eV. */
export const EV_PER_JOULE = 1 / EV_TO_J;

const EV_UNITS = ["eV", "keV", "MeV", "GeV", "TeV", "PeV", "EeV"];
const J_UNITS = ["J", "kJ", "MJ", "GJ", "TJ", "PJ", "EJ", "ZJ", "YJ"];

/** Convert a real SI joule value (e.g. from the physics model) into eV. */
export function joulesToEv(joules: number): number {
  return joules * EV_PER_JOULE;
}

/** Convert an in-game eV quantity back into real SI joules. */
export function evToJoules(ev: number): number {
  return ev * EV_TO_J;
}

/** 3-significant-figure mantissa: 8.42 / 84.2 / 842. */
function mantissa(value: number): string {
  if (value < 10) return value.toFixed(2);
  if (value < 100) return value.toFixed(1);
  return Math.round(value).toString();
}

function scale(value: number, units: string[]): string {
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  // Past the top of the ladder there is no bigger prefix — fall back to exponent
  if (value >= 1000) return `${value.toExponential(2)} ${units[i]}`;
  return `${mantissa(value)} ${units[i]}`;
}

/**
 * Format an eV quantity with the largest unit that keeps it under 1000.
 * Returns value and unit as one string, e.g. "842 eV", "12.4 keV", "1.05 MJ".
 */
export function formatEnergy(ev: number): string {
  if (!Number.isFinite(ev)) return "∞";
  if (ev <= 0) return "0 eV";
  // Sub-centi-eV dust would round to "0.00 eV" — show it as an exponent instead
  if (ev < 0.01) return `${ev.toExponential(1)} eV`;
  if (ev < EV_PER_JOULE) return scale(ev, EV_UNITS);
  return scale(ev / EV_PER_JOULE, J_UNITS);
}

/** Same scale, suffixed for a per-second rate: "+2.40 eV/s". */
export function formatEnergyRate(evPerSec: number): string {
  return `${formatEnergy(evPerSec)}/s`;
}
