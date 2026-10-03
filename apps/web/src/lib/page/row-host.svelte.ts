/**
 * THE PAGE'S HOLD ON ONE ROW AT A TIME: the row open in the docked panel, the row whose menu is open, and every row
 * touched from this page in the last ten minutes (Just changed), with the writes that change them. `PageView` makes one
 * for a page at its own address; the panel, the menu and the strip read it, and the body's keys and the renderer's
 * `onopen` and `onmenu` call it.
 *
 * WORK'S VERBS, OVER ANY LIST A BLOCK DRAWS. Each write is Work's: drawn at once in Just changed, sent in turn behind the
 * row's previous write, said with an Undo for six seconds (`lib/data/optimistic.ts`), and the page read again so the
 * blocks draw the row as it now is. What a list can be changed in is its declaration's to say (`row-verbs.ts`).
 *
 * JUST CHANGED OUTLIVES A VISIT, as Work's does: it is kept per page in module scope, so leaving for Money and coming
 * back still shows what was just done here. Nothing is kept past the tab.
 *
 * A ROW A PAGE ANSWERED CUT SHORT IS READ WHOLE BEFORE IT IS CHANGED (`whole`), and kept beside the rows a write
 * answered, so every later read of the same version is drawn from it. No way back here puts back a cut (`clipped.ts`).
 */

import { createClient } from '@braindog/client';
import type { Row } from 'braindog-render';

import { REGISTERS } from '../record/held.ts';
import type { RecordRow } from '../record/remote.ts';
import { rowReader, type Fetch } from '../record/row-live.ts';
import { inverseOf, rowWriter, type Wrote } from '../record/rows-write.ts';
import type { Entry, Fields } from '../record/schema.ts';
import { optimist, type Change, type Sent } from '../data/optimistic.ts';
import type { toasts } from '../ui/toast.svelte.ts';
import { dayOf, shapeOf, type Shape } from '../work/board.ts';
import { cutIn, wholeOf } from './clipped.ts';
import { dueWords, entryIn, finished, keyOf, titleOf, words, type RowAt, type Touch } from './row-verbs.ts';

/** Just changed, per page, for the life of the tab. */
const kept = new Map<string, Map<string, Touch>>();

export type MenuMode = 'row' | 'due' | 'move' | 'project';

export type HostDeps = {
  slug: () => string;
  base: () => string;
  /** Every block the page draws now, which a row is found in. */
  blocks: () => readonly { register?: string | undefined; entries: readonly Entry[] }[];
  /** The record's clock the page was read against, which "today" is said from. */
  now: () => number;
  reread: () => Promise<void>;
  toasts: Pick<typeof toasts, 'push'>;
  /** Whether the reader may change rows of a list, as `boot` said (`may`). */
  may: (register: string) => boolean;
  /** The record's fetch, which a test hands in over its own kernel. Absent, the browser's. */
  io?: Fetch;
};

export class RowHost {
  /** The row the panel is on, and whether the panel is open. */
  opened = $state<RowAt | null>(null);
  panelOpen = $state(false);
  /** Whether the panel opened to type: the caret goes in the words. */
  typing = $state(false);
  /** Whether the panel holds words typed and not saved, which the cursor moving must not throw away. */
  dirty = $state(false);
  /** The row whose menu is open, which of the menu's steps it shows, and where the row was when it opened. */
  menu = $state<{ row: RowAt; mode: MenuMode; at: { x: number; y: number; height: number } } | null>(null);
  menuOpen = $state(false);
  /** Rows touched from this page, by key. */
  touched = $state.raw(new Map<string, Touch>());
  /** The clock Just changed empties itself by. */
  clock = $state(Date.now());

  /**
   * Rows a write here answered with, newer than the page's read until the read catches up, the rows deleted here, and
   * the rows read whole (`whole`). A rune, and replaced on every change, so the panel draws a row the moment it lands.
   */
  #landed = $state.raw(new Map<string, Entry>());
  /** The reads in flight for a row whole, by its key and the version the page read, so a row is asked for once. */
  #asking = new Map<string, Promise<Entry | string>>();
  #queues = new Map<string, Promise<unknown>>();
  #deps: HostDeps;
  #on = '';

  constructor(deps: HostDeps) {
    this.#deps = deps;
  }

