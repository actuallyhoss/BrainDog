/**
 * The person's own navigation: the rail's order, the pages hidden from it, the names they gave its pages, the page the
 * app opens on, its shape, whether the holding pen proposes anything, and what they have dismissed from it.
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
import { putBackVersion, shelve, shelvedOf, unshelve, shelfId, type Declared, type Shelved, type ShelveMore } from './page/shelf.ts';

const HIDDEN = 'bd_nav_hidden';
/* THE DEVICE'S COPY OF THE PHONE BAR, so a reload draws it before `boot` answers. */
const TABS = 'bd_nav_tabs';
/* THE DEVICE'S COPY OF THE PROJECTS PINNED TO THE SIDEBAR, under the key the sidebar kept its own pins in before they
   were the person's (`PINS_KEY` in `shell/side.ts`), so pins made on this device carry over to the record. */
const PINS = 'bd_side_pins';
/** The most projects one person pins, the record's own cap. */
export const PINS_MOST = 100;
/** Pages on the phone bar besides Today, the record's own cap. */
export const TABS_MOST = 4;
/* THE DEVICE'S COPIES OF THE HOME PAGE AND THE NAMES, for a tab with no record, kept beside the hidden list for its
   reason: `pref.ts`'s cookie is read before first paint, and neither of these is needed before `boot` answers. */
const HOME = 'bd_nav_home';
const LABELS = 'bd_nav_labels';
/** The longest name a person may give a page in their nav: a rail item, not a sentence. */
export const LABEL_MOST = 40;
/* THE DEVICE'S COPY OF WHAT WAS DISMISSED, for a tab with no record to keep it in. */
const DISMISSED = 'bd_pen_dismissed';
/**
 * WHERE THE NAVIGATION SHAPE'S DISMISSAL LIVED BEFORE THE RECORD COULD HOLD ONE: `{ [record]: '<shape>:<reason>' }`. It
 * is read once when a record first answers, written into `pen.dismissed` as `shape:<shape>:<reason>`, and cleared.
 */
const LEGACY_DISMISSED = 'bd_design_dismissed';
/** The most dismissals kept, the record's own `PEN_DISMISSED_MOST`: past it the oldest is let go first. */
const DISMISSED_MOST = 500;

/**
 * THE TWO SHAPES A PERSON CHOOSES BETWEEN: the top bar with its sidebar, or the one menu button. The side rail of before
 * 23 October is no longer a choice (`d8`: five settings, navigation one of them); a rail kept by an older build, on the
 * record (`side`) or in the cookie (`rail`), is read as no choice, and the top bar is drawn.
 */
export type NavShape = 'bar' | 'menu';

export type Prefs = {
  'nav.order'?: string[];
  'nav.hidden'?: string[];
  'nav.tabs'?: string[];
  /** THE PROJECTS KEPT IN THE SIDEBAR, by address, in the order pinned. Absent is none. */
  'nav.pins'?: string[];
  /** `rail` and `side` are an older build's words, read as no choice (`shapeKept`). */
  'nav.shape'?: NavShape | 'rail' | 'side';
  'pen.suggest'?: boolean;
  'pen.dismissed'?: string[];
  /**
   * THE PAGE THE APP OPENS ON, by its address (`/p/money`, `/?work`). Absent is Today, which is `/`. The record keeps it
   * as one of its `PREF_KEYS`; a host older than the key refuses it and the screen says so.
   */
  'home.page'?: string;
  /** THE NAMES THIS PERSON GAVE PAGES IN THEIR NAV, address to name. The page's own title is untouched. */
  'nav.labels'?: Record<string, string>;
  /** THE RULES WHOSE NOTICES THIS PERSON MUTED, as `rule:<id>`. Urgent notices always arrive. */
  'notify.muted'?: string[];
  /** THE KINDS OF PUSH THIS PERSON TURNED OFF on every phone (`needs`, `agents`, `money`, `summary`; `lib/phone/kinds.ts`). */
  'push.off'?: string[];
  /**
   * HOW THE APP LOOKS TO THIS PERSON, on every device they sign in on: the record's `look.*` keys. Absent scheme is the
   * device's own; size and density are the cookie's words (`pref.ts`); accent is a suggested accent by name, or `House`.
   */
  'look.scheme'?: 'light' | 'dark' | 'system';
  'look.size'?: 'sm' | 'base' | 'md';
  'look.density'?: 'compact' | 'comfortable' | 'roomy';
  'look.contrast'?: boolean;
  'look.shot'?: boolean;
  'look.accent'?: string;
  /** THE COMPONENTS THIS PERSON KEPT ON THEIR SHELF, each a name and a block's declaration, never rows (`page/shelf.ts`). */
  'shelf.kept'?: Shelved[];
};

