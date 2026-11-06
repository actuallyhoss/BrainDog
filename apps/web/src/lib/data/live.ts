/**
 * Whether the record has changed since this tab last looked, asked of `/api/version` on a clock.
 *
 * SCREENS DID NOT MOVE WHILE AN AGENT WROTE. There was one poll in the whole app, and
 * a register list that asked again only when its own question changed, so a row an agent wrote into the list he had
 * open appeared on his next navigation and not before. The record already answered the question: a second client's
 * write took a self-host's `version` from 0 to 1, and fifty calls averaged 0.87 ms each (measured). This asks it.
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
  /** The longest a focused tab waits while nothing changes: each unchanged answer stretches `fast` by half, to this. */
  idle?: number;
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

/**
 * AT MOST ONE IN `every` MS: the first of a quiet spell goes at once, and what comes during the wait is held, the newest only,
 * and goes when it ends. `stop` lets go of what is held.
 */
export function paced<T>(apply: (value: T) => void, every: number, timers: Timers): { hear: (value: T) => void; stop: () => void } {
  let waiting: (() => void) | null = null;
  let held: { value: T } | null = null;
  const wait = (): void => {
    waiting = timers.after(() => {
      waiting = null;
      if (held === null) return;
      const { value } = held;
      held = null;
      apply(value);
      wait();
    }, every);
  };
  return {
    hear(value) {
      if (waiting !== null) {
        held = { value };
        return;
      }
      apply(value);
      wait();
    },
    stop() {
      waiting?.();
      waiting = null;
      held = null;
    },
  };
}

/** Start polling. The function it returns stops it, and an answer landing after that is dropped. */
export function poller({ ask, fast = 1_500, every = 15_000, most = 60_000, idle = 6_000, timers, visible, onChange, onState }: Poll): () => void {
  let stopped = false;
  /* ONE ASK AT A TIME. The next ask is scheduled when the last one answers, never on a fixed beat, so a slow host is
     asked no faster than it answers, and two answers can never land in the wrong order. */
  let out = false;
  let last: number | undefined;
  let state: LiveState = 'open';
  let cancel: (() => void) | null = null;
  let failures = 0;
  let wait: number | null = null;
  /* UNCHANGED ANSWERS IN A ROW. A focused tab asked 40 times a minute while nothing moved (23 Oct, 203 asks in 8 minutes
     beside the overload); now it stretches to `idle` and is quick again on a change, a wake or a touch. */
  let quiet = 0;

  const become = (next: LiveState) => {
    if (next === state) return;
    state = next;
    onState?.(next);
  };

  const base = () => (visible.focused?.() ? Math.min(Math.max(fast, idle), fast * 1.5 ** quiet) : every);

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
      if (last !== undefined && version !== last) {
        quiet = 0;
        onChange(version);
      } else if (last !== undefined) quiet += 1;
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
      quiet = 0;
      cancel?.();
      cancel = null;
      void check();
      return;
    }
    /* A TOUCH ON A FOCUSED TAB THAT HAD GONE QUIET asks soon again; once quick, further touches move nothing. */
    if (now.focused && quiet > 0 && !out) {
      quiet = 0;
      schedule();
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

/* ── a newer build: the tab is running an older one than the one live ─────────────────────────────────────────── */

/**
 * Whether the build `version` answered (`app`, the deploy's tuple) is not the one this tab runs (`own`), as a key to
 * try once, or `null`. NOTHING IS COMPARED WITHOUT BOTH: a build made without a tuple (a dev server, the gates) or a
 * host that names none moves nothing. AND EACH PAIR IS TRIED ONCE (`tried`, kept by the tab across reloads), so a
 * shell that cannot become the build live, whatever the reason, reloads once and never again.
 */
export function newerBuild(own: string, heard: unknown, tried: string | null): string | null {
  if (own === '' || typeof heard !== 'string' || heard === '' || heard === own) return null;
  const key = `${own}>${heard}`;
  return key === tried ? null : key;
}

/* ── access: a share changed, or ended ───────────────────────────────────────────────────────────────────────── */

/**
 * Whether the version poll heard the access epoch move: `known` is the epoch the shell booted with,
 * `heard` the one `version` answered, each absent for somebody no share let in. A move means the tab boots again onto
 * what the person holds now, since what they could read a moment ago may not be theirs to read.
 */
export function regranted(known: number | null | undefined, heard: number | null | undefined): boolean {
  return (known ?? null) !== (heard ?? null);
}

/** Where a door's refusal says a person's access ended: `FORBIDDEN` at `access`, with `x-braindog-access: ended`. */
export const ENDED_AT = 'access';

/** Whether a refusal says the person's access to the record ended, so the tab wipes its copy and says so. */
export function endedBy(refusal: { code?: string; at?: string | undefined } | null | undefined): boolean {
  return refusal?.code === 'FORBIDDEN' && refusal.at === ENDED_AT;
}
