/**
 * HOW MANY DRAWN WIDGETS RUN AT ONCE (widgets plan §8, Call 14): at most `DRAWN_ALIVE_MOST` on the page, the rest
 * drawing the picture each last handed back. A frame asks for a place when it is on screen and the browser is idle, and
 * gives it back when it leaves; the first one waiting is woken then. Pure but for the module's own sets.
 */

import { DRAWN_ALIVE_MOST } from 'braindog-render';

const alive = new Set<symbol>();
const waiting = new Map<symbol, () => void>();

/** Whether this frame may run now. When it may not, `wake` is called once a place is given back. */
export function askAlive(id: symbol, wake: () => void, most: number = DRAWN_ALIVE_MOST): boolean {
  if (alive.has(id)) return true;
  if (alive.size < most) {
    alive.add(id);
    waiting.delete(id);
    return true;
  }
  waiting.set(id, wake);
  return false;
}

/** This frame stops running, or stops waiting, and the first one waiting is woken. */
export function letGo(id: symbol): void {
  const had = alive.delete(id);
  waiting.delete(id);
  if (!had) return;
  const next = waiting.entries().next();
  if (next.done) return;
  const [other, wake] = next.value;
  waiting.delete(other);
  wake();
}

/** How many run now, for a test. */
export const aliveCount = (): number => alive.size;
