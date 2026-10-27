/**
 * THE FREEZE WATCHDOG: a block of the page over two seconds, said once, with where the reader was and what the screen
 * was drawing.
 *
 * WHY IT EXISTS. On 2 October Projects froze the owner's tab, and nobody could make it freeze again: three browsers,
 * every width, forty forced re-reads and his own prefs put into `boot` all answered in under 130ms
 * A freeze that cannot be reproduced is found by the next one naming itself, so the shell
 * starts this once and the next long block says where it happened.
 *
 * HOW IT KNOWS. The browser's own record of long frames (`long-animation-frame`), which names each script that ran in
 * the frame and how long it took, and is the one record that says what was running; else its record of long tasks
 * (`longtask`), which says only how long; else, where neither is kept, a timer that notices it came back late while the
 * tab was in view. Both records are asked for `buffered`, so a block during the first load, before this module had
 * arrived, is still seen.
 *
 * ONCE. The first block over two seconds is said and the watchdog stops. A page that freezes again and again is one
 * finding, not a log, and a warning a minute is noise somebody learns to ignore.
 *
 * WHERE IT IS SAID. Through the app's crash reporter when it has one; it has none, so `console.warn`, which a browser
 * keeps while its tools are shut and which an agent driving the browser reads back.
 *
 * NAMES, NOT ADDRESSES. The route is the path inside the record (`/p/portfolio`), never the host or the record's slug,
 * and a script is its file's name, never the address it was served from.
 *
 * A PLAIN MODULE: the window, the clock and the reporter are handed in, so `watchdog.test.ts` drives every branch.
 */

/** How long a block has to last before it is a freeze. */
export const FROZE_MS = 2_000;

/** How often the timer of last resort ticks. It is also the most a freeze it measures can be overstated by. */
export const TICK_MS = 500;

/** How many of the frame's scripts the report names, the longest first. */
export const CULPRITS = 3;

/** Where the reader was and what the screen was drawing, asked at the moment the freeze is said. */
export type Where = { route: string; rendering: string };

/** One script the browser says ran in the frozen frame, and for how long. */
export type Culprit = { what: string; ms: number };

/** What is said about one freeze. `seen` is which of the three records caught it. */
export type Freeze = {
  ms: number;
  route: string;
  rendering: string;
  culprits: Culprit[];
  seen: 'frame' | 'task' | 'timer';
};

/** The parts of a performance entry this reads, from either record. */
type Entry = { entryType?: string; duration?: number; scripts?: readonly Script[] };
type Script = { invoker?: string; sourceFunctionName?: string; sourceURL?: string; sourceCharPosition?: number; duration?: number };

type Observer = { observe(options: { type: string; buffered?: boolean }): void; disconnect(): void };

/** The window, as far as this reads it. */
export type Host = {
  PerformanceObserver?: (new (callback: (list: { getEntries(): readonly unknown[] }) => void) => Observer) & { supportedEntryTypes?: readonly string[] };
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  document?: {
    visibilityState?: string;
    addEventListener?(type: 'visibilitychange', fn: () => void): void;
    removeEventListener?(type: 'visibilitychange', fn: () => void): void;
  };
};

/**
 * THE CLOCK THE TIMER IS READ AGAINST: the page's own, which only runs forward. The wall clock jumps when the machine
 * sets its time or wakes from sleep, and a jump of an hour read as an hour's freeze.
 */
const monotonic = (): number => globalThis.performance?.now() ?? Date.now();

/** How many seconds, said the way a person says them: "3.2 s". */
const seconds = (ms: number): string => `${(Math.round(ms / 100) / 10).toLocaleString('en-GB')} s`;

