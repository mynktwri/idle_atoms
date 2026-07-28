import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useGameState } from "../hooks/useGameState";
import { onSpawnAtom } from "../lib/atomSpawner";
import {
  resolveCollision, applyNeighborGravity,
  HYDROGEN_MASS_KG, EV_TO_J, type Photoelectron,
} from "../lib/atomPhysics";

// ─── window dimensions — adjust these freely ─────────────────────────────────
const WINDOW_WIDTH   = 560;   // px
const WINDOW_HEIGHT  = 380;   // px
const WINDOW_RADIUS  = 20;    // px (border-radius)

// ─── constants ────────────────────────────────────────────────────────────────
const ATOM_RADIUS = 2.8;  // world units ≡ CSS pixels (ortho camera) — 60% smaller than the original 7
const INIT_SPEED  = 90;   // px / sec

// ── TUNING: how long a spawned atom survives before it despawns ─────────────
// Not surfaced in the UI — the countdown is invisible to the player. Randomised
// per atom between these bounds; set both to the same value for a fixed life.
const ATOM_LIFE_MIN_SEC = 12;
const ATOM_LIFE_MAX_SEC = 20;

// How long an ionized atom stays white before easing back to its tier colour
const IONIZE_FADE_SEC = 2;

// ── TUNING: inter-atom gravity ──────────────────────────────────────────────
// Each atom is pulled by its GRAVITY_NEIGHBORS nearest neighbours only.
// GRAVITY_SCALE amplifies the real G — unscaled, two hydrogen atoms attract
// each other at ~1e-64 N, which would never move a pixel.
const GRAVITY_NEIGHBORS = 3;
const GRAVITY_SCALE     = 1e42;  // lower = looser drift, higher = faster collapse
const GRAVITY_SOFTENING = 4;     // px — damps the 1/r² singularity at contact

// ── TUNING: joules awarded per reaction ─────────────────────────────────────
// Excitation pays a flat quantum; ionization pays that plus the collision's
// own converted energy, so harder impacts are worth more.
const EXCITE_REWARD_EV = 0.1;
const IONIZE_REWARD_EV = 0.1;

// Photoelectron spark brightness multiplier (40% brighter than the original spark)
const SPARK_BRIGHTNESS = 1.4;

// ─── debris sparks — non-colliding particles thrown off by a reaction ─────────
interface DebrisSpec {
  countMin: number; countMax: number;
  radiusMin: number; radiusMax: number;   // px
  lifeMinMs: number; lifeMaxMs: number;
  hex: number;                            // WebGL colour
  rgb: string;                            // Canvas 2D colour ("r,g,b")
}

const EXCITE_DEBRIS: DebrisSpec = {
  countMin: 5, countMax: 8,
  radiusMin: 2, radiusMax: 5,
  lifeMinMs: 400, lifeMaxMs: 800,
  hex: 0xffcc33, rgb: "255,204,51",       // gold
};

const IONIZE_DEBRIS: DebrisSpec = {
  countMin: 8, countMax: 12,
  radiusMin: 4, radiusMax: 8,
  lifeMinMs: 600, lifeMaxMs: 1000,
  hex: 0xffffff, rgb: "255,255,255",      // white
};

const DEBRIS_SPEED_MIN = 60;   // px / sec
const DEBRIS_SPEED_MAX = 190;  // px / sec

const randRange = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt   = (lo: number, hi: number) => Math.floor(randRange(lo, hi + 1));

// Per-tier palette [core hex, glow hex]
const TIER_HEX: [number, number][] = [
  [0x7799ff, 0x4455cc],   // 1 — atomic:    blue-violet
  [0x22ddff, 0x0088bb],   // 2 — molecular: cyan
  [0xff9900, 0xffcc00],   // 3 — stellar:   orange / gold
  [0xbb44ff, 0x00eeff],   // 4 — planetary: nebula purple / cyan
  [0xff44cc, 0xffffff],   // 5 — galactic:  cosmic pink / white
];