  /** The page the host is on now. Just changed is the page's, so a page opened after it reads its own. */
  forPage(slug: string) {
    if (slug === this.#on) return;
    this.#on = slug;
    this.#landed = new Map();
    this.opened = null;
    this.panelOpen = false;
    this.menuOpen = false;
    this.touched = new Map(kept.get(slug) ?? []);
    /* AND READ AGAINST NOW, or a page come back to after a while would show what aged out until the next tick. */
    this.clock = Date.now();
  }

  tickClock() {
    this.clock = Date.now();
  }

  /* ── reading a row ──────────────────────────────────────────────────────── */

  /** What the row's list has to change it by, or `null` for a list this build was never told about. */
  shapeOf(register: string): Shape | null {
    const decl = REGISTERS[register];
    return decl ? shapeOf(decl) : null;
  }

  /** The list's own name for one of its rows, for the panel's title: "Task", "Invoice". */
  oneOf(register: string): string {
    const one = REGISTERS[register]?.one ?? '';
    return one ? one.charAt(0).toUpperCase() + one.slice(1) : words.panel;
  }

  /**
   * The row as last known: a write here newer than the page's read, else the page's read. A copy at the page's own
   * version wins too where the page's read is cut short, because it is the same row with nothing cut (`whole`).
   */
  entry(row: RowAt): Entry | undefined {
    const read = entryIn(this.#deps.blocks(), row);
    const landed = this.#landed.get(keyOf(row));
    if (!landed || !read) return landed ?? read;
    return landed.version > read.version || (landed.version === read.version && read.clipped && !landed.clipped) ? landed : read;
  }

  /**
   * THE ROW WHOLE, for a reader about to change it: the row as last known where nothing in it was cut, else the
   * record's `get` of it, kept so that this version of the row is drawn whole from then on. A sentence where it cannot
   * be read, which the panel says in place of its form.
   *
   * ONE `get` AND NO WALK, at the version the page read: only the texts that may be cut are taken from it (`wholeOf`).
   * A row that moved on since is read the way its own page reads it, refs and all.
   */
  whole(row: RowAt): Promise<Entry | string> {
    const e = this.entry(row);
    if (!e) return Promise.resolve(words.gone);
    if (!e.clipped) return Promise.resolve(e);
    const key = `${keyOf(row)}@${e.version}`;
    let asked = this.#asking.get(key);
    if (!asked) {
      asked = this.#readWhole(row, e).finally(() => this.#asking.delete(key));
      this.#asking.set(key, asked);
    }
    return asked;
  }

  async #readWhole(row: RowAt, cut: Entry): Promise<Entry | string> {
    const io = this.#deps.io;
    const on = this.#on;
    const got = await createClient({ base: this.#deps.base(), ...(io ? { fetch: io } : {}) }).get(row.register, row.seq);
    if (!got.ok && 'refusal' in got) return words.unread(got.refusal.fix);
    if (got.ok && got.value === null) return words.gone;
    let whole = got.ok ? wholeOf(cut, got.value as RecordRow) : null;
    if (!whole) {
      /* THE ROW MOVED ON SINCE THE PAGE READ IT, so nothing of that read is the row now. */
      const again = await rowReader(this.#deps.base(), io).read(row.register, row.seq);
      if (again.from !== 'live') return words.unread(again.fix);
      if (!again.entry) return words.gone;
      whole = again.entry;
    }
    /* KEPT ONLY FOR THE PAGE IT WAS ASKED ON: a page opened meanwhile starts from its own read. */
    if (on === this.#on) this.#land(keyOf(row), whole);
    return whole;
  }

  /** Keeps `e` as the row's latest copy. */
  #land(key: string, e: Entry) {
    this.#landed = new Map(this.#landed).set(key, e);
  }

  /** Whether the reader may change the row: the list is declared here and `boot` lets them write it. */
  writable(row: RowAt): boolean {
    return this.shapeOf(row.register) !== null && this.#deps.may(row.register);
  }

  /** The row a renderer's row names, by the `ref` the page answer carried. */
  rowOf(r: Row): RowAt | null {
    return r.ref ? { register: r.ref.register, seq: r.ref.seq } : null;
  }

  today(): string {
    return dayOf(this.#deps.now());
  }

  /* ── the panel and the menu ─────────────────────────────────────────────── */

  /** Opens the row in the docked panel; `type` puts the caret in its words. A row no block holds does not open. */
  open(row: RowAt | null, type = false) {
    if (!row || !this.entry(row) || !this.shapeOf(row.register)) return false;
    this.dirty = false;
    this.menuOpen = false;
    this.opened = row;
    this.typing = type;
    this.panelOpen = true;
    return true;
  }

  close() {
    this.panelOpen = false;
  }

  /** THE PANEL FOLLOWS THE CURSOR as j and k walk the page, unless something in it is typed and not saved yet. */
  follow(row: RowAt | null) {
    if (!this.panelOpen || this.dirty || !row || (this.opened && keyOf(this.opened) === keyOf(row))) return;
    this.open(row);
  }

  /** Opens the row's menu at the element it was asked from: the row under the cursor, or the control pressed. */
  openMenu(row: RowAt | null, from: HTMLElement | null, mode: MenuMode = 'row') {
    if (!row || !from || !this.entry(row) || !this.shapeOf(row.register)) return false;
    const r = from.getBoundingClientRect();
    this.menu = { row, mode, at: { x: r.left, y: r.top, height: r.height } };
    this.menuOpen = true;
    return true;
  }

  /** From one step of the menu to the next: the first closes on the press, and the next opens once it has. */
  then(mode: MenuMode, from: () => HTMLElement | null) {
    const m = this.menu;
    if (!m) return;
    setTimeout(() => this.openMenu(m.row, from(), mode));
  }

  /* ── Just changed ───────────────────────────────────────────────────────── */

  #touch(row: RowAt, mark: string, gone: boolean): Touch | undefined {
    const key = keyOf(row);
    const was = this.touched.get(key);
    const e = this.entry(row);
    const t: Touch = { at: Date.now(), mark, title: e ? titleOf(e, this.shapeOf(row.register)) : (was?.title ?? `#${row.seq}`), gone };
    this.#keep(new Map(this.touched).set(key, t));
    return was;
  }

  /** A write the page's own blocks made (a tick, a moved card, a line added), kept in Just changed beside this host's. */
  note(row: RowAt, mark: string, title: string) {
    this.#keep(new Map(this.touched).set(keyOf(row), { at: Date.now(), mark, title, gone: false }));
  }

  #retouch(row: RowAt, was: Touch | undefined) {
    const next = new Map(this.touched);
    if (was) next.set(keyOf(row), was);
    else next.delete(keyOf(row));
    this.#keep(next);
  }

  #keep(next: Map<string, Touch>) {
    this.touched = next;
    kept.set(this.#on, next);
  }

  /* ── the writes ─────────────────────────────────────────────────────────── */

  #inTurn<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const next = (this.#queues.get(key) ?? Promise.resolve()).then(fn, fn);
    this.#queues.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  #sent = (row: RowAt) => (out: Wrote): Sent<Entry> => {
    if (out.ok) return { ok: true, value: out.entry };
    /* A CONFLICT DRAWS THE ROW AS IT NOW STANDS, so the next try is against its latest version. */
    if (out.why === 'conflict' && out.entry) this.#land(keyOf(row), out.entry);
    return { ok: false, fix: out.fix };
  };

  #settle = (row: RowAt) => (e: Entry) => {
    this.#land(keyOf(row), e);
    void this.#deps.reread();
  };

  /** One change to one row: drawn in Just changed now, sent in turn, and offered back for six seconds. */
  #change(row: RowAt, patch: Fields, mark: string, said: string | undefined, back = true): Change<Entry> {
    const before = this.entry(row);
    const writer = rowWriter(this.#deps.base(), this.#deps.io);
    /* THE WAY BACK IS WHAT THE ROW HELD, AND NEVER A TEXT A PAGE CUT SHORT, which put back would be saved over the
       whole of it. The menu's verbs change a state, a day or a project and keep their Undo on any row; the panel reads
       a row whole before it changes one, so its Save keeps its Undo too. */
    const inverse = back && before ? inverseOf(before, patch, REGISTERS[row.register]) : null;
    const way = inverse && before && !cutIn(before, inverse) ? inverse : null;
    let was: Touch | undefined;
    return {
      apply: () => {
        was = this.#touch(row, mark, false);
      },
      revert: () => this.#retouch(row, was),
      send: () => this.#inTurn(keyOf(row), () => writer.update(row.register, row.seq, patch, this.entry(row)?.version).then(this.#sent(row))),
      settle: this.#settle(row),
      ...(said === undefined ? {} : { said }),
      ...(way ? { undo: () => () => void this.#run(this.#change(row, way, words.marks.putBack, undefined, false)) } : {}),
    };
  }

  #run(change: Change<Entry>) {
    return optimist(this.#deps.toasts).run(change);
  }

  /** Writes `patch` to the row, with its mark in Just changed and its receipt. Answers false where nothing was sent. */
  write(row: RowAt, patch: Fields, mark: string, said: string): boolean {
    if (!this.writable(row) || Object.keys(patch).length === 0) return false;
    void this.#run(this.#change(row, patch, mark, said));
    return true;
  }

  /** DELETING IS ARCHIVING: the record keeps the row, every block leaves it out, and Put back brings it back. */
  remove(row: RowAt): boolean {
    const e = this.entry(row);
    if (!e || !this.writable(row)) return false;
    if (this.opened && keyOf(this.opened) === keyOf(row)) this.panelOpen = false;
    const title = titleOf(e, this.shapeOf(row.register));
    void this.#run(this.#removal(row, words.said.deleted(title)));
    return true;
  }

  #removal(row: RowAt, said?: string): Change<Entry> {
    const writer = rowWriter(this.#deps.base(), this.#deps.io);
    let was: Touch | undefined;
    return {
      apply: () => {
        was = this.#touch(row, words.marks.deleted, true);
      },
      revert: () => this.#retouch(row, was),
      send: () => this.#inTurn(keyOf(row), () => writer.archive(row.register, row.seq, this.entry(row)?.version).then(this.#sent(row))),
      settle: this.#settle(row),
      ...(said === undefined ? {} : { said }),
      undo: () => () => void this.#run(this.#restoral(row)),
    };
  }

  #restoral(row: RowAt, said?: string): Change<Entry> {
    const writer = rowWriter(this.#deps.base(), this.#deps.io);
    let was: Touch | undefined;
    return {
      apply: () => {
        was = this.#touch(row, words.marks.putBack, false);
      },
      revert: () => this.#retouch(row, was),
      send: () => this.#inTurn(keyOf(row), () => writer.restore(row.register, row.seq, this.entry(row)?.version).then(this.#sent(row))),
      settle: this.#settle(row),
      ...(said === undefined ? {} : { said }),
    };
  }

  /** Put back, from a deleted row's line in Just changed. */
  putBack(row: RowAt) {
    if (!this.writable(row)) return;
    const title = this.touched.get(keyOf(row))?.title ?? `#${row.seq}`;
    void this.#run(this.#restoral(row, words.said.putBack(title)));
  }

  /** The state a tick moves the row to, or back from. */
  toggle(row: RowAt): boolean {
    const e = this.entry(row);
    const s = this.shapeOf(row.register);
    if (!e || !s?.state || !s.tickTo) return false;
    const done = finished(e, s);
    const to = done ? s.reopenTo : s.tickTo;
    if (!to) return false;
    const t = titleOf(e, s);
    return this.write(row, { [s.state]: to }, done ? words.marks.reopened : words.marks.done, done ? words.said.reopened(t) : words.said.done(t));
  }

  setState(row: RowAt, state: string) {
    const e = this.entry(row);
    const s = this.shapeOf(row.register);
    if (!e || !s?.state) return;
    const said = s.said[state] ?? state;
    this.write(row, { [s.state]: state }, words.marks.moved(said), words.said.moved(titleOf(e, s), said));
  }

  setDue(row: RowAt, day: string | null) {
    const e = this.entry(row);
    const s = this.shapeOf(row.register);
    if (!e || !s?.due) return;
    const w = dueWords(titleOf(e, s), day, this.today());
    this.write(row, { [s.due]: day }, w.mark, w.said);
  }

  setProject(row: RowAt, project: number | null, name: string) {
    const e = this.entry(row);
    const s = this.shapeOf(row.register);
    if (!e || !s?.project) return;
    this.write(row, { [s.project.field]: project }, words.marks.filed(name), words.said.filed(titleOf(e, s), name));
  }

  /** The panel's Save: every field it changed, in one write, with one Undo. */
  save(row: RowAt, patch: Fields, title: string) {
    this.panelOpen = false;
    this.write(row, patch, words.marks.edited, words.said.edited(title));
  }
}
