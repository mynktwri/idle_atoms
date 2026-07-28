/**
 * Atom-Atom Collision Model — Elastic / Excitation / Ionization Threshold
 * =========================================================================
 * 2D particle-collision physics restricted to H-H style atoms (no chemistry,
 * no bonding). Kinetic energy along the impact axis is checked against
 * hydrogen's real excitation/ionization thresholds. Below threshold: perfectly
 * elastic. At or above threshold: a fixed quantum of energy (10.2 eV or
 * 13.6 eV) is removed from the collision, and above 13.6 eV a photoelectron
 * is spawned carrying the leftover energy.
 *
 * Ported from a reference Python model. The physical constants below are
 * real (CODATA / Bohr-model hydrogen levels: E_n = -13.6 eV / n^2). The one
 * game-balance knob is VELOCITY_SCALE, which maps the sim's px/sec velocity
 * units onto m/s so the real eV thresholds are reachable at in-game
 * collision speeds — ambient drifting mostly stays elastic, while
 * click-boosted impacts cross into excitation/ionization territory.
 */

// ---------------------------------------------------------------------------
// PHYSICAL CONSTANTS (SI, CODATA)
// ---------------------------------------------------------------------------
const AMU_KG = 1.660539066e-27;    // kg, 1 atomic mass unit
const EV_TO_J = 1.602176634e-19;   // J per eV (exact, SI 2019 definition)
const ELECTRON_MASS_KG = 9.1093837015e-31; // kg

// ---------------------------------------------------------------------------
// HYDROGEN THRESHOLD ENERGIES
// ---------------------------------------------------------------------------
const E_EXCITE_J = 10.2 * EV_TO_J; // 1s -> 2p
const E_IONIZE_J = 13.6 * EV_TO_J; // ionization limit

// sim px/sec -> m/s
const VELOCITY_SCALE = 300;

export const HYDROGEN_MASS_KG = 1 * AMU_KG;

export type CollisionEvent = "elastic" | "excite" | "ionize";

export interface CollidingAtom {
  x: number;
  y: number;
  vx: number; // px/sec
  vy: number; // px/sec
  mass: number; // kg
  ionized: boolean;
}

export interface Photoelectron {
  x: number;
  y: number;
  vx: number; // px/sec
  vy: number; // px/sec
  keJ: number; // electron kinetic energy actually used to set velocity
  excessEnergyJ: number; // full (E_conv - 13.6 eV) pool it inherited from
}

export interface CollisionResult {
  event: CollisionEvent;
  photoelectron: Photoelectron | null;
}

// ---------------------------------------------------------------------------
// STEP 1 — IMPACT GEOMETRY
// ---------------------------------------------------------------------------

/** Unit vector pointing from A to B along the line connecting centers. */
function impactNormal(a: CollidingAtom, b: CollidingAtom): [number, number] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return [1, 0]; // degenerate case guard (exact same position)
  return [dx / dist, dy / dist];
}

// ---------------------------------------------------------------------------
// STEP 2 — ENERGY OF COLLISION (mass + angle both baked in here)
// ---------------------------------------------------------------------------
function reducedMass(a: CollidingAtom, b: CollidingAtom): number {
  return (a.mass * b.mass) / (a.mass + b.mass);
}

// ---------------------------------------------------------------------------
// STEP 3 — THRESHOLD CHECK
// ---------------------------------------------------------------------------
function thresholdCheck(EConvJ: number): [number, CollisionEvent] {
  if (EConvJ < E_EXCITE_J) return [0, "elastic"];
  if (EConvJ < E_IONIZE_J) return [E_EXCITE_J, "excite"];
  return [E_IONIZE_J, "ionize"];
}

// ---------------------------------------------------------------------------
// STEP 5 — PHOTOELECTRON CREATION (fires only when event === "ionize")
// ---------------------------------------------------------------------------
function createPhotoelectron(
  EConvJ: number,
  weight: number,
  originX: number,
  originY: number,
  n: [number, number],
): Photoelectron {
  const exitEnergyJ = Math.max(0, EConvJ - E_IONIZE_J); // guard against float rounding
  const electronEnergyJ = (1 - weight) * exitEnergyJ;
  const vEMps = Math.sqrt((2 * electronEnergyJ) / ELECTRON_MASS_KG);
  const vEGame = vEMps / VELOCITY_SCALE;
  return {
    x: originX,
    y: originY,
    vx: vEGame * n[0],
    vy: vEGame * n[1],
    keJ: electronEnergyJ,
    excessEnergyJ: exitEnergyJ,
  };
}

// ---------------------------------------------------------------------------
// MAIN COLLISION HANDLER — call this once per detected contact
// ---------------------------------------------------------------------------
/**
 * Full pipeline for one collision event between two atoms. Mutates both
 * atoms' velocities (and `ionized` on an ionize event) in place, and returns
 * the event type plus any spawned photoelectron.
 */
export function resolveCollision(
  a: CollidingAtom,
  b: CollidingAtom,
  ionizationWeight = 0.5,
): CollisionResult {
  const n = impactNormal(a, b);
  const vNGame = (b.vx - a.vx) * n[0] + (b.vy - a.vy) * n[1];
  if (vNGame >= 0) return { event: "elastic", photoelectron: null }; // separating already -- no-op

  const vNMps = vNGame * VELOCITY_SCALE;
  const mu = reducedMass(a, b);
  const EConvJ = 0.5 * mu * vNMps * vNMps;
  const [deltaEJ, event] = thresholdCheck(EConvJ);

  // e = sqrt(1 - delta_E / E_conv) — [ = 1 for elastic, shrinks as more
  // energy is removed by an excitation/ionization event ]
  const ratio = EConvJ > 0 ? Math.max(0, 1 - deltaEJ / EConvJ) : 0;
  const e = Math.sqrt(ratio);
  const invA = 1 / a.mass;
  const invB = 1 / b.mass;
  const jMps = (-(1 + e) * vNMps) / (invA + invB); // kg*m/s impulse
  const jGame = jMps / VELOCITY_SCALE;
  a.vx -= jGame * invA * n[0];
  a.vy -= jGame * invA * n[1];
  b.vx += jGame * invB * n[0];
  b.vy += jGame * invB * n[1];

  if (event === "ionize") {
    // Model choice: the ionization is attributed to atom A by convention.
    // Electron mass is ~1836x smaller than either atom's, so its recoil is
    // treated as negligible back-reaction on A/B.
    a.ionized = true;
    const photoelectron = createPhotoelectron(EConvJ, ionizationWeight, a.x, a.y, n);
    return { event, photoelectron };
  }
  return { event, photoelectron: null };
}
