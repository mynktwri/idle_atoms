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
export const EV_TO_J = 1.602176634e-19;   // J per eV (exact, SI 2019 definition)
const ELECTRON_MASS_KG = 9.1093837015e-31; // kg

/** Newtonian gravitational constant, m^3 kg^-1 s^-2 (CODATA). */
export const GRAVITATIONAL_CONSTANT = 6.6743e-11;

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
  /**
   * Kinetic energy (J) carried along the impact axis into this collision —
   * i.e. the energy the collision actually had available to convert. Real,
   * per-collision number: it scales with closing speed, so a harder impact
   * reports more than a marginal one.
   */
  energyJ: number;
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
// K-NEAREST-NEIGHBOUR GRAVITY
// ---------------------------------------------------------------------------
/**
 * Applies Newtonian gravity to every atom from its `k` nearest neighbours only
 * (an O(n·k) approximation of the full n-body sum — the distant terms it drops
 * are the ones the inverse square law has already made negligible).
 *
 *     F = G · m₁ · m₂ / r²   ⇒   a₁ = G · m₂ / r²
 *
 * Two knobs make this visible in a hand-sized simulation:
 *
 * - `gScale` multiplies G. Between two real hydrogen atoms a few pixels apart
 *   the true force is ~1e-64 N — nothing you could ever see — so the sim runs
 *   an amplified G, exactly like VELOCITY_SCALE amplifies the eV thresholds.
 * - `softening` (px) is added in quadrature to r, keeping a → ∞ from blowing up
 *   the integrator when two atoms are nearly coincident.
 *
 * Distances are in px and masses in kg, so the resulting acceleration is in
 * px/sec² — the same units the sim integrates velocities in.
 */
export function applyNeighborGravity(
  atoms: CollidingAtom[],
  dt: number,
  k: number,
  gScale: number,
  softening: number,
): void {
  const n = atoms.length;
  if (n < 2 || k < 1) return;

  const G = GRAVITATIONAL_CONSTANT * gScale;
  const soft2 = softening * softening;
  // Reused per atom: [squared distance, index] of the current k best neighbours
  const near: { d2: number; j: number }[] = [];

  for (let i = 0; i < n; i++) {
    const ai = atoms[i];
    near.length = 0;

    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = atoms[j].x - ai.x, dy = atoms[j].y - ai.y;
      const d2 = dx * dx + dy * dy;
      // Insertion sort into a k-length list — cheaper than sorting all n
      if (near.length < k) {
        near.push({ d2, j });
        near.sort((p, q) => p.d2 - q.d2);
      } else if (d2 < near[k - 1].d2) {
        near[k - 1] = { d2, j };
        near.sort((p, q) => p.d2 - q.d2);
      }
    }

    for (const { d2, j } of near) {
      const bj = atoms[j];
      const dist = Math.sqrt(d2);
      if (dist === 0) continue; // exactly coincident — no defined direction
      const accel = (G * bj.mass) / (d2 + soft2);
      ai.vx += (accel * (bj.x - ai.x) / dist) * dt;
      ai.vy += (accel * (bj.y - ai.y) / dist) * dt;
    }
  }
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
  if (vNGame >= 0) return { event: "elastic", photoelectron: null, energyJ: 0 }; // separating already -- no-op

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
    return { event, photoelectron, energyJ: EConvJ };
  }
  return { event, photoelectron: null, energyJ: EConvJ };
}
