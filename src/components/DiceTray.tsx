import { useEffect, useRef } from 'react';
import { useUI, type DiceThrow } from '../state/uiStore';

/* Everything here is in pixels and seconds. The numbers are tuned by feel, not
   physics: real dice at this scale settle far too fast to be worth watching. */
const GRAVITY = 4600;
const WALL_BOUNCE = 0.52;
const FLOOR_BOUNCE = 0.42;
/** Sideways speed and spin kept on each floor contact, so dice skid to a stop. */
const FLOOR_GRIP = 0.74;
const AIR_DRAG = 0.9985;
/** Slow enough, on the floor, for long enough, and a die is done. */
const REST_SPEED = 70;
/** Consecutive fixed steps (at 120Hz) a die must stay slow before it is done. */
const REST_STEPS = 8;
/** A backstop, not the usual way a throw ends — dice normally rest well before this. */
const MAX_FLIGHT_MS = 2200;
/** How long the settled roll stays on screen before it fades. */
const LINGER_MS = 1700;
const FADE_MS = 320;
const FACE_SWAP_MS = 70;
/**
 * The dice rest on a floor above the bottom edge, clear of the toast that reports the
 * roll — the two arrive together, and a die sitting on top of the total is no good.
 */
const FLOOR_INSET = 78;

/**
 * Each die is a real solid: two polygon faces held apart by a ring of edge quads,
 * assembled in CSS 3D. `n` is how many sides that polygon has and `depth` is the
 * solid's thickness as a fraction of its width — a d6 is a four-sided polygon as
 * thick as its side length, which is to say a cube. The rest are prisms: an
 * icosahedron's twenty faces would each be four pixels of unreadable numeral at
 * this size, so the silhouette carries the die's identity and the face carries
 * the number.
 *
 * `pointy` puts a vertex at the top instead of an edge — a d4 points up, a cube
 * sits flat.
 */
interface Geometry {
  n: number;
  pointy: boolean;
  depth: number;
}

const GEOMETRY: Record<number, Geometry> = {
  4: { n: 3, pointy: true, depth: 0.5 },
  6: { n: 4, pointy: false, depth: 0.707 },
  8: { n: 4, pointy: true, depth: 0.58 },
  10: { n: 5, pointy: true, depth: 0.5 },
  12: { n: 5, pointy: true, depth: 0.56 },
  20: { n: 6, pointy: true, depth: 0.5 },
  100: { n: 5, pointy: true, depth: 0.5 },
};
const DEFAULT_GEOMETRY: Geometry = { n: 4, pointy: false, depth: 0.707 };

/** Where the first vertex sits, in degrees. Everything else follows from it. */
function firstVertex(g: Geometry): number {
  return g.pointy ? -90 : -90 + 180 / g.n;
}

