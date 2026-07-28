import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useGameState } from "../hooks/useGameState";
import { computeRates } from "../lib/gameLogic";
import { resolveCollision, HYDROGEN_MASS_KG, type Photoelectron } from "../lib/atomPhysics";

// ─── window dimensions — adjust these freely ─────────────────────────────────
const WINDOW_WIDTH   = 560;   // px
const WINDOW_HEIGHT  = 380;   // px
const WINDOW_RADIUS  = 20;    // px (border-radius)

// ─── constants ────────────────────────────────────────────────────────────────
const ATOM_COUNT  = 50;
const ATOM_RADIUS = 7;    // world units ≡ CSS pixels (ortho camera)
const INIT_SPEED  = 90;   // px / sec

// Per-tier palette [core hex, glow hex]
const TIER_HEX: [number, number][] = [
  [0x7799ff, 0x4455cc],   // 1 — atomic:    blue-violet
  [0x22ddff, 0x0088bb],   // 2 — molecular: cyan
  [0xff9900, 0xffcc00],   // 3 — stellar:   orange / gold
  [0xbb44ff, 0x00eeff],   // 4 — planetary: nebula purple / cyan
  [0xff44cc, 0xffffff],   // 5 — galactic:  cosmic pink / white
];

// CSS colours for the Canvas 2D path
const TIER_CSS: [string, string][] = [
  ["#7799ff", "rgba(68,85,204,0.3)"],
  ["#22ddff", "rgba(0,136,187,0.3)"],
  ["#ff9900", "rgba(255,204,0,0.3)"],
  ["#bb44ff", "rgba(0,238,255,0.3)"],
  ["#ff44cc", "rgba(255,255,255,0.3)"],
];

// ─── physics ─────────────────────────────────────────────────────────────────
interface Atom { x: number; y: number; vx: number; vy: number; mass: number; ionized: boolean; }

function spawnAtoms(hw: number, hh: number): Atom[] {
  return Array.from({ length: ATOM_COUNT }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = INIT_SPEED * (0.4 + Math.random() * 0.8);
    return {
      x:  (Math.random() - 0.5) * (hw * 2 - ATOM_RADIUS * 4),
      y:  (Math.random() - 0.5) * (hh * 2 - ATOM_RADIUS * 4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      mass: HYDROGEN_MASS_KG,
      ionized: false,
    };
  });
}

interface CollisionEffects {
  excites: { x: number; y: number }[];
  ionizes: { x: number; y: number }[];
  photoelectrons: Photoelectron[];
}

/**
 * Zero-gravity physics step. Mutates atoms in place. Atom-atom collisions
 * run through the elastic/excitation/ionization threshold model — most
 * impacts stay elastic, but fast enough closing speeds (e.g. after a click
 * impulse) shave off a quantum of energy and, above the ionization
 * threshold, spawn a photoelectron.
 */
function stepPhysics(atoms: Atom[], hw: number, hh: number, dt: number): CollisionEffects {
  const R = ATOM_RADIUS;
  const effects: CollisionEffects = { excites: [], ionizes: [], photoelectrons: [] };

  // Integrate positions (no gravity)
  for (const p of atoms) { p.x += p.vx * dt; p.y += p.vy * dt; }

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

      const { event, photoelectron } = resolveCollision(ai, aj);
      const mx = (ai.x + aj.x) / 2, my = (ai.y + aj.y) / 2;
      if (event === "excite") effects.excites.push({ x: mx, y: my });
      if (event === "ionize") {
        effects.ionizes.push({ x: mx, y: my });
        if (photoelectron) effects.photoelectrons.push(photoelectron);
      }
    }
  }

  return effects;
}

