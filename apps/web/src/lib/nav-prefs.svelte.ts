/**
 * The person's own navigation: the rail's order, the pages hidden from it, its shape, whether the holding pen proposes
 * anything, and what they have dismissed from it.
 *
 * `19 §3`: nav order, hidden pages, the shape, dismissals and the *Suggest new pages* switch must survive a change of
 * device. On a record they are the person's own, kept by `setPref` and answered on `boot`'s `me.prefs`; this holds them
 * for the tab and sends every change. With no record (the sample) there is nobody to keep them for, so they stay on this
 * device.
 *
 * THE DEVICE KEEPS A COPY EITHER WAY, AND THE COPY IS NEVER THE TRUTH. The order, the shape and the switch ride in the
 * `bd_pref` cookie the shell already reads before first paint, and the hidden list and the dismissals in `localStorage`,
 * so a reload draws the rail as it was left before `boot` answers. Once `boot` answers, the record's word stands over the
 * copy and the copy is rewritten from it.
 *
 * ADOPTED ONCE PER TAB. `boot` is read once and kept for the tab, so adopting it on every navigation would put back the
 * rail as it stood when the tab opened, over whatever was hidden or moved since.
 *
 * THE CLIENT IS IMPORTED WHEN A CHANGE IS SENT, not with the shell: the rail is in the entry chunk, and the route table
 * is not needed to draw it.
 */

import * as pref from './pref.ts';

const HIDDEN = 'bd_nav_hidden';
/* THE DEVICE'S COPY OF WHAT WAS DISMISSED, for a tab with no record to keep it in. */
const DISMISSED = 'bd_pen_dismissed';
/**
 * WHERE THE NAVIGATION SHAPE'S DISMISSAL LIVED BEFORE THE RECORD COULD HOLD ONE: `{ [record]: '<shape>:<reason>' }`. It
 * is read once when a record first answers, written into `pen.dismissed` as `shape:<shape>:<reason>`, and cleared.
 */
const LEGACY_DISMISSED = 'bd_design_dismissed';
/** The most dismissals kept, the record's own `PEN_DISMISSED_MOST`: past it the oldest is let go first. */
const DISMISSED_MOST = 500;

export type NavShape = 'rail' | 'bar' | 'menu';

export type Prefs = {
  'nav.order'?: string[];
  'nav.hidden'?: string[];
  'nav.shape'?: NavShape;
  'pen.suggest'?: boolean;
  'pen.dismissed'?: string[];
};

/** What a change came to: kept by the record, kept on this device, or refused with the record's sentence. */
export type Saved = { from: 'kept' } | { from: 'device' } | { from: 'refused'; fix: string };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const isShape = (v: unknown): v is NavShape => v === 'rail' || v === 'bar' || v === 'menu';

function readList(key: string): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    return strings(JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch {
    return [];
  }
}

function keepList(key: string, list: readonly string[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* A copy this device cannot keep costs a flash of the hidden page, or a dismissed offer, on the next load and
       nothing else: the record's answer replaces it as soon as `boot` arrives. */
  }
}

/**
 * The dismissals the old `localStorage` store held, as `pen.dismissed` ids, and the store cleared.
 *
 * EVERY RECORD'S AND NOT ONLY THIS ONE'S, because the store was keyed by a slug this module is not told. A signature
 * carries the reason's own words, counts and all, so another record's dismissal matches nothing here and costs one entry
 * of five hundred.
 */
function takeLegacy(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LEGACY_DISMISSED);
    if (raw === null) return [];
    localStorage.removeItem(LEGACY_DISMISSED);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    return Object.values(parsed as Record<string, unknown>).flatMap((sig) => (typeof sig === 'string' && sig ? [`shape:${sig}`] : []));
  } catch {
    return [];
  }
}

/** The newest `DISMISSED_MOST`, each once, in the order they were dismissed. */
const capped = (list: readonly string[]): string[] => [...new Set(list)].slice(-DISMISSED_MOST);

type Value = string[] | string | boolean;
type Send = (key: keyof Prefs, value: Value) => Promise<Saved>;

/** The record's `setPref`, through the client. A refusal is the record's own sentence. */
const sendTo =
  (base: string): Send =>
  async (key, value) => {
    const { createClient } = await import('@braindog/client');
    /* EACH KEY'S SHAPE IS CHECKED BY THE RECORD, which refuses a wrong one in that key's words; the methods below only
       ever send the shape their own key holds. */
    const out = await createClient({ base })
      .setPref(key, value as never)
      .catch(() => null);
    if (out?.ok) return { from: 'kept' };
    const fix = out && 'refusal' in out ? out.refusal.fix : 'The record could not be reached, so this was not kept.';
    return { from: 'refused', fix };
  };

export type Start = {
  order?: string[];
  hidden?: string[];
  shape?: NavShape | undefined;
  suggest?: boolean | undefined;
  dismissed?: string[];
};

const fromDevice = (): Start => {
  const held = pref.read();
  return { order: held.nav ?? [], hidden: readList(HIDDEN), shape: held.shape, suggest: held.suggestPages, dismissed: readList(DISMISSED) };
};

