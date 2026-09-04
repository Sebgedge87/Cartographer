import { useEffect, useRef } from 'react';
import type DiceBox from '@3d-dice/dice-box';
import { useUI } from '../state/uiStore';
import { rollDice } from '../state/graph';

/** How long the settled dice stay on the table before they fade. */
const LINGER_MS = 2200;
const FADE_MS = 320;
/**
 * If the simulation has not reported back by now, something in it has gone wrong and
 * the roll still owes the user a number. Generous: a big handful of dice on a slow
 * machine is legitimately unhurried.
 */
const GIVE_UP_MS = 9000;

/**
 * The roller draws into a canvas it appends to this element, and it keeps that canvas
 * for its lifetime — so the element is mounted for the session, not per roll, and the
 * box is built once. Loading a physics engine and a set of dice models for every
 * click would be absurd.
 */
const CONTAINER_ID = 'cartographer-dice';

let box: DiceBox | null = null;
let booting: Promise<DiceBox | null> | null = null;

/**
 * Resolves null if the roller cannot start — a missing asset, a lost context — and
 * the caller falls back to reporting the roll without showing it.
 */
function boot(): Promise<DiceBox | null> {
  if (box) return Promise.resolve(box);
  if (booting) return booting;
  booting = (async () => {
    try {
      // Fetched on the first roll rather than at start-up: the roller and its physics
      // engine are most of a megabyte, and plenty of sessions never roll anything.
      const { default: DiceBoxClass } = await import('@3d-dice/dice-box');
      const instance = new DiceBoxClass({
        // A selector string, not the element — the library insists on looking it up.
        container: `#${CONTAINER_ID}`,
        assetPath: '/assets/dice-box/',
        theme: 'default',
        themeColor: '#e0a44a',
        // Small enough to leave the page readable underneath: these land over the
        // editor, not in a dedicated tray.
        scale: 3.4,
        lightIntensity: 1.1,
        shadowTransparency: 0.6,
      });
      await instance.init();
      box = instance;
      return instance;
    } catch (error) {
      console.warn('[dice] 3D roller unavailable, reporting the roll instead', error);
      return null;
    } finally {
      booting = null;
    }
  })();
  return booting;
}

export function DiceTray() {
  const tray = useUI((s) => s.tray);
  const wrap = useRef<HTMLDivElement>(null);
  const throwId = tray?.id ?? 0;

  useEffect(() => {
    const container = wrap.current;
    const roll = useUI.getState().tray;
    if (!container || !roll) return;

    const timers: number[] = [];
    let done = false;
    let cancelled = false;

    container.classList.remove('dice-tray--leaving');

    /** Deliver the result once, then let the dice sit a moment and clear. */
    const settle = (rolls: number[], total: number, linger: number) => {
      if (done) return;
      done = true;
      roll.onSettle(rolls, total);
      timers.push(
        window.setTimeout(() => {
          container.classList.add('dice-tray--leaving');
          timers.push(window.setTimeout(() => useUI.getState().set({ tray: null }), FADE_MS));
        }, linger),
      );
    };

    /** No simulation to be had: roll here, so a click still produces a number. */
    const fallback = () => {
      const result = rollDice(roll.notation);
      settle(result?.rolls ?? [], result?.total ?? 0, 0);
    };

    void (async () => {
      const instance = await boot();
      if (cancelled) return;
      if (!instance) {
        fallback();
        return;
      }

      instance.onRollComplete = (results) => {
        if (cancelled) return;
        const rolls = results.flatMap((group) => group.rolls.map((die) => die.value));
        // Each group's value already has its modifier folded in.
        const total = results.reduce((sum, group) => sum + group.value, 0);
        settle(rolls, total, LINGER_MS);
      };

      timers.push(window.setTimeout(fallback, GIVE_UP_MS));
      try {
        await instance.roll(roll.notation);
      } catch (error) {
        console.warn('[dice] roll failed', error);
        if (!cancelled) fallback();
      }
    })();

    // A click anywhere clears the dice early. Capture phase, because the editor stops
    // pointer events propagating and a bubble-phase listener would never hear a click
    // made inside it. Armed next tick so the click that threw the dice does not
    // immediately dismiss them.
    const dismiss = () => useUI.getState().set({ tray: null });
    timers.push(window.setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0));

    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
      document.removeEventListener('pointerdown', dismiss, true);
      box?.clear();
      // Cut short — dismissed, or the page moved on. The click still asked for a
      // roll, so answer it rather than leaving the token shaking over nothing.
      if (!done) fallback();
    };
  }, [throwId]);

  return (
    <div
      id={CONTAINER_ID}
      className={'dice-tray' + (tray ? ' dice-tray--live' : '')}
      ref={wrap}
      aria-hidden
    />
  );
}