/** A script's file by its name alone: `/_app/immutable/chunks/Page.Bq1.js?v=2` is `Page.Bq1.js`. */
export function fileOf(url: string | undefined): string {
  if (!url) return '';
  const path = url.split(/[?#]/u)[0] ?? '';
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * The scripts a long frame names, the longest first: what ran (the function, else what called it), the file it is in
 * and the place in it, so a source map finds the line.
 */
export function culpritsOf(entry: Entry): Culprit[] {
  return [...(entry.scripts ?? [])]
    .filter((s) => typeof s.duration === 'number' && s.duration > 0)
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
    .slice(0, CULPRITS)
    .map((s) => {
      const name = s.sourceFunctionName || s.invoker || 'a script';
      const file = fileOf(s.sourceURL);
      const place = file === '' ? '' : typeof s.sourceCharPosition === 'number' && s.sourceCharPosition >= 0 ? ` in ${file}:${s.sourceCharPosition}` : ` in ${file}`;
      return { what: `${name}${place}`, ms: Math.round(s.duration ?? 0) };
    });
}

/** The sentences a freeze is said in: how long, where, what the screen held, and what ran longest. */
export function freezeSaid(f: Freeze): string {
  const where = f.route === '' ? '' : ` on ${f.route}`;
  const drawing = f.rendering === '' ? '' : ` The screen: ${f.rendering}.`;
  const ran = f.culprits.length === 0 ? '' : ` Longest: ${f.culprits.map((c) => `${c.what} (${seconds(c.ms)})`).join(', ')}.`;
  return `BrainDog froze for ${seconds(f.ms)}${where}.${drawing}${ran}`;
}

/** The reporter there is: `console.warn`, with the sentence and the whole report beside it. */
const warn = (f: Freeze): void => console.warn(freezeSaid(f), f);

/**
 * What the screen in `main` was drawing, in a few words: whether it had finished reading, and the blocks it holds by
 * kind, the most first, with how many elements the page is. Read off the page as drawn, so it says what was on screen
 * and not what the code meant to draw.
 */
export function drawingOf(doc: Pick<Document, 'querySelector' | 'querySelectorAll'> | undefined): string {
  if (!doc) return '';
  const main = doc.querySelector('#main');
  if (!main) return '';
  const state = main.getAttribute('data-screen');
  const kinds = new Map<string, number>();
  for (const b of main.querySelectorAll('.block[data-kind]')) {
    const kind = b.getAttribute('data-kind') ?? '';
    if (kind !== '') kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  const blocks = [...kinds].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = blocks.reduce((n, [, c]) => n + c, 0);
  const parts = [
    state === null || state === '' ? 'still reading' : state === 'ready' ? 'drawn' : `drawn ${state}`,
    total === 0 ? '' : `${total.toLocaleString('en-GB')} ${total === 1 ? 'block' : 'blocks'} (${blocks.map(([k, c]) => `${c} ${k}`).join(', ')})`,
    `${main.querySelectorAll('*').length.toLocaleString('en-GB')} elements`,
  ];
  return parts.filter(Boolean).join(', ');
}

/**
 * Start watching. Hands back the stop, which the shell calls when it goes.
 *
 * `where` IS ASKED WHEN THE FREEZE IS SAID, not when the watchdog starts, because the screen a freeze is about is the
 * one on show when the page came back, and the route changes under a watchdog that lives as long as the tab.
 */
export function watchFreezes(host: Host, where: () => Where, report: (f: Freeze) => void = warn, clock: () => number = monotonic): () => void {
  let said = false;
  let observer: Observer | null = null;
  let timer: unknown = null;
  let away: (() => void) | null = null;

  const stop = () => {
    observer?.disconnect();
    observer = null;
    if (timer !== null) host.clearInterval(timer);
    timer = null;
    if (away !== null) host.document?.removeEventListener?.('visibilitychange', away);
    away = null;
  };

  const say = (ms: number, seen: Freeze['seen'], culprits: Culprit[]) => {
    if (said) return;
    said = true;
    stop();
    let at: Where = { route: '', rendering: '' };
    try {
      at = where();
    } catch {
      /* A screen half torn down by the freeze still gets its freeze said, without the words it could not give. */
    }
    report({ ms: Math.round(ms), route: at.route, rendering: at.rendering, culprits, seen });
  };

  const Observed = host.PerformanceObserver;
  const types = Observed?.supportedEntryTypes ?? [];
  const type = types.includes('long-animation-frame') ? 'long-animation-frame' : types.includes('longtask') ? 'longtask' : null;

  if (Observed && type !== null) {
    try {
      observer = new Observed((list) => {
        for (const raw of list.getEntries()) {
          const e = raw as Entry;
          const ms = typeof e.duration === 'number' ? e.duration : 0;
          if (ms <= FROZE_MS) continue;
          say(ms, type === 'long-animation-frame' ? 'frame' : 'task', culpritsOf(e));
          return;
        }
      });
      observer.observe({ type, buffered: true });
      return stop;
    } catch {
      /* A browser that lists a type and then refuses it falls through to the timer. */
      observer = null;
    }
  }

  /* THE TIMER OF LAST RESORT, for a browser that keeps neither record. It comes back late by however long the page was
     blocked; a tab out of view is not timed at all, because a browser slows the timers of a tab nobody is looking at
     and that lateness is not a freeze.

     NOR ACROSS THE TIME IT WAS AWAY. A phone stops a page's timers outright while another app is in front, so no tick
     lands while it is hidden to say so, and the first one back was late by the whole time away: every switch of apps
     was said as a freeze, and the one report went on the first. Going out of view or back starts the timing again. */
  let last = clock();
  let watched = host.document?.visibilityState !== 'hidden';
  away = () => {
    watched = false;
    last = clock();
  };
  host.document?.addEventListener?.('visibilitychange', away);
  timer = host.setInterval(() => {
    const now = clock();
    const visible = host.document?.visibilityState !== 'hidden';
    const late = now - last - TICK_MS;
    if (visible && watched && late > FROZE_MS) say(late, 'timer', []);
    last = now;
    watched = visible;
  }, TICK_MS);
  return stop;
}