/** What a change came to: kept by the record, kept on this device, or refused with the record's sentence. */
export type Saved = { from: 'kept' } | { from: 'device' } | { from: 'refused'; fix: string };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Where the navigation lives when nobody said: the top bar of 19 October (chosen 20 October), from 900px up. */
const SHAPE_DEFAULT: NavShape = 'bar';

/**
 * THE RECORD'S `side` AND `rail` ARE BOTH NO CHOICE NOW. `side` was a side rail somebody chose, and `rail` was nobody's
 * choice (builds before the top bar led copied the device's shape to the record on first load). The rail is gone as a
 * shape, so both read as no choice at all, which draws the default (the top bar).
 */
const shapeKept = (v: unknown): NavShape | undefined => (v === 'bar' || v === 'menu' ? v : undefined);

/**
 * THE DEVICE'S COPY OF THE SHAPE, AS A CHOICE OR AS NOTHING, for a record that keeps no shape of its own.
 *
 * ITS `bar` IS THE DEFAULT'S COPY, NOT A CHOICE. Builds that led with the top bar wrote the shape they drew into the
 * cookie, `bar` included when nobody had chosen one, so a `bar` here reads as nobody's choice, which is the top bar again.
 * A shape somebody chose on a record is kept by the record (`setShape`), and its word stands over this.
 */
const deviceChose = (held: unknown): NavShape | undefined => (held === 'menu' ? held : undefined);

/** A name map kept whole: only text keys that are addresses, and text names within the length a nav item takes. */
const names = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [href, name] of Object.entries(v as Record<string, unknown>))
    if (href.startsWith('/') && typeof name === 'string' && name.trim() !== '') out[href] = name.trim().slice(0, LABEL_MOST);
  return out;
};

/* TODAY'S OWN `/` IS NO CHOICE, read as none: it is what a record keeps when somebody puts Today back (`setHome`). */
const address = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('/') && v !== '/' ? v : null);

function readKept(key: string): unknown {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function keepKept(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* For `keepList`'s reason: the record's answer replaces it as soon as `boot` arrives. */
  }
}

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

type Value = string[] | string | boolean | Record<string, string> | Shelved[] | null;
type Send = (key: keyof Prefs, value: Value) => Promise<Saved>;

/** The record's `setPref`, through the client. A refusal is the record's own sentence. */
const sendTo =
  (base: string): Send =>
  async (key, value) => {
    const { createClient } = await import('@braindog/client');
    /* EACH KEY'S SHAPE IS CHECKED BY THE RECORD, which refuses a wrong one in that key's words; the methods below only
       ever send the shape their own key holds. */
    /* THE KEY IS CAST TO THE RECORD'S OWN, because this file names `home.page` and `nav.labels` before the record's
       `PREF_KEYS` does; a key it does not take yet comes back as its refusal, which the screen says. */
    const out = await createClient({ base })
      .setPref(key as Parameters<ReturnType<typeof createClient>['setPref']>[0], value as never)
      .catch(() => null);
    if (out?.ok) return { from: 'kept' };
    const fix = out && 'refusal' in out ? out.refusal.fix : 'BrainDog could not be reached, so this was not kept.';
    return { from: 'refused', fix };
  };

export type Start = {
  order?: string[];
  hidden?: string[];
  tabs?: string[];
  pins?: string[];
  shape?: NavShape | undefined;
  suggest?: boolean | undefined;
  dismissed?: string[];
  home?: string | null;
  labels?: Record<string, string>;
};

const fromDevice = (): Start => {
  const held = pref.read();
  return {
    order: held.nav ?? [],
    hidden: readList(HIDDEN),
    tabs: readList(TABS),
    pins: readList(PINS).filter((h) => h.startsWith('/')),
    shape: held.shape === 'bar' || held.shape === 'menu' ? held.shape : undefined,
    suggest: held.suggestPages,
    dismissed: readList(DISMISSED),
    home: address(readKept(HOME)),
    labels: names(readKept(LABELS)),
  };
};