// ─── component ───────────────────────────────────────────────────────────────
export function ReactionWindow() {
  const mountRef = useRef<HTMLDivElement>(null);

  // Keep a ref to the latest zustand state so the rAF loop never closes over stale values
  const state    = useGameState();
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

  // Canvas 2D flash + spark state (fallback path)
  const c2dFlashRef = useRef<{ x: number; y: number; life: number; maxLife: number; color: string }[]>([]);
  const c2dSparkRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[]>([]);

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

      // Spawn atom meshes
      atomsRef.current = spawnAtoms(halfWRef.current, halfHRef.current);
      const palette = TIER_HEX[0];
      atomsRef.current.forEach((a, i) => {
        const core = new THREE.Mesh(
          new THREE.CircleGeometry(ATOM_RADIUS, 24),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(palette[0]) }),
        );
        core.position.set(a.x, a.y, 0);

        const glow = new THREE.Mesh(
          new THREE.CircleGeometry(ATOM_RADIUS * 3, 24),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(palette[1]),
            transparent: true, opacity: 0.13,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        glow.position.set(a.x, a.y, 0);

        scene.add(glow); scene.add(core);
        coresRef.current[i] = core;
        glowsRef.current[i] = glow;
      });

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
          new THREE.CircleGeometry(3, 12),
          new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        mesh.position.set(x, y, 0);
        scene.add(mesh);
        glSparksRef.current.push({ mesh, vx, vy, life, maxLife: life });
      };

      const tick = (now: number) => {
        rafRef.current = requestAnimationFrame(tick);
        if (prevTRef.current === 0) { prevTRef.current = now; return; }
        const dt = Math.min((now - prevTRef.current) / 1000, 0.033);
        prevTRef.current = now;

        const effects = stepPhysics(atomsRef.current, halfWRef.current, halfHRef.current, dt);

        atomsRef.current.forEach((a, i) => {
          coresRef.current[i]?.position.set(a.x, a.y, 0);
          glowsRef.current[i]?.position.set(a.x, a.y, 0);
          if (a.ionized) {
            (coresRef.current[i]?.material as THREE.MeshBasicMaterial)?.color.setHex(0xffffff);
            (glowsRef.current[i]?.material as THREE.MeshBasicMaterial)?.color.setHex(0xffffff);
          }
        });

        for (const p of effects.excites) spawnFlash(p.x, p.y, 0xffcc33, 16, 16);
        for (const p of effects.ionizes) spawnFlash(p.x, p.y, 0xffffff, 26, 24);
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
          (s.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
          const outOfBounds = Math.abs(s.mesh.position.x) > hw * 1.3 || Math.abs(s.mesh.position.y) > hh * 1.3;
          if (s.life <= 0 || outOfBounds) {
            scene.remove(s.mesh);
            (s.mesh.material as THREE.MeshBasicMaterial).dispose();
            s.mesh.geometry.dispose();
            sp.splice(i, 1);
          }
        }

        renderer!.render(scene, camera);
      };
      rafRef.current = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(rafRef.current);
        ro.disconnect();
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

    atomsRef.current = spawnAtoms(halfWRef.current, halfHRef.current);

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
      for (const p of effects.excites) c2dFlashRef.current.push({ x: p.x, y: p.y, life: 16, maxLife: 16, color: "255,204,51" });
      for (const p of effects.ionizes) c2dFlashRef.current.push({ x: p.x, y: p.y, life: 26, maxLife: 26, color: "255,255,255" });
      for (const e of effects.photoelectrons) c2dSparkRef.current.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, life: 40, maxLife: 40 });

      ctx.clearRect(0, 0, W, H);

      const tierIdx = Math.min(tierRef.current - 1, TIER_CSS.length - 1);
      const [coreCSS, glowCSS] = TIER_CSS[tierIdx];

      // Glow pass (drawn first, behind cores)
      for (const a of atomsRef.current) {
        const sx = (a.x + hw) * dpr, sy = (hh - a.y) * dpr;
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, ATOM_RADIUS * 3 * dpr);
        gr.addColorStop(0, a.ionized ? "rgba(255,255,255,0.3)" : glowCSS);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(sx, sy, ATOM_RADIUS * 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
      }

      // Core pass
      for (const a of atomsRef.current) {
        const sx = (a.x + hw) * dpr, sy = (hh - a.y) * dpr;
        ctx.fillStyle = a.ionized ? "#ffffff" : coreCSS;
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
        const r  = 15 * dpr;
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        gr.addColorStop(0, `rgba(255,255,255,${(t * 0.95).toFixed(2)})`);
        gr.addColorStop(1, "rgba(255,255,255,0)");
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
        const outOfBounds = Math.abs(s.x) > hw * 1.3 || Math.abs(s.y) > hh * 1.3;
        if (s.life <= 0 || outOfBounds) sk.splice(i, 1);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
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

  // ── click handler ─────────────────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const mount = mountRef.current;
    if (!mount) return;
    const rect = mount.getBoundingClientRect();
    // Three.js world coords: origin at centre, y-up
    const wx = e.clientX - rect.left - rect.width  / 2;
    const wy = -(e.clientY - rect.top  - rect.height / 2);

    // Impulse nearest atom away from click point
    const atoms = atomsRef.current;
    let nearest = atoms[0], nearestD2 = Infinity;
    for (const p of atoms) {
      const d2 = (p.x - wx) ** 2 + (p.y - wy) ** 2;
      if (d2 < nearestD2) { nearestD2 = d2; nearest = p; }
    }
    const ang = Math.atan2(nearest.y - wy, nearest.x - wx);
    nearest.vx += Math.cos(ang) * 220;
    nearest.vy += Math.sin(ang) * 220;

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

    // Award joules
    const s = stateRef.current;
    s.addJoules(computeRates(s).clickPower, true);
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