/** Hex -> "r,g,b", blended k of the way from white back to the tier colour. */
function mixFromWhite(hex: number, k: number): string {
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  const m = (c: number) => Math.round(255 + (c - 255) * k);
  return `${m(r)},${m(g)},${m(b)}`;
}

// ─── physics ─────────────────────────────────────────────────────────────────
interface Atom {
  x: number; y: number; vx: number; vy: number; mass: number; ionized: boolean;
  /** Seconds left of the white-hot ionization tint (0 = fully back to tier colour). */
  flashT: number;
  /** Seconds left before this atom despawns. Hidden from the player. */
  life: number;
}

/** One atom at (x, y) with a random heading and a randomised lifetime. */
function makeAtom(x: number, y: number): Atom {
  const angle = Math.random() * Math.PI * 2;
  const speed = INIT_SPEED * (0.4 + Math.random() * 0.8);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    mass: HYDROGEN_MASS_KG,
    ionized: false,
    flashT: 0,
    life: randRange(ATOM_LIFE_MIN_SEC, ATOM_LIFE_MAX_SEC),
  };
}

/** Random point inside the window, inset so the atom starts clear of the walls. */
function randomSpawnPoint(hw: number, hh: number): { x: number; y: number } {
  return {
    x: (Math.random() - 0.5) * (hw * 2 - ATOM_RADIUS * 4),
    y: (Math.random() - 0.5) * (hh * 2 - ATOM_RADIUS * 4),
  };
}

interface CollisionEffects {
  excites: { x: number; y: number }[];
  ionizes: { x: number; y: number }[];
  photoelectrons: Photoelectron[];
  /** Indices (ascending) of atoms whose life timer ran out this frame. */
  expired: number[];
  /** Joules earned by this frame's reactions. */
  joules: number;
}

/**
 * One physics step. Mutates atoms in place. Every atom is first pulled toward
 * its k nearest neighbours by gravity, then integrated; atom-atom contacts run
 * through the elastic/excitation/ionization threshold model — most impacts stay
 * elastic, but fast enough closing speeds (typically atoms that have fallen
 * into a gravity well) shave off a quantum of energy and, above the ionization
 * threshold, spawn a photoelectron. Reactions are what pay out joules.
 *
 * Life timers are decremented here too; atoms that hit zero are reported in
 * `effects.expired` (by index) for the renderer to tear down — this function
 * never mutates the array's length itself.
 */
function stepPhysics(atoms: Atom[], hw: number, hh: number, dt: number): CollisionEffects {
  const R = ATOM_RADIUS;
  const effects: CollisionEffects = { excites: [], ionizes: [], photoelectrons: [], expired: [], joules: 0 };

  // Mutual attraction from each atom's k nearest neighbours, applied to
  // velocity before the positions are integrated
  applyNeighborGravity(atoms, dt, GRAVITY_NEIGHBORS, GRAVITY_SCALE, GRAVITY_SOFTENING);

  // Integrate positions, decay the ionization tint, age the atom
  for (const p of atoms) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.flashT > 0) p.flashT = Math.max(0, p.flashT - dt);
    p.life -= dt;
  }

  // Elastic wall reflections
  for (const p of atoms) {
    if (p.x - R < -hw) { p.x = -hw + R; if (p.vx < 0) p.vx = -p.vx; }
    if (p.x + R >  hw) { p.x =  hw - R; if (p.vx > 0) p.vx = -p.vx; }
    if (p.y - R < -hh) { p.y = -hh + R; if (p.vy < 0) p.vy = -p.vy; }
    if (p.y + R >  hh) { p.y =  hh - R; if (p.vy > 0) p.vy = -p.vy; }
  }

  // Atom-atom collisions (O(n²) — fine for 50 atoms)
  const minD = R * 2;
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const ai = atoms[i], aj = atoms[j];
      const dx = aj.x - ai.x, dy = aj.y - ai.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD || d2 === 0) continue;
      const d  = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      // Positional correction — push each atom out by half the overlap
      const ov = (minD - d) * 0.5;
      ai.x -= nx * ov; ai.y -= ny * ov;
      aj.x += nx * ov; aj.y += ny * ov;

      const { event, photoelectron, energyJ } = resolveCollision(ai, aj);
      const mx = (ai.x + aj.x) / 2, my = (ai.y + aj.y) / 2;
      if (event === "excite") {
        effects.excites.push({ x: mx, y: my });
        effects.joules += EXCITE_REWARD_EV * EV_TO_J;
      }
      if (event === "ionize") {
        // resolveCollision attributes the ionization to the first atom
        ai.flashT = IONIZE_FADE_SEC;
        effects.ionizes.push({ x: mx, y: my });
        effects.joules += IONIZE_REWARD_EV * EV_TO_J + energyJ;
        if (photoelectron) effects.photoelectrons.push(photoelectron);
      }
    }
  }

  for (let i = 0; i < atoms.length; i++) {
    if (atoms[i].life <= 0) effects.expired.push(i);
  }

  return effects;
}