/** One heading of the nav and its pages in the order drawn, as `arrange` answers it. */
export type Arranged = readonly (readonly [string, readonly { href: string }[]])[];

/**
 * The whole order after one page moves a place up (`-1`) or down (`1`) inside its own heading, or `null` at the edge.
 *
 * WITHIN A HEADING, NEVER ACROSS ONE, for `arrange`'s reason: a heading is what a page declared, and a page moved out of
 * it would sit under a title that is not its own. `skip` passes over pages the person cannot see in the nav (the hidden
 * ones), so a press always moves the page past one they can.
 *
 * THE ANSWER NAMES EVERY PAGE, in the order drawn, so the arrangement kept is the one the person was looking at.
 */
export function moved(groups: Arranged, href: string, step: -1 | 1, skip: (href: string) => boolean = () => false): string[] | null {
  let next: string[] | null = null;
  const flat = groups.flatMap(([, list]) => {
    const hrefs = list.map((e) => e.href);
    const at = hrefs.indexOf(href);
    if (at < 0) return hrefs;
    let to = at + step;
    while (to >= 0 && to < hrefs.length && skip(hrefs[to]!)) to += step;
    if (to < 0 || to >= hrefs.length) return hrefs;
    [hrefs[at], hrefs[to]] = [hrefs[to]!, hrefs[at]!];
    next = hrefs;
    return hrefs;
  });
  return next === null ? null : flat;
}

export class NavPrefs {
  order = $state<string[]>([]);
  hidden = $state<string[]>([]);
  /** The pages the person put on the phone bar after Today; empty is the rail's first four. */
  tabs = $state<string[]>([]);
  /** The projects pinned to the sidebar, by address: the only projects the sidebar lists (3 Nov). */
  pins = $state<string[]>([]);
  /**
   * The shape somebody chose, on a record or on this device, or `undefined` while nobody has, so a rail somebody picked
   * reads apart from the default.
   */
  chosen = $state<NavShape | undefined>(undefined);
  /**
   * Whether the holding pen proposes anything, `29 §4`'s one global switch. On unless somebody said otherwise, which is
   * the record's own reading of `pen.suggest` absent.
   */
  suggest = $state(true);
  /** Every offer this person dismissed from the pen, by its id: terminal on every device (`19 §3`). */
  dismissed = $state<string[]>([]);
  /** The page the app opens on, by its address; `null` is Today. */
  home = $state<string | null>(null);
  /** The names this person gave pages in their nav, address to name. */
  labels = $state<Record<string, string>>({});
  /** The drawn components this person kept; placed onto any page from the add menu. */
  shelf = $state<Shelved[]>([]);
  #send: Send | null = null;
  #adopted = false;
  /* ONE CHANGE AT A TIME, so two quick moves arrive in the order they were made. */
  #queue: Promise<unknown> = Promise.resolve();

  /** Where the navigation lives: the shape somebody chose, else the top bar. */
  get shape(): NavShape {
    return this.chosen ?? SHAPE_DEFAULT;
  }

  constructor(start: Start = fromDevice()) {
    this.order = start.order ?? [];
    this.hidden = start.hidden ?? [];
    this.tabs = start.tabs ?? [];
    this.pins = start.pins ?? [];
    this.chosen = start.shape;
    this.suggest = start.suggest ?? true;
    this.dismissed = start.dismissed ?? [];
    this.home = start.home ?? null;
    this.labels = start.labels ?? {};
  }

  /**
   * What `boot` said this person arranged. `undefined` is no person on a record (the sample, or a refusal), and the
   * device's copy stands. `send` is for a test; the app sends to its own origin.
   *
   * A SHAPE OR A SWITCH THE RECORD HAS NEVER HEARD OF IS THIS DEVICE'S, AND STAYS HERE. Reading `boot` writes nothing:
   * it used to send the cookie's copy to the record whenever the record held none, so opening the app with a top bar
   * in one browser's cookie set the top bar for the person everywhere, and a second browser's menu then lost to it. The
   * record learns a shape or a switch when somebody chooses one (`setShape`, `setSuggest`). The cookie's `bar` is the
   * one exception, for `deviceChose`'s reason.
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
    this.tabs = strings(prefs['nav.tabs']);
    keepList(TABS, this.tabs);
    /* THE PINS ARE THE RECORD'S ONCE IT HOLDS ANY. Before then, the pins this device kept (the sidebar's own, from when
       a pin only put a project on top) are the person's first pins, and are sent up once. */
    if ('nav.pins' in prefs) {
      this.pins = strings(prefs['nav.pins']);
      keepList(PINS, this.pins);
    } else if (this.pins.length > 0) void this.#commit('nav.pins', this.pins, () => {});