export class NavPrefs {
  order = $state<string[]>([]);
  hidden = $state<string[]>([]);
  /** Where the navigation lives. The top bar unless somebody said otherwise. */
  shape = $state<NavShape>('bar');
  /**
   * Whether the holding pen proposes anything, `29 §4`'s one global switch. On unless somebody said otherwise, which is
   * the record's own reading of `pen.suggest` absent.
   */
  suggest = $state(true);
  /** Every offer this person dismissed from the pen, by its id: terminal on every device (`19 §3`). */
  dismissed = $state<string[]>([]);
  #send: Send | null = null;
  #adopted = false;
  /* ONE CHANGE AT A TIME, so two quick moves arrive in the order they were made. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(start: Start = fromDevice()) {
    this.order = start.order ?? [];
    this.hidden = start.hidden ?? [];
    this.shape = start.shape ?? 'bar';
    this.suggest = start.suggest ?? true;
    this.dismissed = start.dismissed ?? [];
  }

  /**
   * What `boot` said this person arranged. `undefined` is no person on a record (the sample, or a refusal), and the
   * device's copy stands. `send` is for a test; the app sends to its own origin.
   *
   * A SHAPE OR A SWITCH THE RECORD HAS NEVER HEARD OF IS THIS DEVICE'S, AND STAYS HERE. Reading `boot` writes nothing:
   * it used to send the cookie's copy to the record whenever the record held none, so opening the app with a top bar
   * in one browser's cookie set the top bar for the person everywhere, and a second browser's menu then lost to it. The
   * record learns a shape or a switch when somebody chooses one (`setShape`, `setSuggest`).
   */
  adopt(prefs: Prefs | undefined, base: string, send: Send = sendTo(base)): void {
    if (prefs === undefined) return;
    this.#send = send;
    if (this.#adopted) return;
    this.#adopted = true;
    if (prefs['nav.order']) {
      this.order = strings(prefs['nav.order']);
      pref.write({ nav: this.order });
    }
    this.hidden = strings(prefs['nav.hidden']);
    keepList(HIDDEN, this.hidden);

    const held = pref.read();
    const shape = prefs['nav.shape'];
    this.shape = isShape(shape) ? shape : (held.shape ?? 'bar');
    const suggest = prefs['pen.suggest'];
    this.suggest = typeof suggest === 'boolean' ? suggest : (held.suggestPages ?? true);
    pref.write({ shape: this.shape, suggestPages: this.suggest });

    const kept = strings(prefs['pen.dismissed']);
    const legacy = takeLegacy().filter((id) => !kept.includes(id));
    this.dismissed = capped([...kept, ...legacy]);
    keepList(DISMISSED, this.dismissed);
    if (legacy.length > 0) void this.#commit('pen.dismissed', this.dismissed, () => {});
  }

  /** Whether a change is kept by a record rather than by this device. */
  get kept(): boolean {
    return this.#send !== null;
  }

  isHidden = (href: string): boolean => this.hidden.includes(href);

  /** Whether an offer in the pen was dismissed, here or on any other device this person uses. */
  isDismissed = (id: string): boolean => this.dismissed.includes(id);

  setOrder(next: string[]): Promise<Saved> {
    const before = this.order;
    this.order = next;
    pref.write({ nav: next });
    return this.#commit('nav.order', next, () => {
      this.order = before;
      pref.write({ nav: before });
    });
  }

  hide(href: string): Promise<Saved> {
    return this.#setHidden(this.hidden.includes(href) ? this.hidden : [...this.hidden, href]);
  }

  show(href: string): Promise<Saved> {
    return this.#setHidden(this.hidden.filter((h) => h !== href));
  }

  /**
   * The shape, set. THE SHELL REDRAWS FROM THIS FIELD, not from the cookie: the control that sets it is inside the thing
   * it changes, and the shell mounts once for the life of the tab.
   */
  setShape(next: NavShape): Promise<Saved> {
    const before = this.shape;
    this.shape = next;
    pref.write({ shape: next });
    return this.#commit('nav.shape', next, () => {
      this.shape = before;
      pref.write({ shape: before });
    });
  }

  /** The *Suggest new pages* switch, set. Off empties the pen and stops it refilling; nothing already placed moves. */
  setSuggest(on: boolean): Promise<Saved> {
    const before = this.suggest;
    this.suggest = on;
    pref.write({ suggestPages: on });
    return this.#commit('pen.suggest', on, () => {
      this.suggest = before;
      pref.write({ suggestPages: before });
    });
  }

  /**
   * One offer dismissed, for good. The whole list is sent, as `setPref` keeps a key whole, and the oldest is let go past
   * five hundred just as the record lets it go.
   */
  dismiss(id: string): Promise<Saved> {
    if (this.dismissed.includes(id)) return Promise.resolve(this.kept ? { from: 'kept' } : { from: 'device' });
    const before = this.dismissed;
    const next = capped([...before, id]);
    this.dismissed = next;
    keepList(DISMISSED, next);
    return this.#commit('pen.dismissed', next, () => {
      this.dismissed = before;
      keepList(DISMISSED, before);
    });
  }

  #setHidden(next: string[]): Promise<Saved> {
    const before = this.hidden;
    this.hidden = next;
    keepList(HIDDEN, next);
    return this.#commit('nav.hidden', next, () => {
      this.hidden = before;
      keepList(HIDDEN, before);
    });
  }

  /* A REFUSED CHANGE IS PUT BACK, so the screen never shows an arrangement the record did not keep. */
  #commit(key: keyof Prefs, value: Value, undo: () => void): Promise<Saved> {
    const send = this.#send;
    if (!send) return Promise.resolve({ from: 'device' });
    const out = this.#queue.then(() => send(key, value));
    this.#queue = out.catch(() => undefined);
    return out.then((saved) => {
      if (saved.from === 'refused') undo();
      return saved;
    });
  }
}

/** The tab's one copy, read by the rail, the top bar, the phone's More sheet, the shell's shape and Settings. */
export const navPrefs = new NavPrefs();