// ─── component ───────────────────────────────────────────────────────────────
export function ReactionWindow() {
  const mountRef = useRef<HTMLDivElement>(null);

  const state = useGameState();
  // Kept in a ref so the rAF loop never closes over a stale store snapshot
  const stateRef = useRef(state);
  stateRef.current = state;

  // Physics state
  const atomsRef  = useRef<Atom[]>([]);
  const halfWRef  = useRef(400);
  const halfHRef  = useRef(300);
  const rafRef    = useRef(0);
  const prevTRef  = useRef(0);
  const tierRef   = useRef(1);
  tierRef.current = state.tier;

  // Three.js objects (WebGL path)
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef     = useRef<THREE.OrthographicCamera | null>(null);
  const sceneRef      = useRef<THREE.Scene | null>(null);
  const coresRef      = useRef<THREE.Mesh[]>([]);
  const glowsRef      = useRef<THREE.Mesh[]>([]);
  const glFlashesRef  = useRef<{ mesh: THREE.Mesh; life: number; maxLife: number }[]>([]);
  const glSparksRef   = useRef<{ mesh: THREE.Mesh; vx: number; vy: number; life: number; maxLife: number }[]>([]);
  // Debris: life/maxLife in seconds (spec is given in ms, not frames)
  const glDebrisRef   = useRef<{ mesh: THREE.Mesh; vx: number; vy: number; life: number; maxLife: number }[]>([]);

  // Set by whichever render path is active; spawns one atom at world (x, y)
  const addAtomRef = useRef<((x: number, y: number) => void) | null>(null);

  // Canvas 2D flash + spark state (fallback path)
  const c2dFlashRef = useRef<{ x: number; y: number; life: number; maxLife: number; color: string }[]>([]);
  const c2dSparkRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[]>([]);
  const c2dDebrisRef = useRef<{
    x: number; y: number; vx: number; vy: number;
    r: number; life: number; maxLife: number; color: string;
  }[]>([]);

  // ── single effect: try WebGL, fall back to Canvas 2D ────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── attempt Three.js WebGL renderer ──────────────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      renderer = null;
    }

    // ── WebGL path ────────────────────────────────────────────────────────
    if (renderer) {
      renderer.setClearColor(0x000000, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mount.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;
      cameraRef.current = camera;

      const applySize = (w: number, h: number) => {
        halfWRef.current = w / 2; halfHRef.current = h / 2;
        renderer!.setSize(w, h);
        camera.left = -w / 2; camera.right = w / 2;
        camera.top  =  h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
      };

      const ro = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) applySize(width, height);
      });
      ro.observe(mount);
      applySize(mount.clientWidth || 800, mount.clientHeight || 600);

      // The window starts empty — atoms only exist once the player adds them
      atomsRef.current = [];
      coresRef.current = [];
      glowsRef.current = [];

      /** Add one atom (plus its core/glow meshes) at the given world position. */
      const addAtom = (x: number, y: number) => {
        const palette = TIER_HEX[Math.min(tierRef.current - 1, TIER_HEX.length - 1)];
        const atom = makeAtom(x, y);

        const core = new THREE.Mesh(
          new THREE.CircleGeometry(ATOM_RADIUS, 24),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(palette[0]) }),
        );
        core.position.set(atom.x, atom.y, 0);

        const glow = new THREE.Mesh(
          new THREE.CircleGeometry(ATOM_RADIUS * 3, 24),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(palette[1]),
            transparent: true, opacity: 0.13,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        glow.position.set(atom.x, atom.y, 0);

        scene.add(glow); scene.add(core);
        atomsRef.current.push(atom);
        coresRef.current.push(core);
        glowsRef.current.push(glow);
      };

      /** Tear down atom `i` and its meshes. Indices must be removed descending. */
      const removeAtom = (i: number) => {
        for (const arr of [coresRef.current, glowsRef.current]) {
          const mesh = arr[i];
          if (mesh) {
            scene.remove(mesh);
            (mesh.material as THREE.MeshBasicMaterial).dispose();
            mesh.geometry.dispose();
          }
          arr.splice(i, 1);
        }
        atomsRef.current.splice(i, 1);
      };

      // Collision-point flash — colorHex tints excitation (gold) vs. ionization (white)
      const spawnFlash = (x: number, y: number, colorHex: number, life: number, radius: number) => {
        const mesh = new THREE.Mesh(
          new THREE.CircleGeometry(radius, 32),
          new THREE.MeshBasicMaterial({
            color: colorHex, transparent: true, opacity: 0.65,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        mesh.position.set(x, y, 0);
        scene.add(mesh);
        glFlashesRef.current.push({ mesh, life, maxLife: life });
      };

      // Photoelectron spark — a fast, short-lived streak that escapes the impact site
      const spawnSpark = (x: number, y: number, vx: number, vy: number, life: number) => {
        const mesh = new THREE.Mesh(
          new THREE.CircleGeometry(3 * SPARK_BRIGHTNESS, 12),
          new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: Math.min(1, 0.9 * SPARK_BRIGHTNESS),
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        mesh.position.set(x, y, 0);
        scene.add(mesh);
        glSparksRef.current.push({ mesh, vx, vy, life, maxLife: life });
      };

      // Reaction debris — a burst of small, non-colliding particles that fly
      // out in random directions and fade to nothing before despawning
      const spawnDebris = (x: number, y: number, spec: DebrisSpec) => {
        const n = randInt(spec.countMin, spec.countMax);
        for (let k = 0; k < n; k++) {
          const ang   = Math.random() * Math.PI * 2;
          const speed = randRange(DEBRIS_SPEED_MIN, DEBRIS_SPEED_MAX);
          const life  = randRange(spec.lifeMinMs, spec.lifeMaxMs) / 1000;
          const mesh  = new THREE.Mesh(
            new THREE.CircleGeometry(randRange(spec.radiusMin, spec.radiusMax), 12),
            new THREE.MeshBasicMaterial({
              color: spec.hex, transparent: true, opacity: 1,
              blending: THREE.AdditiveBlending, depthWrite: false,
            }),
          );
          mesh.position.set(x, y, 0);
          scene.add(mesh);
          glDebrisRef.current.push({
            mesh, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
            life, maxLife: life,
          });
        }
      };

      addAtomRef.current = addAtom;

      const tick = (now: number) => {
        rafRef.current = requestAnimationFrame(tick);
        if (prevTRef.current === 0) { prevTRef.current = now; return; }
        const dt = Math.min((now - prevTRef.current) / 1000, 0.033);
        prevTRef.current = now;

        const effects = stepPhysics(atomsRef.current, halfWRef.current, halfHRef.current, dt);

        const palette   = TIER_HEX[Math.min(tierRef.current - 1, TIER_HEX.length - 1)];
        const coreColor = new THREE.Color(palette[0]);
        const glowColor = new THREE.Color(palette[1]);

        atomsRef.current.forEach((a, i) => {
          coresRef.current[i]?.position.set(a.x, a.y, 0);
          glowsRef.current[i]?.position.set(a.x, a.y, 0);
          if (a.flashT > 0) {
            // White at the moment of ionization, easing back to the tier colour
            const k = 1 - a.flashT / IONIZE_FADE_SEC;
            (coresRef.current[i]?.material as THREE.MeshBasicMaterial)?.color.setHex(0xffffff).lerp(coreColor, k);
            (glowsRef.current[i]?.material as THREE.MeshBasicMaterial)?.color.setHex(0xffffff).lerp(glowColor, k);
          } else {
            (coresRef.current[i]?.material as THREE.MeshBasicMaterial)?.color.copy(coreColor);
            (glowsRef.current[i]?.material as THREE.MeshBasicMaterial)?.color.copy(glowColor);
          }
        });

        // Reaction payout — excitation/ionization are the only joule sources
        if (effects.joules > 0) stateRef.current.addJoules(effects.joules);

        // Life timers that ran out: same burst as an ionization, then despawn
        for (let k = effects.expired.length - 1; k >= 0; k--) {
          const idx  = effects.expired[k];
          const atom = atomsRef.current[idx];
          if (!atom) continue;
          spawnDebris(atom.x, atom.y, IONIZE_DEBRIS);
          removeAtom(idx);
        }

        for (const p of effects.excites) { spawnFlash(p.x, p.y, 0xffcc33, 16, 16); spawnDebris(p.x, p.y, EXCITE_DEBRIS); }
        for (const p of effects.ionizes) { spawnFlash(p.x, p.y, 0xffffff, 26, 24); spawnDebris(p.x, p.y, IONIZE_DEBRIS); }
        for (const e of effects.photoelectrons) spawnSpark(e.x, e.y, e.vx, e.vy, 40);

        const fl = glFlashesRef.current;
        for (let i = fl.length - 1; i >= 0; i--) {
          const f = fl[i]; f.life--;
          const t = f.life / f.maxLife;
          (f.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.65;
          f.mesh.scale.setScalar(1 + (1 - t) * 5);
          if (f.life <= 0) {
            scene.remove(f.mesh);
            (f.mesh.material as THREE.MeshBasicMaterial).dispose();
            f.mesh.geometry.dispose();
            fl.splice(i, 1);
          }
        }

        const sp = glSparksRef.current;
        const hw = halfWRef.current, hh = halfHRef.current;
        for (let i = sp.length - 1; i >= 0; i--) {
          const s = sp[i];
          s.mesh.position.x += s.vx * dt;
          s.mesh.position.y += s.vy * dt;
          s.life--;
          const t = s.life / s.maxLife;
          (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 0.9 * SPARK_BRIGHTNESS);
          const outOfBounds = Math.abs(s.mesh.position.x) > hw * 1.3 || Math.abs(s.mesh.position.y) > hh * 1.3;
          if (s.life <= 0 || outOfBounds) {
            scene.remove(s.mesh);
            (s.mesh.material as THREE.MeshBasicMaterial).dispose();
            s.mesh.geometry.dispose();
            sp.splice(i, 1);
          }
        }

        // Debris drift + fade — no collision handling, they just expire
        const db = glDebrisRef.current;
        for (let i = db.length - 1; i >= 0; i--) {
          const d = db[i];
          d.mesh.position.x += d.vx * dt;
          d.mesh.position.y += d.vy * dt;
          d.life -= dt;
          (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life / d.maxLife);
          if (d.life <= 0) {
            scene.remove(d.mesh);
            (d.mesh.material as THREE.MeshBasicMaterial).dispose();
            d.mesh.geometry.dispose();
            db.splice(i, 1);
          }
        }

        renderer!.render(scene, camera);
      };
      rafRef.current = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(rafRef.current);
        ro.disconnect();
        addAtomRef.current = null;
        renderer!.dispose();
        if (mount.contains(renderer!.domElement)) mount.removeChild(renderer!.domElement);
      };
    }

    // ── Canvas 2D fallback path ────────────────────────────────────────────
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    mount.appendChild(canvas);

    const applySize = (w: number, h: number) => {
      halfWRef.current = w / 2; halfHRef.current = h / 2;
      const dpr = window.devicePixelRatio;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
    };

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) applySize(width, height);
    });
    ro.observe(mount);
    applySize(mount.clientWidth || 800, mount.clientHeight || 600);

    // The window starts empty — atoms only exist once the player adds them
    atomsRef.current = [];
    addAtomRef.current = (x, y) => { atomsRef.current.push(makeAtom(x, y)); };

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (prevTRef.current === 0) { prevTRef.current = now; return; }
      const dt = Math.min((now - prevTRef.current) / 1000, 0.033);
      prevTRef.current = now;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const hw  = halfWRef.current, hh = halfHRef.current;
      const dpr = window.devicePixelRatio;
      const W   = canvas.width, H = canvas.height;

      const effects = stepPhysics(atomsRef.current, hw, hh, dt);

      const spawnDebris2D = (x: number, y: number, spec: DebrisSpec) => {
        const n = randInt(spec.countMin, spec.countMax);
        for (let k = 0; k < n; k++) {
          const ang   = Math.random() * Math.PI * 2;
          const speed = randRange(DEBRIS_SPEED_MIN, DEBRIS_SPEED_MAX);
          const life  = randRange(spec.lifeMinMs, spec.lifeMaxMs) / 1000;
          c2dDebrisRef.current.push({
            x, y,
            vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
            r: randRange(spec.radiusMin, spec.radiusMax),
            life, maxLife: life, color: spec.rgb,
          });
        }
      };

      // Reaction payout — excitation/ionization are the only joule sources
      if (effects.joules > 0) stateRef.current.addJoules(effects.joules);

      // Life timers that ran out: same burst as an ionization, then despawn
      for (let k = effects.expired.length - 1; k >= 0; k--) {
        const idx  = effects.expired[k];
        const atom = atomsRef.current[idx];
        if (!atom) continue;
        spawnDebris2D(atom.x, atom.y, IONIZE_DEBRIS);
        atomsRef.current.splice(idx, 1);
      }

      for (const p of effects.excites) {
        c2dFlashRef.current.push({ x: p.x, y: p.y, life: 16, maxLife: 16, color: "255,204,51" });
        spawnDebris2D(p.x, p.y, EXCITE_DEBRIS);
      }
      for (const p of effects.ionizes) {
        c2dFlashRef.current.push({ x: p.x, y: p.y, life: 26, maxLife: 26, color: "255,255,255" });
        spawnDebris2D(p.x, p.y, IONIZE_DEBRIS);
      }
      for (const e of effects.photoelectrons) c2dSparkRef.current.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, life: 40, maxLife: 40 });

      ctx.clearRect(0, 0, W, H);

      const tierIdx = Math.min(tierRef.current - 1, TIER_HEX.length - 1);
      const [coreHex, glowHex] = TIER_HEX[tierIdx];

      // Glow pass (drawn first, behind cores)
      for (const a of atomsRef.current) {
        const sx = (a.x + hw) * dpr, sy = (hh - a.y) * dpr;
        const k  = a.flashT > 0 ? 1 - a.flashT / IONIZE_FADE_SEC : 1;
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, ATOM_RADIUS * 3 * dpr);
        gr.addColorStop(0, `rgba(${mixFromWhite(glowHex, k)},0.3)`);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(sx, sy, ATOM_RADIUS * 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
      }

      // Core pass
      for (const a of atomsRef.current) {
        const sx = (a.x + hw) * dpr, sy = (hh - a.y) * dpr;
        const k  = a.flashT > 0 ? 1 - a.flashT / IONIZE_FADE_SEC : 1;
        ctx.fillStyle = `rgb(${mixFromWhite(coreHex, k)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, ATOM_RADIUS * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flash decay
      const fl = c2dFlashRef.current;
      for (let i = fl.length - 1; i >= 0; i--) {
        const f = fl[i]; f.life--;
        const t  = f.life / f.maxLife;
        const sx = (f.x + hw) * dpr, sy = (hh - f.y) * dpr;
        const r  = 20 * (1 + (1 - t) * 5) * dpr;
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        gr.addColorStop(0, `rgba(${f.color},${(t * 0.65).toFixed(2)})`);
        gr.addColorStop(1, `rgba(${f.color},0)`);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
        if (f.life <= 0) fl.splice(i, 1);
      }

      // Photoelectron sparks — fast streaks that fly off and vanish
      const sk = c2dSparkRef.current;
      for (let i = sk.length - 1; i >= 0; i--) {
        const s = sk[i];
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.life--;
        const t  = s.life / s.maxLife;
        const sx = (s.x + hw) * dpr, sy = (hh - s.y) * dpr;
        const r  = 15 * SPARK_BRIGHTNESS * dpr;
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        gr.addColorStop(0, `rgba(255,255,255,${Math.min(1, t * 0.95 * SPARK_BRIGHTNESS).toFixed(2)})`);
        gr.addColorStop(1, "rgba(255,255,255,0)");
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
        const outOfBounds = Math.abs(s.x) > hw * 1.3 || Math.abs(s.y) > hh * 1.3;
        if (s.life <= 0 || outOfBounds) sk.splice(i, 1);
      }

      // Reaction debris — non-colliding particles that drift out and fade away
      const db = c2dDebrisRef.current;
      for (let i = db.length - 1; i >= 0; i--) {
        const d = db[i];
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.life -= dt;
        const t  = Math.max(0, d.life / d.maxLife);
        const sx = (d.x + hw) * dpr, sy = (hh - d.y) * dpr;
        ctx.beginPath();
        ctx.arc(sx, sy, d.r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.color},${t.toFixed(2)})`;
        ctx.fill();
        if (d.life <= 0) db.splice(i, 1);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      addAtomRef.current = null;
      if (mount.contains(canvas)) mount.removeChild(canvas);
    };
  }, []); // intentionally run once — all live values accessed via refs

  // ── sync Three.js atom colours when tier changes ─────────────────────────
  useEffect(() => {
    if (!rendererRef.current) return;
    const palette = TIER_HEX[Math.min(state.tier - 1, TIER_HEX.length - 1)];
    coresRef.current.forEach(m => (m.material as THREE.MeshBasicMaterial).color.setHex(palette[0]));
    glowsRef.current.forEach(m => (m.material as THREE.MeshBasicMaterial).color.setHex(palette[1]));
  }, [state.tier]);

  // ── external spawn requests (the ADD ATOM button) ────────────────────────
  useEffect(() => onSpawnAtom(pos => {
    const p = pos ?? randomSpawnPoint(halfWRef.current, halfHRef.current);
    addAtomRef.current?.(p.x, p.y);
  }), []);

  // ── click handler — spawns an atom, awards nothing ───────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const mount = mountRef.current;
    if (!mount) return;
    const rect = mount.getBoundingClientRect();
    // Three.js world coords: origin at centre, y-up
    const wx = e.clientX - rect.left - rect.width  / 2;
    const wy = -(e.clientY - rect.top  - rect.height / 2);

    addAtomRef.current?.(wx, wy);

    // Flash — Three.js path
    const scene = sceneRef.current;
    if (scene) {
      const fMesh = new THREE.Mesh(
        new THREE.CircleGeometry(20, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0.65,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      fMesh.position.set(wx, wy, 0);
      scene.add(fMesh);
      glFlashesRef.current.push({ mesh: fMesh, life: 20, maxLife: 20 });
    }

    // Flash — Canvas 2D path
    c2dFlashRef.current.push({ x: wx, y: wy, life: 20, maxLife: 20, color: "255,255,255" });
  }, []);

  return (
    <div
      ref={mountRef}
      onClick={handleClick}
      data-testid="reaction-canvas"
      style={{
        width:        WINDOW_WIDTH,
        height:       WINDOW_HEIGHT,
        borderRadius: WINDOW_RADIUS,
        flexShrink:   0,
      }}
      className="relative overflow-hidden bg-black cursor-crosshair border border-white/10"
    >
      <div className="absolute bottom-3 left-3 pointer-events-none select-none opacity-35 font-mono text-[10px] text-muted-foreground tracking-widest">
        SYS.TIER // {state.tier}
      </div>
    </div>
  );
}