    const held = pref.read();
    /* A LEGACY `rail` OR `side` GOES STRAIGHT TO THE DEFAULT, past the cookie: the cookie's copy was written from it. */
    const said = prefs['nav.shape'];
    this.chosen = shapeKept(said) ?? (said === 'rail' || said === 'side' ? undefined : deviceChose(held.shape));
    const suggest = prefs['pen.suggest'];
    this.suggest = typeof suggest === 'boolean' ? suggest : (held.suggestPages ?? true);
    /* THE COOKIE IS WRITTEN FROM A CHOICE ONLY, and the default leaves it empty, so the next change of default is not
       met by a cookie full of the old one's copies, which is what the top bar's `bar` is (`deviceChose`). */
    pref.write({ shape: this.chosen, suggestPages: this.suggest });

    const kept = strings(prefs['pen.dismissed']);
    const legacy = takeLegacy().filter((id) => !kept.includes(id));
    this.dismissed = capped([...kept, ...legacy]);
    keepList(DISMISSED, this.dismissed);
    if (legacy.length > 0) void this.#commit('pen.dismissed', this.dismissed, () => {});

    /* THE HOME PAGE AND THE NAMES ARE THE RECORD'S WORD ONCE IT HAS ONE, and the device's copy until then: a record that
       does not keep them yet answers neither, and a choice made on this device should not vanish for it. */
    if ('home.page' in prefs) {
      this.home = address(prefs['home.page']);
      keepKept(HOME, this.home);
    }
    if ('shelf.kept' in prefs) this.shelf = shelvedOf(prefs['shelf.kept']);
    if ('nav.labels' in prefs) {
      this.labels = names(prefs['nav.labels']);
      keepKept(LABELS, this.labels);
    }
  }

  /** Whether a change is kept by a record rather than by this device. */
  get kept(): boolean {
    return this.#send !== null;
  }

  isHidden = (href: string): boolean => this.hidden.includes(href);

  /** The name a page is drawn under in this person's nav: theirs if they gave it one, else its own title. */
  labelOf = (href: string, title: string): string => this.labels[href] ?? title;

  /** The nav's pages under the names this person gave them, everything else as it came. */
  relabel = <T extends { href: string; title: string }>(entries: readonly T[]): T[] =>
    entries.map((e) => (Object.hasOwn(this.labels, e.href) ? { ...e, title: this.labels[e.href]! } : e));

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

  /**
   * One page moved a place inside its heading, through `setOrder`, or `null` at the edge. The addresses the drawn nav does
   * not name (the lists, `/r/<id>`, which `orderLists` ranks among themselves) keep their places after it.
   */
  move(groups: Arranged, href: string, step: -1 | 1): Promise<Saved> | null {
    const next = moved(groups, href, step, this.isHidden);
    if (next === null) return null;
    const named = new Set(next);
    return this.setOrder([...next, ...this.order.filter((h) => !named.has(h))]);
  }

  /**
   * The page the app opens on. `null`, or Today's own `/`, is Today, and takes the choice away.
   *
   * TODAY IS SENT AS `/`, NOT AS `null`. `null` takes the key off the record, and `boot` then answers nothing for it, so
   * another device would keep the page it last heard of; `/` is an answer every device reads as Today (`address`).
   */
  setHome(href: string | null): Promise<Saved> {
    const next = address(href);
    const before = this.home;
    this.home = next;
    keepKept(HOME, next);
    return this.#commit('home.page', next ?? '/', () => {
      this.home = before;
      keepKept(HOME, before);
    });
  }

  /**
   * A page's name in this person's nav. `null`, an empty name or the page's own title takes the name away, so a page
   * renamed back to what it is called carries nothing to keep. The page's own title is not touched: it is the record's.
   */
  setLabel(href: string, name: string | null, own?: string): Promise<Saved> {
    const said = (name ?? '').trim().slice(0, LABEL_MOST);
    const before = this.labels;
    const next = { ...before };
    if (said === '' || said === own) delete next[href];
    else next[href] = said;
    this.labels = next;
    keepKept(LABELS, next);
    return this.#commit('nav.labels', next, () => {
      this.labels = before;
      keepKept(LABELS, before);
    });
  }

  hide(href: string): Promise<Saved> {
    return this.#setHidden(this.hidden.includes(href) ? this.hidden : [...this.hidden, href]);
  }

  show(href: string): Promise<Saved> {
    return this.#setHidden(this.hidden.filter((h) => h !== href));
  }

  /**
   * The shape, set, or `undefined` for nobody's choice again, which is what an undo hands back to a record that never
   * chose. THE SHELL REDRAWS FROM THIS FIELD, not from the cookie: the control that sets it is inside the thing it
   * changes, and the shell mounts once for the life of the tab.
   */
  setShape(next: NavShape | undefined): Promise<Saved> {
    const before = this.chosen;
    this.chosen = next;
    pref.write({ shape: next });
    /* NO CHOICE GOES AS `rail`, the record's word for nobody's (`shapeKept`), which every device reads as the default past
       its own copy. Not `null`, for `setHome`'s reason: a key taken off the record answers nothing, and another device
       would keep the shape it last heard of. */
    return this.#commit('nav.shape', next ?? 'rail', () => {
      this.chosen = before;
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

  /** The phone bar's pages after Today, set: at most `TABS_MOST`, and empty to go back to the rail's first. */
  setTabs(next: string[]): Promise<Saved> {
    const before = this.tabs;
    const kept = [...new Set(next)].slice(0, TABS_MOST);
    this.tabs = kept;
    keepList(TABS, kept);
    return this.#commit('nav.tabs', kept, () => {
      this.tabs = before;
      keepList(TABS, before);
    });
  }

  /** Whether a project, by its address, is pinned to the sidebar. */
  isPinned = (href: string): boolean => this.pins.includes(href);

  /** A project pinned to the sidebar, at the end, or taken off it. */
  setPinned(href: string, on: boolean): Promise<Saved> {
    const before = this.pins;
    const next = on ? [...new Set([...before, href])].slice(-PINS_MOST) : before.filter((h) => h !== href);
    this.pins = next;
    keepList(PINS, next);
    /* A HOST OLDER THAN THE KEY refuses it by name ("key is one of …"): the pin is then kept on this device, as the
       sidebar's pins were before, rather than taken back with a sentence listing every setting. */
    return this.#commit('nav.pins', next, () => {}).then((saved): Saved => {
      if (saved.from !== 'refused') return saved;
      if (/^key is one of/u.test(saved.fix)) return { from: 'device' };
      this.pins = before;
      keepList(PINS, before);
      return saved;
    });
  }

  /** A drawn component put on the shelf under a name, or refused when the shelf is full. */
  shelve(name: string, block: Declared, more: ShelveMore = {}): Promise<Saved> {
    const next = shelve(this.shelf, name, block, shelfId(Date.now()), { at: new Date().toISOString().slice(0, 10), ...more });
    if (next === null) return Promise.resolve({ from: 'refused', fix: 'The shelf is full, or the name is empty.' });
    return this.#setShelf(next);
  }

  /** An earlier version of a kept component put back, itself a new version (`putBackVersion`). */
  putBack(id: string, version: number): Promise<Saved> {
    const next = putBackVersion(this.shelf, id, version, new Date().toISOString().slice(0, 10));
    if (next === null) return Promise.resolve({ from: 'refused', fix: 'That version is not kept any more.' });
    return this.#setShelf(next);
  }

  /** One component taken off the shelf. */
  unshelve(id: string): Promise<Saved> {
    return this.#setShelf(unshelve(this.shelf, id));
  }

  #setShelf(next: Shelved[]): Promise<Saved> {
    const before = this.shelf;
    this.shelf = next;
    return this.#commit('shelf.kept', next, () => {
      this.shelf = before;
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

/** The tab's one copy, read by the rail, the top bar, the sidebar, the shell's shape and Settings. */
export const navPrefs = new NavPrefs();
