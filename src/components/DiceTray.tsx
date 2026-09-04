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
 * Silhouettes, so a d20 does not read as a d6. Faces stay numerals on every die:
 * pips only work for six sides, and this app has no idea what system you are using.
 */
const SHAPES: Record<number, string> = {
  4: 'polygon(50% 3%, 97% 94%, 3% 94%)',
  8: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  10: 'polygon(50% 0%, 96% 34%, 78% 100%, 22% 100%, 4% 34%)',
  12: 'polygon(50% 0%, 98% 36%, 79% 97%, 21% 97%, 2% 36%)',
  20: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
  100: 'polygon(50% 0%, 96% 34%, 78% 100%, 22% 100%, 4% 34%)',
};

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
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
      angle: rand(0, 360),
      spin: rand(-620, 620),
      settled: false,
      resting: 0,
      swappedAt: 0,
    }));

    const paint = (i: number, b: Body) => {
      const el = dice.current[i];
      if (el) el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) rotate(${b.angle}deg)`;
    };

    const finish = () => {
      if (done) return;
      done = true;
      for (let i = 0; i < count; i++) {
        const face = faces.current[i];
        if (face) face.textContent = String(roll.rolls[i]);
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
        b.angle += b.spin * FIXED_DT;

        if (b.x < 0) {
          b.x = 0;
          b.vx = Math.abs(b.vx) * WALL_BOUNCE;
          b.spin = -b.spin * FLOOR_GRIP;
        } else if (b.x > right) {
          b.x = right;
          b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
          b.spin = -b.spin * FLOOR_GRIP;
        }
        if (b.y < 0) {
          b.y = 0;
          b.vy = Math.abs(b.vy) * WALL_BOUNCE;
        } else if (b.y > floor) {
          b.y = floor;
          b.vy = -Math.abs(b.vy) * FLOOR_BOUNCE;
          b.vx *= FLOOR_GRIP;
          b.spin *= FLOOR_GRIP;
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
            b.spin = 0;
            b.y = Math.min(b.y, floor);
            // Come to rest upright, keeping a slight tilt so a handful of dice does
            // not look like a grid. Snapping to the nearest quarter turn instead
            // would leave half of them showing their number upside down, and a
            // hexagon lying on its side no longer reads as a d20.
            b.angle = Math.round(b.angle / 360) * 360 + rand(-7, 7);
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
          const overlap = size * 0.96 - dist;
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
          const face = faces.current[i];
          if (face) face.textContent = String(1 + Math.floor(Math.random() * roll.sides));
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
  const shape = SHAPES[roll.sides];

  return (
    <div className="dice-tray" ref={wrap} aria-hidden>
      {roll.rolls.map((_: number, i: number) => (
        <div
          key={i}
          className="die"
          ref={(el) => { dice.current[i] = el; }}
          style={{
            width: size,
            height: size,
            fontSize: size * 0.42,
            ...(shape ? { clipPath: shape, borderRadius: 0 } : null),
          }}
        >
          <span ref={(el) => { faces.current[i] = el; }} />
        </div>
      ))}
    </div>
  );
}
