/**
 * Whether the record has changed since this tab last looked, asked of `/api/version` on a clock.
 *
 * SCREENS DID NOT MOVE WHILE AN AGENT WROTE. `loop/research-living-in-it.md` §1.1 found one poll in the whole app, and
 * a register list that asked again only when its own question changed, so a row an agent wrote into the list he had
 * open appeared on his next navigation and not before. The record already answered the question: a second client's
 * write took a self-host's `version` from 0 to 1, and fifty calls averaged 0.87 ms each (§1.2, measured). This asks it.
 *
 * EVERY 1.5 s WHILE HE IS LOOKING, EVERY 15 s WHILE HE IS NOT. The owner's old tool asked per screen every 0.25 to 4 s
 * and felt alive; fifteen seconds for everything felt like a page that had to be reloaded. A tab that is visible and
 * has focus is somebody reading it, and asks about every 1.5 s; a tab that is visible without focus (the other
 * monitor, a window behind) asks every 15 s; a hidden tab asks nothing. The answer is one `MAX(rowid)`, and the poll
 * spends its own budget at the door (`POLL_PER_MINUTE` in `@braindog/host/limits`), so 40 a minute from a focused tab
 * costs the record little and never crowds out the reads it causes.
 *
 * A FAILED ASK WAITS LONGER EACH TIME, and a 429 waits at least as long as it was told. Doubling from the interval,
 * to a minute at most, so a host that is down is not asked forty times a minute by every tab that was looking at it.
 *
 * A POLL AND NOT A SOCKET, and §1.3 is the argument. A socket is two transports, one per host (the Worker's hibernatable
 * `Record$` socket, and a dependency or hand-written framing on Node, which ships a WebSocket client and no server), and
 * `/ws` is refused by design in `route.ts` today. The poll is one code path on both, with no new door, each ask answered
 * from a `MAX(rowid)`.
 *
 * PURE, AND THE CLOCK AND THE TAB ARE HANDED IN. Nothing here reads `document` or calls `setInterval`, so `live.test.ts`
 * runs fifteen seconds in no time and a hidden tab is a boolean. `live.svelte.ts` hands it the browser's.
 *
 * EQUALITY, NEVER ORDERING. A member's version is a hash of the newest line she may read (`Version.version` in
 * `@braindog/client`), so a change can come back as a smaller number, and a comparison with `>` would sit on it.
 */

/**
 * What the hairline draws. `polling` is kept for the socket's fallback and this module never says it: with the poll as
 * the only transport, a poll that answers is the healthy state, and `+layout.svelte`'s opening comment says why the
 * healthy state must not wear a warning colour.
 */
export type LiveState = 'open' | 'polling' | 'offline';

/** A one-shot timer, and the way to cancel it. */
export type Timers = { after(fn: () => void, ms: number): () => void };

/**
 * Whether the tab is hidden, whether it has focus, and a way to hear either change.
 *
 * `focused` ABSENT IS A TAB THAT NEVER HAS FOCUS, which asks at the slow interval: the safe reading for a host that
 * cannot say.
 */
export type Visibility = { hidden(): boolean; focused?(): boolean; watch(fn: () => void): () => void };

/**
 * A failed ask that says how long to wait: a 429 `RATE_LIMITED`'s `retry_after`, in seconds. Anything else thrown is a
 * plain failure, and the poll backs off on its own clock.
 */
export class Wait extends Error {
  readonly seconds: number;
  constructor(seconds: number) {
    super(`asked again after ${seconds} s`);
    this.seconds = seconds;
  }
}

export type Poll = {
  /** The record's version. A rejection is a failed poll, and the hairline says offline (a `Wait` does not). */
  ask: () => Promise<number>;
  /** Visible and focused: every 1.5 s. */
  fast?: number;
  /** Visible without focus: every 15 s, which was `50 §5.4` step 3's one interval. */
  every?: number;
  /** The longest a failing poll waits between asks: a minute. */
  most?: number;
  timers: Timers;
  visible: Visibility;
  /** Called with the new version when it differs from the last one heard, and not for the first. */
  onChange: (version: number) => void;
  /** Called when the state moves, and only then. It starts `open`. */
  onState?: (state: LiveState) => void;
};

/** How long to wait before the next ask: the interval, doubled once per failure in a row, to `most`, and never less than a `Wait`. */
export function delayOf(base: number, failures: number, most: number, wait: number | null): number {
  const backed = failures === 0 ? base : Math.min(most, base * 2 ** failures);
  return wait === null ? backed : Math.max(backed, wait * 1000);
}

/** Start polling. The function it returns stops it, and an answer landing after that is dropped. */
export function poller({ ask, fast = 1_500, every = 15_000, most = 60_000, timers, visible, onChange, onState }: Poll): () => void {
  let stopped = false;
  /* ONE ASK AT A TIME. The next ask is scheduled when the last one answers, never on a fixed beat, so a slow host is
     asked no faster than it answers, and two answers can never land in the wrong order. */
  let out = false;
  let last: number | undefined;
  let state: LiveState = 'open';
  let cancel: (() => void) | null = null;
  let failures = 0;
  let wait: number | null = null;

  const become = (next: LiveState) => {
    if (next === state) return;
    state = next;
    onState?.(next);
  };

  const base = () => (visible.focused?.() ? fast : every);

  function schedule() {
    cancel?.();
    cancel = null;
    if (stopped || visible.hidden()) return;
    cancel = timers.after(() => {
      cancel = null;
      void check();
    }, delayOf(base(), failures, most, wait));
  }

  async function check() {
    if (stopped || out) return;
    out = true;
    try {
      const version = await ask();
      if (stopped) return;
      failures = 0;
      wait = null;
      become('open');
      /* THE FIRST ANSWER IS THE BASELINE. The screen was drawn a moment ago, so calling it a change would have every
         list re-ask the question it has only just answered. */
      if (last !== undefined && version !== last) onChange(version);
      last = version;
    } catch (e) {
      if (stopped) return;
      failures += 1;
      /* A RATE LIMIT IS NOT OFFLINE. The host answered, and it said when to ask again. */
      if (e instanceof Wait) wait = e.seconds;
      else {
        wait = null;
        become('offline');
      }
    } finally {
      out = false;
    }
    schedule();
  }

  /* HIDDEN IS NO TIMER AT ALL, not a timer that fires and checks a flag. A tab left in the background for an hour
     spends nothing, and coming back, or taking focus, is one ask at once and then the interval from there. Losing focus
     only stretches the next wait, which `schedule` reads when the current one is set again. */
  let was = { hidden: visible.hidden(), focused: visible.focused?.() ?? false };
  function follow() {
    if (stopped) return;
    const now = { hidden: visible.hidden(), focused: visible.focused?.() ?? false };
    const woke = (was.hidden && !now.hidden) || (!was.focused && now.focused);
    was = now;
    if (now.hidden) {
      cancel?.();
      cancel = null;
      return;
    }
    if (woke) {
      cancel?.();
      cancel = null;
      void check();
      return;
    }
    if (!out) schedule();
  }

  const unwatch = visible.watch(follow);
  if (!visible.hidden()) void check();

  return () => {
    stopped = true;
    cancel?.();
    cancel = null;
    unwatch();
  };
}
