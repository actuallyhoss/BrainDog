/**
 * The rail's order and the pages hidden from it, for the person reading it.
 *
 * `19 §3`: nav order and hidden pages must survive a change of device. On a record they are the person's own, kept by
 * `setPref` and answered on `boot`'s `me.prefs`; this holds them for the tab and sends every change. With no record
 * (the sample) there is nobody to keep them for, so they stay on this device.
 *
 * THE DEVICE KEEPS A COPY EITHER WAY. The order rides in the `nav` cookie the shell already reads before first paint,
 * and the hidden list in `localStorage`, so a reload draws the rail as it was left before `boot` answers.
 *
 * ADOPTED ONCE PER TAB. `boot` is read once and kept for the tab, so adopting it on every navigation would put back the
 * rail as it stood when the tab opened, over whatever was hidden or moved since.
 *
 * THE CLIENT IS IMPORTED WHEN A CHANGE IS SENT, not with the shell: the rail is in the entry chunk, and the route table
 * is not needed to draw it.
 */

import * as pref from './pref.ts';

const HIDDEN = 'bd_nav_hidden';

export type Prefs = { 'nav.order'?: string[]; 'nav.hidden'?: string[] };

/** What a change came to: kept by the record, kept on this device, or refused with the record's sentence. */
export type Saved = { from: 'kept' } | { from: 'device' } | { from: 'refused'; fix: string };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function readHidden(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    return strings(JSON.parse(localStorage.getItem(HIDDEN) ?? '[]'));
  } catch {
    return [];
  }
}

function keepHidden(list: readonly string[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(HIDDEN, JSON.stringify(list));
  } catch {
    /* A copy this device cannot keep costs a flash of the hidden page on the next load, and nothing else. */
  }
}

type Send = (key: keyof Prefs, value: string[]) => Promise<Saved>;

/** The record's `setPref`, through the client. A refusal is the record's own sentence. */
const sendTo =
  (base: string): Send =>
  async (key, value) => {
    const { createClient } = await import('@braindog/client');
    const out = await createClient({ base }).setPref(key, value).catch(() => null);
    if (out?.ok) return { from: 'kept' };
    const fix = out && 'refusal' in out ? out.refusal.fix : 'The record could not be reached, so this was not kept.';
    return { from: 'refused', fix };
  };

export class NavPrefs {
  order = $state<string[]>([]);
  hidden = $state<string[]>([]);
  #send: Send | null = null;
  #adopted = false;
  /* ONE CHANGE AT A TIME, so two quick moves arrive in the order they were made. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(start: { order?: string[]; hidden?: string[] } = { order: pref.read().nav ?? [], hidden: readHidden() }) {
    this.order = start.order ?? [];
    this.hidden = start.hidden ?? [];
  }

  /**
   * What `boot` said this person arranged. `undefined` is no person on a record (the sample, or a refusal), and the
   * device's copy stands. `send` is for a test; the app sends to its own origin.
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
    keepHidden(this.hidden);
  }

  /** Whether a change is kept by a record rather than by this device. */
  get kept(): boolean {
    return this.#send !== null;
  }

  isHidden = (href: string): boolean => this.hidden.includes(href);

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

  #setHidden(next: string[]): Promise<Saved> {
    const before = this.hidden;
    this.hidden = next;
    keepHidden(next);
    return this.#commit('nav.hidden', next, () => {
      this.hidden = before;
      keepHidden(before);
    });
  }

  /* A REFUSED CHANGE IS PUT BACK, so the rail never shows an arrangement the record did not keep. */
  #commit(key: keyof Prefs, value: string[], undo: () => void): Promise<Saved> {
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

/** The tab's one copy, read by the rail, the top bar, the phone's More sheet and Settings. */
export const navPrefs = new NavPrefs();
