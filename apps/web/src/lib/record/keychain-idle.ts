/**
 * THE KEYCHAIN SCREEN'S IDLE LOCK, with no runes and no DOM, so `node --test` can drive it with a clock of its own.
 *
 * After `after` ms with no input every value on the screen is put away and the screen says "Locked" until the person
 * proves the sign-in again (`reprove`, in `keychain.ts`). It sits beside, and does not replace, the 30 s hide of one
 * shown value and the 60 s clipboard clear: those run whether or not anyone is idle.
 */

/** The lock times a person may choose, in minutes. The server's `lock_after` setting is one of these. */
export const LOCK_AFTER_MINUTES = [5, 15, 60] as const;

/** Fifteen minutes, the record's own rule (`12 §6`), until the record says another. */
export const LOCK_AFTER_DEFAULT = 15;

/**
 * The lock time in minutes from whatever the record said, or fifteen. A setting that is not one of the three is not
 * taken on trust: a screen that locked after 0 minutes would lock on every key press.
 */
export function lockAfterOf(said: unknown): number {
  const n = typeof said === 'string' && said.trim() !== '' ? Number(said) : said;
  return LOCK_AFTER_MINUTES.find((m) => m === n) ?? LOCK_AFTER_DEFAULT;
}

/** The timer calls the idle lock makes, so a test hands a clock it moves by hand. */
export type Timers = {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

const real: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export type Idle = {
  /** Any input: starts the wait again. Does nothing while locked, because only an unlock opens the screen. */
  touch(): void;
  /** The "Lock now" button. */
  lockNow(): void;
  /** After a proved sign-in: the screen is open and the wait starts again. */
  unlock(): void;
  /** Leaving the screen: no timer is left running. */
  stop(): void;
  readonly locked: boolean;
};

/**
 * @param after how long with no input, in ms
 * @param onLock called once each time the screen locks, to put every value away
 */
export function createIdle(after: number, onLock: () => void, timers: Timers = real): Idle {
  let locked = false;
  let handle: unknown = null;
  const clear = () => {
    if (handle !== null) timers.clear(handle);
    handle = null;
  };
  const lock = () => {
    clear();
    if (locked) return;
    locked = true;
    onLock();
  };
  const arm = () => {
    clear();
    handle = timers.set(lock, after);
  };
  arm();
  return {
    touch() {
      if (!locked) arm();
    },
    lockNow: lock,
    unlock() {
      locked = false;
      arm();
    },
    stop: clear,
    get locked() {
      return locked;
    },
  };
}