/** The face outline, as a clip-path. Generated so the edges below line up with it. */
function facePolygon(g: Geometry): string {
  const start = firstVertex(g);
  const points = Array.from({ length: g.n }, (_, k) => {
    const a = ((start + (k * 360) / g.n) * Math.PI) / 180;
    return `${(50 + 50 * Math.cos(a)).toFixed(2)}% ${(50 + 50 * Math.sin(a)).toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
}

/**
 * One edge quad per side, standing perpendicular to the two faces and closing the
 * gap between them. Turn to face the side's midpoint, walk out to the polygon's
 * apothem, then swing the quad a quarter turn about its own vertical so its width
 * lies along the solid's depth and its height along the edge.
 */
function edgeTransform(g: Geometry, k: number, apothem: number): string {
  // Side k spans vertices k and k+1, so its midpoint sits half a step further round.
  const bearing = firstVertex(g) + ((k + 0.5) * 360) / g.n;
  return `rotateZ(${bearing.toFixed(2)}deg) translateX(${apothem.toFixed(2)}px) rotateY(90deg)`;
}

/** Distance from the centre to the middle of a side, for a polygon of this radius. */
const apothemOf = (g: Geometry, radius: number) => radius * Math.cos(Math.PI / g.n);
/** Length of one side. */
const sideOf = (g: Geometry, radius: number) => 2 * radius * Math.sin(Math.PI / g.n);

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Orientation, in degrees, and how fast each axis is turning. */
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  settled: boolean;
  /** Consecutive fixed steps spent slow enough to be stopping. */
  resting: number;
  /** When this die last changed the number on its face, while airborne. */
  swappedAt: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function DiceTray() {
  const tray = useUI((s) => s.tray);
  // Keyed on the throw so every roll gets a fresh, un-reused simulation.
  return tray ? <Tray key={tray.id} roll={tray} /> : null;
}

function Tray({ roll }: { roll: DiceThrow }) {
  const wrap = useRef<HTMLDivElement>(null);
  const dice = useRef<(HTMLDivElement | null)[]>([]);
  const faces = useRef<(HTMLSpanElement | null)[]>([]);
  const backs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const count = roll.rolls.length;
    const size = count > 8 ? 34 : count > 4 ? 40 : 48;
    const timers: number[] = [];
    let frame = 0;
    let done = false;

    const bodies: Body[] = roll.rolls.map(() => ({
      // Thrown from the token that was clicked, upwards and out to a side.
      x: roll.from.x - size / 2 + rand(-14, 14),
      y: roll.from.y - size / 2,
      vx: rand(-560, 560),
      // Only a little upward: the dice have most of a screen to fall through, and a
      // hard throw just sends them off the top for a second before anything happens.
      vy: rand(-620, -320),
      rx: rand(0, 360),
      ry: rand(0, 360),
      rz: rand(0, 360),
      wx: rand(-760, 760),
      wy: rand(-760, 760),
      wz: rand(-560, 560),
      settled: false,
      resting: 0,
      swappedAt: 0,
    }));

    /** A die reads the same from either side, so both faces carry the same number. */
    const setFace = (i: number, value: number) => {
      const front = faces.current[i];
      const back = backs.current[i];
      if (front) front.textContent = String(value);
      if (back) back.textContent = String(value);
    };

    const paint = (i: number, b: Body) => {
      const el = dice.current[i];
      if (!el) return;
      el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
      const body = el.firstElementChild as HTMLElement | null;
      if (body) {
        body.style.transform =
          `rotateX(${b.rx.toFixed(1)}deg) rotateY(${b.ry.toFixed(1)}deg) rotateZ(${b.rz.toFixed(1)}deg)`;
      }
    };

    const finish = () => {
      if (done) return;
      done = true;
      for (let i = 0; i < count; i++) {
        setFace(i, roll.rolls[i] ?? 0);
        dice.current[i]?.classList.add('die--settled');
      }
      roll.onSettle();
      timers.push(
        window.setTimeout(() => {
          wrap.current?.classList.add('dice-tray--leaving');
          timers.push(window.setTimeout(() => useUI.getState().set({ tray: null }), FADE_MS));
        }, LINGER_MS),
      );
    };

    /**
     * Fixed-step integration. A frame that arrives late is simulated as several
     * small steps rather than one big one — clamping the delta instead would run
     * the whole throw in slow motion on any machine that cannot hold 60fps, and
     * the wall-clock cap below would then cut it off mid-air.
     */
    const FIXED_DT = 1 / 120;
    const MAX_SUBSTEPS = 24;

    const integrate = () => {
      const right = window.innerWidth - size;
      const floor = window.innerHeight - size - FLOOR_INSET;

      for (let i = 0; i < count; i++) {
        const b = bodies[i]!;
        if (b.settled) continue;

        b.vy += GRAVITY * FIXED_DT;
        b.vx *= AIR_DRAG;
        b.x += b.vx * FIXED_DT;
        b.y += b.vy * FIXED_DT;
        b.rx += b.wx * FIXED_DT;
        b.ry += b.wy * FIXED_DT;
        b.rz += b.wz * FIXED_DT;

        if (b.x < 0) {
          b.x = 0;
          b.vx = Math.abs(b.vx) * WALL_BOUNCE;
          b.wy = -b.wy * FLOOR_GRIP;
          b.wz = -b.wz * FLOOR_GRIP;
        } else if (b.x > right) {
          b.x = right;
          b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
          b.wy = -b.wy * FLOOR_GRIP;
          b.wz = -b.wz * FLOOR_GRIP;
        }
        if (b.y < 0) {
          b.y = 0;
          b.vy = Math.abs(b.vy) * WALL_BOUNCE;
        } else if (b.y > floor) {
          b.y = floor;
          b.vy = -Math.abs(b.vy) * FLOOR_BOUNCE;
          b.vx *= FLOOR_GRIP;
          b.wx *= FLOOR_GRIP;
          b.wy *= FLOOR_GRIP;
          b.wz *= FLOOR_GRIP;
        }

        // Settling is a speed test, not a position test: a die can legitimately
        // come to rest leaning on another one rather than on the floor. Gravity
        // makes this safe — anything still falling gains speed every step, so it
        // cannot stay under the threshold for several steps running.
        if (Math.abs(b.vy) < REST_SPEED && Math.abs(b.vx) < REST_SPEED) {
          b.resting++;
          if (b.resting >= REST_STEPS) {
            b.settled = true;
            b.vx = 0;
            b.vy = 0;
            b.wx = 0;
            b.wy = 0;
            b.wz = 0;
            b.y = Math.min(b.y, floor);
            // Turn face-on to the reader, keeping a slight tilt so a handful of dice
            // does not look like a grid. Rounding to whole turns rather than zeroing
            // means the die finishes the rotation it was in, instead of unwinding.
            // Not quite square on: a few degrees of tilt keeps an edge in view, so
            // the die still reads as a solid at rest rather than a printed shape.
            b.rx = Math.round(b.rx / 360) * 360 + rand(-13, 13);
            b.ry = Math.round(b.ry / 360) * 360 + rand(-13, 13);
            b.rz = Math.round(b.rz / 360) * 360 + rand(-8, 8);
            dice.current[i]?.classList.add('die--down');
          }
        } else {
          b.resting = 0;
        }
      }

      // Shove overlapping dice apart — sideways only, never up. This is a tray seen
      // from above, not a side view. Separating vertically lifts dice off the floor,
      // and a cluster then shoves itself back into the air and never comes to rest.
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const a = bodies[i]!;
          const c = bodies[j]!;
          const dx = c.x - a.x;
          const dist = Math.hypot(dx, c.y - a.y) || 0.01;
          const overlap = size * 1.16 - dist;
          if (overlap <= 0) continue;
          const slide = (dx < 0 ? -1 : 1) * overlap * 0.5;
          a.x = Math.max(0, Math.min(right, a.x - slide));
          c.x = Math.max(0, Math.min(right, c.x + slide));
        }
      }
    };

    const start = performance.now();
    let last = start;
    let backlog = 0;

    const step = (now: number) => {
      backlog += Math.min(0.25, (now - last) / 1000);
      last = now;

      let steps = 0;
      while (backlog >= FIXED_DT && steps < MAX_SUBSTEPS) {
        integrate();
        backlog -= FIXED_DT;
        steps++;
      }
      // Too far behind to catch up; drop the remainder rather than spiral.
      if (steps === MAX_SUBSTEPS) backlog = 0;

      let moving = false;
      for (let i = 0; i < count; i++) {
        const b = bodies[i]!;
        paint(i, b);
        if (b.settled) continue;
        moving = true;
        if (now - b.swappedAt > FACE_SWAP_MS) {
          b.swappedAt = now;
          setFace(i, 1 + Math.floor(Math.random() * roll.sides));
        }
      }

      if (!moving || now - start > MAX_FLIGHT_MS) {
        const floor = window.innerHeight - size - FLOOR_INSET;
        for (let i = 0; i < count; i++) {
          const b = bodies[i]!;
          b.settled = true;
          b.y = Math.min(b.y, floor);
          dice.current[i]?.classList.add('die--down');
          paint(i, b);
        }
        finish();
        return;
      }
      frame = requestAnimationFrame(step);
    };

    for (let i = 0; i < count; i++) paint(i, bodies[i]!);
    frame = requestAnimationFrame(step);

    // A click anywhere clears the tray early. Capture phase, because the editor
    // stops pointer events propagating and a bubble-phase listener would never
    // hear a click made inside it. Armed next tick so the click that threw the
    // dice does not immediately dismiss them.
    const dismiss = () => useUI.getState().set({ tray: null });
    const arm = window.setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0);
    timers.push(arm);

    return () => {
      cancelAnimationFrame(frame);
      for (const t of timers) window.clearTimeout(t);
      document.removeEventListener('pointerdown', dismiss, true);
      // Cut short — dismissed, or the page moved on. The throw still happened, so
      // report it rather than leaving the token shaking over a roll nobody sees.
      if (!done) {
        done = true;
        roll.onSettle();
      }
    };
  }, [roll]);

  const count = roll.rolls.length;
  const size = count > 8 ? 34 : count > 4 ? 40 : 48;
  const geometry = GEOMETRY[roll.sides] ?? DEFAULT_GEOMETRY;
  const radius = size / 2;
  const depth = size * geometry.depth;
  const apothem = apothemOf(geometry, radius);
  const side = sideOf(geometry, radius);
  const clipPath = facePolygon(geometry);

  return (
    <div className="dice-tray" ref={wrap} aria-hidden>
      {roll.rolls.map((_: number, i: number) => (
        <div
          key={i}
          className="die"
          ref={(el) => { dice.current[i] = el; }}
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          <div className="die__body">
            <div className="die__face" style={{ clipPath, transform: `translateZ(${depth / 2}px)` }}>
              <span ref={(el) => { faces.current[i] = el; }} />
            </div>
            {/* Turned to face outwards, so its numeral reads the right way round. */}
            <div
              className="die__face die__face--back"
              style={{ clipPath, transform: `translateZ(${-depth / 2}px) rotateY(180deg)` }}
            >
              <span ref={(el) => { backs.current[i] = el; }} />
            </div>
            {Array.from({ length: geometry.n }, (_, k) => (
              <div
                key={k}
                className="die__edge"
                style={{
                  width: depth,
                  height: side,
                  marginLeft: -depth / 2,
                  marginTop: -side / 2,
                  transform: edgeTransform(geometry, k, apothem),
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
