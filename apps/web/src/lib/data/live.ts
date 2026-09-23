/**
 * Whether the record has changed since this tab last looked, asked of `/api/version` on a clock.
 *
 * SCREENS DID NOT MOVE WHILE AN AGENT WROTE. `loop/research-living-in-it.md` §1.1 found one poll in the whole app, and
 * a register list that asked again only when its own question changed, so a row an agent wrote into the list he had
 * open appeared on his next navigation and not before. The record already answered the question: a second client's
 * write took a self-host's `version` from 0 to 1, and fifty calls averaged 0.87 ms each (§1.2, measured). This asks it.
 *
 * A POLL AND NOT A SOCKET, and §1.3 is the argument. A socket is two transports, one per host (the Worker's hibernatable
 * `Record$` socket, and a dependency or hand-written framing on Node, which ships a WebSocket client and no server), and
 * `/ws` is refused by design in `route.ts` today. The poll is one code path on both, with no new door. It costs four
 * requests a minute per open tab while the tab is visible, each answered from a `MAX(rowid)`.
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

/** A repeating timer, and the way to cancel it. */
export type Timers = { every(fn: () => void, ms: number): () => void };

/** Whether the tab is hidden, and a way to hear it change. */
export type Visibility = { hidden(): boolean; watch(fn: () => void): () => void };

export type Poll = {
  /** The record's version. A rejection is a failed poll, and the hairline says offline. */
  ask: () => Promise<number>;
  /** `50 §5.4` step 3: every 15 s. */
  every?: number;
  timers: Timers;
  visible: Visibility;
  /** Called with the new version when it differs from the last one heard, and not for the first. */
  onChange: (version: number) => void;
  /** Called when the state moves, and only then. It starts `open`. */
  onState?: (state: LiveState) => void;
};

/** Start polling. The function it returns stops it, and an answer landing after that is dropped. */
export function poller({ ask, every = 15_000, timers, visible, onChange, onState }: Poll): () => void {
  let stopped = false;
  /* ONE ASK AT A TIME. A tick that fires while an answer is still out is skipped rather than queued, so a slow host is
     asked no faster than it answers, and two answers can never land in the wrong order. */
  let out = false;
  let last: number | undefined;
  let state: LiveState = 'open';
  let cancel: (() => void) | null = null;

  const become = (next: LiveState) => {
    if (next === state) return;
    state = next;
    onState?.(next);
  };

  async function check() {
    if (stopped || out) return;
    out = true;
    try {
      const version = await ask();
      if (stopped) return;
      become('open');
      /* THE FIRST ANSWER IS THE BASELINE. The screen was drawn a moment ago, so calling it a change would have every
         list re-ask the question it has only just answered. */
      if (last !== undefined && version !== last) onChange(version);
      last = version;
    } catch {
      if (!stopped) become('offline');
    } finally {
      out = false;
    }
  }

  /* HIDDEN IS NO TIMER AT ALL, not a timer that fires and checks a flag. A tab left in the background for an hour
     spends nothing, where fifteen seconds unattended would be two hundred and forty requests to a screen nobody is
     looking at, and coming back is one ask and then the interval from there. */
  function follow() {
    if (stopped) return;
    if (visible.hidden()) {
      cancel?.();
      cancel = null;
      return;
    }
    if (cancel) return;
    void check();
    cancel = timers.every(() => void check(), every);
  }

  const unwatch = visible.watch(follow);
  follow();

  return () => {
    stopped = true;
    cancel?.();
    cancel = null;
    unwatch();
  };
}
