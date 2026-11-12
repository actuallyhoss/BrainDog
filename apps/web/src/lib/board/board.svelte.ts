/**
 * A BOARD AND ITS EDITOR (the widgets plan of 29 October, §3 and §5): what the board lays out, and the mode that
 * rearranges it, held in one object that Home makes and the board's parts read.
 *
 * AT REST it is the board's widgets, as the record declared them, packed on four columns or two (`pack.ts`), with each
 * widget's place for the reader to draw it in (`placeOf`).
 *
 * EDITING it holds a draft of the arrangement (the laptop's order and sizes, and the phone's own once it is arranged
 * there), every change a step of its own that Undo and Redo walk, kept on the device so a closed tab can carry on, and
 * written once on Done as the steps between where it started and where it ended (`steps.ts`). Cancel writes nothing.
 *
 * THE FEEL (§5.11): a move re-packs the board and every widget that moved slides from where it was to where it is
 * (FLIP, transforms only, 180 ms); the held one follows the pointer and the dashed cell under it is where Done puts it.
 * A resize snaps through the sizes the kind takes and the widget redraws at each while the corner is pulled. Under
 * reduced motion nothing slides: things are where they go at once.
 */

import { flushSync, tick } from 'svelte';
import { SIZE_WORDS, WIDGET_SIZES, sizesOf, type WidgetSize } from 'braindog-render';

import { still } from '../ui/motion.ts';
import { areaOf, cellsOf, feet, dropIndex, filled, heldAt, moved, pack, type Laid, type Packed } from './pack.ts';
import { phoneWidgets, type Phone, type Widget } from './board-widgets.ts';
import { stepsBetween, type Arranged, type Step } from './steps.ts';

/** How long a press is held before the board starts editing (§5.1). */
export const HOLD_MS = 400;
/** How far a press may wander and still be a hold, not a scroll. */
const HOLD_SLOP = 8;
/** How long a widget slides to its new place. */
const SLIDE_MS = 180;
const SLIDE_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** A widget taken off the board fades out where it stood over this, accelerating away. */
const LEAVE_MS = 140;

/** One widget's place for the reader: its key, its grid area and its size. */
export type Place = { key: string; area: string; size: WidgetSize; /** The frame ends where a wider one begins, and is drawn to that line (`feet`). */ foot?: true };

/** A draft kept on the device while editing, so a closed tab can carry on (§5.5). */
type Kept = { at: number; from: Arranged; now: Arranged; added: Record<string, unknown>[] };

/** The editor's own words. */
export const boardWords = {
  edit: 'Edit',
  editToday: 'Edit Today',
  done: 'Done',
  cancel: 'Cancel',
  undo: 'Undo',
  redo: 'Redo',
  addWidget: 'Add widget',
  /** Said on Needs you's and Late's corner while editing, where the others have a remove dot (T11). */
  alwaysOn: 'Always on Today',
  /** The board switch's name to a screen reader, with what it shows now (T10). */
  showing: (phone: boolean) => `Which board. Showing: ${phone ? 'Phone' : 'Laptop'}`,
  laptop: 'Laptop',
  phone: 'Phone',
  asList: 'Arrange as a list',
  asBoard: 'Arrange on the board',
  hidden: 'Hidden',
  hiddenEmpty: 'Drag a widget here to hide it. It keeps its setup.',
  remove: (name: string) => `Remove ${name}`,
  resize: (name: string) => `Resize ${name}`,
  putBack: (name: string) => `Put ${name} back`,
  moveUp: 'Move up',
  moveDown: 'Move down',
  size: 'Size',
  edited: 'Today is arranged.',
  editedNot: 'Today could not be arranged.',
  keepEditing: 'Keep editing',
  throwAway: 'Throw it away',
  draftLeft: 'You were arranging Today.',
  picked: (name: string, size: WidgetSize, at: number, of: number) => `${name}, ${SIZE_WORDS[size].toLowerCase()}, picked up, position ${at} of ${of}.`,
  movedTo: (name: string, at: number, of: number) => `${name}, position ${at} of ${of}.`,
  sizedTo: (name: string, size: WidgetSize) => `${name}, ${SIZE_WORDS[size].toLowerCase()}.`,
  dropped: (name: string, at: number, of: number) => `${name} dropped at position ${at} of ${of}.`,
  putBackSaid: (name: string) => `${name} put back where it was.`,
  removedSaid: (name: string) => `${name} hidden. Undo brings it back.`,
  changedSaid: (name: string) => `${name} changed. Done keeps it.`,
  widgetHint: 'Enter to pick up, arrows to move, Shift and arrows to resize, E to change it, Delete to hide.',
  widget: 'widget',
  quietHead: 'Nothing to show now',
  quiet: (key: string) => (key === 'arrivals' ? 'nothing new since you last looked' : 'shows here when there is something'),
} as const;

/* A JSON COPY OF THE PHONE'S ARRANGEMENT, NOT `$state.snapshot`, whose clone sits in the Svelte chunk every screen's entry
   loads (`Arrange.svelte`). It is plain JSON: an order, sizes and what is hidden. */
const clone = (a: Arranged): Arranged => ({ order: [...a.order], sizes: { ...a.sizes }, phone: a.phone ? (JSON.parse(JSON.stringify(a.phone)) as Phone) : null });

/** The size of `kind` nearest a frame of `w` by `h` cells, of the sizes it takes. */
function sizeNear(kind: string, w: number, h: number, cols: number): WidgetSize {
  const can = sizesOf(kind);
  let best = can[0] ?? 'wide';
  let far = Infinity;
  for (const s of can) {
    const c = cellsOf(s, cols);
    const d = (c.w - w) ** 2 + (c.h - h) ** 2;
    if (d < far) (far = d), (best = s);
  }
  return best;
}

export class BoardModel {
  /**
   * WHAT THE BOARD IS READ FROM, as functions the screen hands in, so the board follows the screen's own derived values
   * without a step of its own between them: the widgets as the record declared them, in order; the phone's arrangement;
   * the widgets drawn now (one with nothing to show takes no cell); and each widget's name, for the editor's words.
   */
  /* AND `quiet`: the widgets on the board with nothing to show now (Arrivals once seen). At rest they take no cell; while
     the board is edited each takes its own, drawn as a named quiet tile, so it is seen, moved, sized or hidden there and
     not left as an empty box nobody can name (audit 31 Oct, A17). */
  /* AND `rest`: the size each widget is laid at on a laptop at rest where what it holds fits a smaller frame (`rest-size.ts`,
     first-hour audit E6). Never while editing, and never what is kept. */
  src: {
    widgets: () => Widget[];
    phone: () => Phone | null;
    shown: () => ReadonlySet<string>;
    names: () => ReadonlyMap<string, string>;
    drafts?: () => ReadonlySet<string>;
    quiet?: () => ReadonlySet<string>;
    rest?: () => ReadonlyMap<string, WidgetSize>;
    /* AND `weight`: how much each widget holds, handed in only for the board as the record lays it out, never one he
       arranged, so a hole goes to the widget with the most in it (`filled`). */
    weight?: () => ReadonlyMap<string, number>;
  } = {
    widgets: () => [],
    phone: () => null,
    shown: () => new Set(),
    names: () => new Map(),
  };
  get widgets(): Widget[] {
    return this.src.widgets();
  }
  get phone(): Phone | null {
    return this.src.phone();
  }
  get shown(): ReadonlySet<string> {
    return this.src.shown();
  }
  get names(): ReadonlyMap<string, string> {
    return this.src.names();
  }
  /** Four columns, or the phone's two. */
  cols = $state(4);

  /* ── the editor ── */
  editing = $state(false);
  /** On the laptop, arranging the phone's board in a phone's frame. */
  phoneView = $state(false);
  /** The plain list in place of the board (§5.8). */
  asList = $state(false);
  /** The draft: where the edit started, where it is, and the widgets the sheet added. */
  from = $state.raw<Arranged | null>(null);
  now = $state.raw<Arranged | null>(null);
  added = $state.raw<Record<string, unknown>[]>([]);
  /** Widgets changed in the Inspector in this edit, by key: the block each is kept as on Done (a `set` step). */
  changed = $state.raw<Readonly<Record<string, Record<string, unknown>>>>({});
  /** The widget whose Inspector is open, while editing (`Inspector.svelte`, mounted by the screen). */
  inspected = $state<string | null>(null);
  /** Whether the screen mounts the Inspector, so a tap opens it rather than the size chips. */
  inspects = false;
  past = $state.raw<Arranged[]>([]);
  future = $state.raw<Arranged[]>([]);
  /** The widget held: by the pointer (`drag`) or the keyboard (`keyed`), and where it stood when picked up. */
  held = $state<string | null>(null);
  heldBy = $state<'pointer' | 'keys' | null>(null);
  /** The widget last tapped without moving, whose sizes show as a row of pictures (§5.3, a phone's way to resize). */
  tapped = $state<string | null>(null);
  /** What a screen reader is told of each move. */
  said = $state('');
  /** Kept between Done and the record's answer, so the board does not jump back while it is read again. */
  landing = $state.raw<Arranged | null>(null);
  /** Where the board's element is, for measuring a drag. */
  el: HTMLElement | null = null;
  /** The device's key the draft is kept under; set by Home. */
  draftKey: string | null = null;

  /** The arrangement drawn: the draft while editing, else what Done is landing, else the record's. */
  get arranged(): Arranged {
    return this.now ?? this.landing ?? this.declared;
  }

  /** The record's own arrangement. */
  get declared(): Arranged {
    return { order: this.widgets.map((w) => w.key), sizes: Object.fromEntries(this.widgets.map((w) => [w.key, w.size])), phone: this.phone };
  }

  /** Whether the board laid out now is the phone's: two columns, or the laptop arranging the phone. */
  get onPhone(): boolean {
    return this.cols <= 2 || this.phoneView;
  }

  /** The widgets in the order and at the sizes drawn now, the phone's on a phone. */
  get laidWidgets(): Widget[] {
    const a = this.arranged;
    const by = new Map(this.widgets.map((w) => [w.key, w]));
    for (const b of this.added) if (typeof b.key === 'string') by.set(b.key, { key: b.key, kind: String(b.kind), size: (a.sizes[b.key] ?? 'wide') as WidgetSize });
    /* A WIDGET THAT CAME WHILE EDITING (the sheet's, or an agent's draft) stands at the end of the draft. */
    const known = new Set([...(this.from?.order ?? []), ...a.order]);
    const order = [...a.order, ...this.widgets.map((w) => w.key).filter((k) => !known.has(k))];
    const laptop = order.flatMap((k) => (by.has(k) ? [{ ...by.get(k)!, size: a.sizes[k] ?? by.get(k)!.size }] : []));
    return this.onPhone ? phoneWidgets(laptop, a.phone) : laptop;
  }

  /**
   * WHILE TODAY LOADS THE BOARD HOLDS ITS CELLS (live check of 30 October, item 8): a widget that had a cell keeps it
   * until the board has settled, so a tile whose data is read again (the copy drawn first, then the record's answer, then
   * a list learnt again) does not leave its cell for a frame and slide every tile under it up and back. `Board.svelte`
   * ends the settling once the record's own answer is in and the board has been still a moment; it is packed once more
   * then, without a slide, if a widget really went.
   */
  settling = $state(true);
  /** The widgets that had a cell while settling. */
  hadCell = $state.raw<ReadonlySet<string>>(new Set());

  /** Note the widgets drawn now as having a cell, while settling. */
  holdCells(): void {
    if (!this.settling) return;
    const now = this.shown;
    if ([...now].every((k) => this.hadCell.has(k))) return;
    this.hadCell = new Set([...this.hadCell, ...now]);
  }

  /** The board has settled: what is drawn is what takes a cell from now on. */
  settle(): void {
    this.settling = false;
    this.hadCell = new Set();
  }

  /** What takes a cell: what is drawn, and while settling what had a cell. */
  private get placing(): ReadonlySet<string> {
    if (!this.settling || this.editing || this.hadCell.size === 0) return this.shown;
    return new Set([...this.hadCell, ...this.shown]);
  }

  /** Cells held for a widget that is not drawn this moment, as grid areas: drawn as a quiet empty tile. */
  get reserved(): { key: string; area: string; size: WidgetSize }[] {
    if (!this.settling || this.editing) return [];
    const shown = this.shown;
    return [...this.places.values()].filter((p) => !shown.has(p.key) && this.hadCell.has(p.key)).map((p) => ({ key: p.key, area: p.area, size: p.size }));
  }

  /** While editing, the widgets on the board with nothing to show now, in the board's order: named beside the tray. */
  get quietNow(): Widget[] {
    if (!this.editing) return [];
    const quiet = this.src.quiet?.() ?? new Set<string>();
    const shown = this.shown;
    return this.laidWidgets.filter((w) => quiet.has(w.key) && !shown.has(w.key));
  }

  /** The board packed: only what is drawn takes a cell, and an added widget always does. */
  packed: Packed = $derived.by(() => {
    const cols = this.onPhone ? 2 : 4;
    const fresh = new Set(this.added.map((b) => String(b.key)));
    const placing = this.placing;
    const rest = cols > 2 && !this.editing ? (this.src.rest?.() ?? null) : null;
    const items = this.laidWidgets
      .filter((w) => placing.has(w.key) || fresh.has(w.key) || this.held === w.key)
      .map((w) => (rest?.has(w.key) ? { ...w, size: rest.get(w.key)! } : w));
    /* A DRAFT ON THE PHONE TAKES A ROW MORE AT REST, so its Keep / Try again / Throw away bar sits in that row and the widget
       it asks about is seen whole above it (a chart under the bar was hidden). Editing, it is laid at its size. */
    const drafts = cols <= 2 && !this.editing ? (this.src.drafts?.() ?? new Set<string>()) : new Set<string>();
    return pack(drafts.size === 0 ? items : items.map((w) => (drafts.has(w.key) ? { ...w, grow: 1 } : w)), cols);
  });

  /** The widgets laid shorter at rest than their size (`rest`), which the filling never draws down a hole. */
  get short(): ReadonlySet<string> {
    if (this.onPhone || this.editing) return new Set();
    const rest = this.src.rest?.() ?? null;
    return new Set(rest === null ? [] : [...rest.keys()]);
  }

  /** Each widget's place, by key. */
  /* AT REST NO HOLE IS DRAWN (`filled`): a widget beside one is drawn across it. EDITING, THE SAME, so entering the mode
     moves nothing (audit 31 Oct, A17: People halved beside a hole the moment Edit was pressed). ONLY WHILE A WIDGET IS
     HELD, by the pointer or the keys, is the board drawn as packed, holes and all, so a drag or a resize lands in whole
     cells and the room a smaller size leaves is seen. */
  places: ReadonlyMap<string, Place> = $derived.by(() => {
    const laid = this.editing && this.held !== null ? this.packed.laid : filled(this.packed, this.onPhone ? 2 : 4, this.short, this.onPhone ? undefined : this.src.weight?.());
    const out = new Map<string, Place>(laid.map((l: Laid) => [l.key, { key: l.key, area: areaOf(l), size: l.size }]));
    /* THE FOOT OF A BAND (`feet`) says so, for the frame to be drawn to its line. Not on a phone, nor while a widget is held. */
    if (!this.onPhone && !(this.editing && this.held !== null)) for (const key of feet(out.values())) out.set(key, { ...out.get(key)!, foot: true });
    return out;
  });

  /** A widget's place, or `null` where it takes none. */
  placeOf = (key: string | undefined): Place | null => (key === undefined ? null : (this.places.get(key) ?? null));

  /** The cells no widget fills, as grid areas, under the last row that holds one. */
  get holes(): string[] {
    const cols = this.onPhone ? 2 : 4;
    const taken = new Set<string>();
    for (const l of this.packed.laid) for (let y = l.y; y < l.y + l.h; y += 1) for (let x = l.x; x < l.x + l.w; x += 1) taken.add(`${y},${x}`);
    const out: string[] = [];
    for (let y = 0; y < this.packed.rows; y += 1) for (let x = 0; x < cols; x += 1) if (!taken.has(`${y},${x}`)) out.push(`${y + 1} / ${x + 1} / ${y + 2} / ${x + 2}`);
    return out;
  }

  /** The order a keyboard walks: the packed order, which is also the place a person sees a widget at. */
  get keys(): string[] {
    return this.packed.laid.map((l) => l.key);
  }

  nameOf(key: string): string {
    return this.names.get(key) ?? boardWords.widget;
  }

  /* ── entering and leaving ── */

  /** Start editing from the board as it stands (§5.1). Nothing moves: each widget only gains its outline and handles. */
  enter(): void {
    if (this.editing) return;
    this.settle();
    const start = clone(this.declared);
    this.from = start;
    this.now = clone(start);
    this.added = [];
    this.changed = {};
    this.inspected = null;
    this.past = [];
    this.future = [];
    const before = this.hushPage();
    this.editing = true;
    this.said = '';
    void this.glideSwitch(before);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8);
  }

  /** Carry on from a draft kept on this device. */
  resume(kept: Kept): void {
    this.from = kept.from;
    this.now = kept.now;
    this.added = kept.added;
    this.past = [];
    this.future = [];
    this.editing = true;
  }

  /** Leave without writing (Esc or Cancel). */
  cancel(): void {
    const before = this.hushPage();
    this.editing = false;
    void this.glideSwitch(before);
    this.changed = {};
    this.inspected = null;
    this.from = null;
    this.now = null;
    this.added = [];
    this.held = null;
    this.heldBy = null;
    this.asList = false;
    this.phoneView = false;
    this.forget();
  }

  /** The steps Done writes; none when nothing changed. */
  steps(): Step[] {
    if (!this.from || !this.now) return [];
    /* WHAT THE INSPECTOR CHANGED FIRST, each widget's block set where it stands, then the arrangement over them. */
    const sets: Step[] = Object.entries(this.changed)
      .filter(([k]) => this.now!.order.includes(k) || this.widgets.some((w) => w.key === k))
      .map(([k, block]) => ({ set: k, block }));
    /* A widget written while editing is already on the page: the draft keeps it at its end, and the moves say so. */
    const known = new Set([...this.from.order, ...this.now.order]);
    const came = this.widgets.filter((w) => !known.has(w.key));
    if (came.length === 0) return [...sets, ...stepsBetween(this.from, this.now, this.added)];
    const from = { ...this.from, order: [...this.from.order, ...came.map((w) => w.key)], sizes: { ...this.from.sizes, ...Object.fromEntries(came.map((w) => [w.key, w.size])) } };
    const now = { ...this.now, order: [...this.now.order, ...came.map((w) => w.key)], sizes: { ...from.sizes, ...this.now.sizes } };
    return [...sets, ...stepsBetween(from, now, this.added)];
  }

  /** A widget's block changed in the Inspector, kept on Done. */
  setBlock(key: string, block: Record<string, unknown>): void {
    const { key: _k, size: _s, ...own } = block;
    this.changed = { ...this.changed, [key]: own };
    this.said = boardWords.changedSaid(this.nameOf(key));
  }

  /** Whether a widget is hidden on the phone in this edit. */
  phoneHidden(key: string): boolean {
    return (this.now?.phone?.hidden ?? this.phone?.hidden ?? []).includes(key);
  }

  /** Hide a widget on the phone, or show it there again, from the laptop or the phone alike. */
  hideOnPhone(key: string, hidden: boolean): void {
    if (!this.now) return;
    const a = this.now;
    const phone = a.phone ?? { order: this.orderNow() };
    const now = new Set(phone.hidden ?? []);
    if (hidden) now.add(key);
    else now.delete(key);
    this.change({ ...a, phone: { ...phone, hidden: [...now] } });
  }

  /** Leave the mode with what it made shown while the record takes it (`landing`). */
  close(): void {
    const before = this.hushPage();
    this.landing = this.now;
    this.editing = false;
    void this.glideSwitch(before);
    this.from = null;
    this.now = null;
    this.added = [];
    this.held = null;
    this.heldBy = null;
    this.asList = false;
    this.phoneView = false;
    this.forget();
  }

  /** The record's board landed: what Done made is what it declares now. */
  landed(): void {
    this.landing = null;
  }

  /* ── the draft, step by step ── */

  /** Apply one change as a step of its own, sliding what moved. */
  change(next: Arranged, slide = true): void {
    if (!this.now) return;
    const before = slide ? this.hushPage() : null;
    this.past = [...this.past, this.now].slice(-100);
    this.future = [];
    this.now = next;
    this.keep();
    if (before) void this.slide(before);
  }

  undo(): void {
    const last = this.past.at(-1);
    if (!last || !this.now) return;
    const before = this.hushPage();
    this.future = [this.now, ...this.future];
    this.past = this.past.slice(0, -1);
    this.now = last;
    this.keep();
    void this.slide(before);
  }

  redo(): void {
    const next = this.future[0];
    if (!next || !this.now) return;
    const before = this.hushPage();
    this.past = [...this.past, this.now];
    this.future = this.future.slice(1);
    this.now = next;
    this.keep();
    void this.slide(before);
  }

  /** The order being edited: the phone's own while the phone is arranged, else the laptop's. */
  private orderNow(): string[] {
    const a = this.now!;
    if (!this.onPhone) return [...a.order];
    return phoneWidgets(
      a.order.map((k) => ({ key: k, kind: '', size: a.sizes[k] ?? 'wide' })),
      a.phone,
    ).map((w) => w.key);
  }

  /** The draft with `order` as the order being edited. On the phone it becomes the phone's own (Call 8). */
  private withOrder(order: string[]): Arranged {
    const a = this.now!;
    if (!this.onPhone) return { ...a, order };
    return { ...a, phone: { ...(a.phone ?? {}), order } };
  }

  /** The draft with `key` at `size`, on the device being edited. */
  private withSize(key: string, size: WidgetSize): Arranged {
    const a = this.now!;
    if (!this.onPhone) return { ...a, sizes: { ...a.sizes, [key]: size } };
    const phone = a.phone ?? { order: this.orderNow() };
    return { ...a, phone: { ...phone, sizes: { ...(phone.sizes ?? {}), [key]: size } } };
  }

  /** Move `key` to `to` among the widgets in the order being edited. */
  moveTo(key: string, to: number, slide = true): void {
    if (!this.now) return;
    const order = this.orderNow();
    const next = moved(order, key, to);
    if (next.join() === order.join()) return;
    this.change(this.withOrder(next), slide);
  }

  /** Set `key`'s size, if its kind takes it. */
  sizeTo(key: string, size: WidgetSize): void {
    if (!this.now) return;
    const w = this.laidWidgets.find((x) => x.key === key);
    if (!w || w.size === size || !sizesOf(w.kind).includes(size)) return;
    this.change(this.withSize(key, size));
  }

  /** Step `key`'s size up or down through the sizes its kind takes. */
  stepSize(key: string, by: 1 | -1): void {
    const w = this.laidWidgets.find((x) => x.key === key);
    if (!w) return;
    const can = sizesOf(w.kind);
    const at = can.indexOf(w.size);
    const next = can[Math.max(0, Math.min(can.length - 1, at + by))];
    if (next && next !== w.size) {
      this.sizeTo(key, next);
      this.said = boardWords.sizedTo(this.nameOf(key), next);
    }
  }

  /**
   * Take `key` off the board, into the tray (§5.2). On the phone it is only hidden there; on the laptop the widget goes,
   * and Undo, or the tray, brings it back.
   */
  hide(key: string): void {
    if (!this.now) return;
    const a = this.now;
    if (this.onPhone) {
      const phone = a.phone ?? { order: this.orderNow() };
      this.change({ ...a, phone: { ...phone, hidden: [...new Set([...(phone.hidden ?? []), key])] } });
    } else {
      this.change({ ...a, order: a.order.filter((k) => k !== key) });
      this.added = this.added.filter((b) => b.key !== key);
    }
    this.said = boardWords.removedSaid(this.nameOf(key));
  }

  /** What the tray holds: the widgets taken off in this edit (the phone's hidden ones on the phone). */
  get tray(): Widget[] {
    if (!this.from || !this.now) return [];
    if (this.onPhone) {
      const hidden = new Set(this.now.phone?.hidden ?? []);
      return this.widgets.filter((w) => hidden.has(w.key));
    }
    const now = new Set(this.now.order);
    return this.widgets.filter((w) => !now.has(w.key));
  }

  /** Put a widget from the tray back, at the board's end. */
  unhide(key: string): void {
    if (!this.now) return;
    const a = this.now;
    if (this.onPhone && a.phone) this.change({ ...a, phone: { ...a.phone, hidden: (a.phone.hidden ?? []).filter((k) => k !== key) } });
    else if (!a.order.includes(key)) this.change({ ...a, order: [...a.order, key], sizes: { ...a.sizes, [key]: a.sizes[key] ?? this.widgets.find((w) => w.key === key)?.size ?? 'wide' } });
    this.said = boardWords.putBackSaid(this.nameOf(key));
  }

  /** A widget the sheet added (`WidgetSheet`'s `onadd`), at the board's end, drawn at once and written on Done. */
  add(block: Record<string, unknown>, size: WidgetSize): string {
    if (!this.editing) this.enter();
    const key = typeof block.key === 'string' && !this.arranged.order.includes(block.key) ? block.key : `w-${Math.random().toString(36).slice(2, 6)}`;
    const b = { ...block, key, size };
    this.added = [...this.added, b];
    const a = this.now!;
    this.change({ ...a, order: [...a.order, key], sizes: { ...a.sizes, [key]: size } });
    return key;
  }

  /* ── the device's copy of the draft ── */

  private keep(): void {
    if (!this.draftKey || !this.from || !this.now) return;
    try {
      const kept: Kept = { at: Date.now(), from: this.from, now: this.now, added: this.added };
      localStorage.setItem(this.draftKey, JSON.stringify(kept));
    } catch {
      /* A device that keeps nothing still edits; only a closed tab loses the draft. */
    }
  }

  private forget(): void {
    if (!this.draftKey) return;
    try {
      localStorage.removeItem(this.draftKey);
    } catch {
      /* nothing kept */
    }
  }

  /** A draft a closed tab left on this device, younger than a week, or `null`. */
  keptDraft(): Kept | null {
    if (!this.draftKey) return null;
    try {
      const raw = localStorage.getItem(this.draftKey);
      if (!raw) return null;
      const k = JSON.parse(raw) as Kept;
      if (!k || !k.from || !k.now || Date.now() - k.at > 7 * 86_400_000) return null;
      return k;
    } catch {
      return null;
    }
  }

  dropDraft(): void {
    this.forget();
  }

  /* ── motion ── */

  /** Where every widget is drawn now, transforms and all, by key. */
  private measure(): Map<string, DOMRect> {
    const out = new Map<string, DOMRect>();
    if (!this.el) return out;
    for (const node of this.el.querySelectorAll<HTMLElement>('[data-board-key]')) out.set(node.dataset.boardKey!, node.getBoundingClientRect());
    return out;
  }

  /**
   * FLIP: after the board re-packs, each widget that moved is drawn where it was and slides to where it is, transforms
   * only, so nothing is laid out twice in a frame. The held one is the pointer's, and never slides.
   */
  private async slide(before: Map<string, DOMRect>): Promise<void> {
    if (!this.el || before.size === 0 || still()) return;
    const nodes = new Map<string, HTMLElement>();
    for (const node of this.el.querySelectorAll<HTMLElement>('[data-board-key]')) nodes.set(node.dataset.boardKey!, node);
    await tick();
    /* A WIDGET TAKEN OFF LEAVES WHERE IT STOOD: its last drawing fades and sinks to 97% over the exit step while the rest
       slide into its room, rather than going in one frame. */
    const frame = this.el.parentElement;
    for (const [key, node] of nodes) {
      if (node.isConnected || !frame || !before.has(key)) continue;
      const was = before.get(key)!;
      const box = frame.getBoundingClientRect();
      node.style.cssText += `;position:absolute;inset:auto;left:${was.left - box.left}px;top:${was.top - box.top}px;inline-size:${was.width}px;block-size:${was.height}px;margin:0;pointer-events:none;z-index:1`;
      node.setAttribute('aria-hidden', 'true');
      node.inert = true;
      frame.append(node);
      const gone = node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: LEAVE_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
      void gone.finished.then(
        () => node.remove(),
        () => node.remove(),
      );
    }
    for (const node of this.el.querySelectorAll<HTMLElement>('[data-board-key]')) {
      const key = node.dataset.boardKey!;
      if (key === this.held && this.heldBy === 'pointer') continue;
      const was = before.get(key);
      if (!was) continue;
      for (const a of node.getAnimations()) if (a.id === 'board-slide') a.cancel();
      const now = node.getBoundingClientRect();
      /* ON TRANSFORM'S TRANSLATE ALONE, FROM ITS OLD TOP LEFT (UI pass 1 Nov): a widget that changed size takes its new
         size at once, as its outline showed while it was dragged. Scaled from its old box, its words and figures were
         drawn squashed and stretched for the length of the slide. */
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const a = node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: SLIDE_EASE });
      a.id = 'board-slide';
    }
  }

  /**
   * ENTERING AND LEAVING THE MODE GLIDES, IT DOES NOT BLINK (UI pass 1 Nov). On a phone the board's rows are as tall as
   * what each widget shows at rest and whole cells while editing, so every widget under the first changed place by up to
   * a few hundred pixels; the page's own recomposition read that as blocks crossing the board and faded each one in from
   * nothing, so the whole board blinked out and back on Edit, Cancel and Done. Now the page is held still for the switch
   * (`data-still` on the frame, which `recompose.ts` reads) and each widget slides from where it was to where it is, on
   * transform alone, its new height there at once. Nothing under reduced motion.
   */
  private hushPage(): Map<string, DOMRect> {
    const frame = this.el?.parentElement;
    if (frame) {
      frame.setAttribute('data-still', '');
      clearTimeout(this.hushed);
      this.hushed = setTimeout(() => frame.removeAttribute('data-still'), SLIDE_MS + 120);
    }
    return this.measure();
  }

  private hushed: ReturnType<typeof setTimeout> | undefined;

  private glideSwitch(before: Map<string, DOMRect>): Promise<void> {
    return this.slide(before);
  }

  /* ── the pointer: hold, drag, resize ── */

  /** One cell's width and height with the gap, and the board's top left, as drawn now. */
  private grid(): { x: number; y: number; cw: number; ch: number } | null {
    if (!this.el) return null;
    const r = this.el.getBoundingClientRect();
    const cs = getComputedStyle(this.el);
    const gap = parseFloat(cs.columnGap) || 12;
    const row = parseFloat(cs.gridAutoRows) || 128;
    const cols = this.onPhone ? 2 : 4;
    const cw = (r.width - gap * (cols - 1)) / cols;
    return { x: r.left, y: r.top, cw: cw + gap, ch: row + gap };
  }

  private drag: { key: string; node: HTMLElement; dx: number; dy: number; lastAt: number; frame: number; px: number; py: number; scroller: HTMLElement | null; sx: number; sy: number } | null = null;

  /**
   * Pick a widget up under the pointer (§5.2): it lifts, follows the pointer, and the board re-packs around the cell under
   * it as it goes, each move a step. Let go and it settles into its cell.
   */
  startDrag(key: string, e: PointerEvent, node: HTMLElement): void {
    if (!this.editing || e.button > 0) return;
    /* HELD, THE BOARD IS DRAWN PACKED, so a widget drawn across a hole takes its own size at once (`places`). The board is
       drawn that way now, before the grip is measured, and the grip is kept as the same share of the widget as the
       pointer was over, so the widget stays under the finger (review 30 Oct, R9). */
    const was = node.getBoundingClientRect();
    flushSync(() => {
      this.held = key;
      this.heldBy = 'pointer';
    });
    const { dx, dy } = heldAt(was, node.getBoundingClientRect(), e.clientX, e.clientY);
    const scroller = node.closest('main') as HTMLElement | null;
    this.drag = { key, node, dx, dy, lastAt: this.packed.laid.findIndex((l) => l.key === key), frame: 0, px: e.clientX, py: e.clientY, scroller, sx: e.clientX, sy: e.clientY };
    try {
      node.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer tracks: the drag still follows its events */
    }
    node.dataset.lifted = '';
    const move = (ev: PointerEvent) => {
      if (!this.drag) return;
      this.drag.px = ev.clientX;
      this.drag.py = ev.clientY;
      if (this.drag.frame === 0) this.drag.frame = requestAnimationFrame(() => this.dragFrame());
    };
    const up = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      this.endDrag();
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    this.follow();
  }

  /** One frame of a drag: the held widget under the pointer, the board re-packed when the cell under it changes. */
  private dragFrame(): void {
    const d = this.drag;
    if (!d) return;
    d.frame = 0;
    const g = this.grid();
    if (g) {
      /* THE CELL UNDER THE HELD WIDGET'S CENTRE, in cells from the board's top left. */
      const rect = d.node.getBoundingClientRect();
      const cx = (d.px - d.dx + rect.width / 2 - g.x) / g.cw;
      const cy = (d.py - d.dy + Math.min(rect.height, g.ch) / 2 - g.y) / g.ch;
      const to = dropIndex(this.packed, d.key, cx, cy);
      if (to !== d.lastAt) {
        d.lastAt = to;
        /* THE PLACE AMONG THE WIDGETS DRAWN, said as a place in the whole order: before the one drawn there, or last. */
        const others = this.packed.laid.filter((l) => l.key !== d.key);
        const before = others[to]?.key;
        const rest = this.orderNow().filter((k) => k !== d.key);
        const at = before === undefined ? rest.length : rest.indexOf(before);
        this.moveTo(d.key, at < 0 ? rest.length : at);
      }
      /* NEAR THE SCREEN'S EDGE THE PAGE SCROLLS. */
      const s = d.scroller;
      if (s) {
        const sr = s.getBoundingClientRect();
        const edge = 56;
        const v = d.py < sr.top + edge ? -(sr.top + edge - d.py) / 3 : d.py > sr.bottom - edge ? (d.py - (sr.bottom - edge)) / 3 : 0;
        if (v !== 0) {
          s.scrollTop += v;
          d.frame = requestAnimationFrame(() => this.dragFrame());
        }
      }
    }
    this.follow();
  }

  /** The held widget drawn under the pointer: its cell's place in the layout, and the transform from there. */
  private follow(): void {
    const d = this.drag;
    if (!d) return;
    const node = d.node;
    node.style.transform = '';
    const base = node.getBoundingClientRect();
    const tx = d.px - d.dx - base.left;
    const ty = d.py - d.dy - base.top;
    node.style.transform = `translate(${tx}px, ${ty}px) scale(${still() ? 1 : 1.03}) rotate(${still() ? 0 : 1}deg)`;
  }

  private endDrag(): void {
    const d = this.drag;
    if (!d) return;
    if (d.frame) cancelAnimationFrame(d.frame);
    this.drag = null;
    const node = d.node;
    const from = node.getBoundingClientRect();
    node.style.transform = '';
    delete node.dataset.lifted;
    const to = node.getBoundingClientRect();
    if (!still() && !this.overTray(d.px, d.py)) node.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: SLIDE_EASE });
    this.held = null;
    this.heldBy = null;
    /* A PRESS THAT DID NOT MOVE IS A TAP: its sizes show, and nothing else changes. */
    if (Math.hypot(d.px - d.sx, d.py - d.sy) < 6) {
      /* WHERE THE SCREEN HOLDS THE INSPECTOR, A TAP OPENS IT (§5.4); without it, the sizes show. */
      if (this.inspects) this.inspected = d.key;
      else this.tapped = this.tapped === d.key ? null : d.key;
      return;
    }
    this.tapped = null;
    /* LET GO OVER THE TRAY, IT IS HIDDEN, keeping its setup. */
    if (this.overTray(d.px, d.py)) return this.hide(d.key);
    void tick().then(() => (this.said = boardWords.dropped(this.nameOf(d.key), this.keys.indexOf(d.key) + 1, this.keys.length)));
  }

  /** Is the pointer over the tray? A widget let go there is hidden. */
  overTray(x: number, y: number): boolean {
    const tray = this.el?.parentElement?.querySelector('[data-board-tray]');
    if (!tray) return false;
    const r = tray.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /**
   * Pull a widget's corner (§5.3): it snaps through the sizes its kind takes, nearest the frame under the pointer, and
   * redraws at each as it goes.
   */
  startResize(key: string, e: PointerEvent, node: HTMLElement): void {
    if (!this.editing) return;
    e.stopPropagation();
    const w = this.laidWidgets.find((x) => x.key === key);
    const g = this.grid();
    if (!w || !g) return;
    const cols = this.onPhone ? 2 : 4;
    const corner = e.currentTarget as HTMLElement;
    try {
      corner.setPointerCapture(e.pointerId);
    } catch {
      /* as above */
    }
    this.held = key;
    this.heldBy = 'keys';
    let frame = 0;
    let px = e.clientX;
    let py = e.clientY;
    const step = () => {
      frame = 0;
      const r = node.getBoundingClientRect();
      const cw = Math.max(1, Math.round((px - r.left) / g.cw + 0.25));
      const ch = Math.max(1, Math.round((py - r.top) / g.ch + 0.25));
      const s = sizeNear(w.kind, Math.min(cw, cols), ch, cols);
      const now = this.laidWidgets.find((x) => x.key === key)?.size;
      if (s !== now) {
        this.sizeTo(key, s);
        this.said = boardWords.sizedTo(this.nameOf(key), s);
      }
    };
    const move = (ev: PointerEvent) => {
      px = ev.clientX;
      py = ev.clientY;
      if (frame === 0) frame = requestAnimationFrame(step);
    };
    const up = () => {
      corner.removeEventListener('pointermove', move);
      corner.removeEventListener('pointerup', up);
      corner.removeEventListener('pointercancel', up);
      if (frame) cancelAnimationFrame(frame);
      this.held = null;
      this.heldBy = null;
    };
    corner.addEventListener('pointermove', move);
    corner.addEventListener('pointerup', up);
    corner.addEventListener('pointercancel', up);
  }

  /**
   * A press held on the board at rest (§5.1): 400 ms still and the board is edited, with a short buzz where the device
   * has one. A press that moves is a scroll or a click, and nothing happens. The click a hold ends in is swallowed.
   */
  holdOn(e: PointerEvent, may: boolean): void {
    if (!may || this.editing || e.button > 0) return;
    const target = e.target as HTMLElement;
    const widget = target.closest<HTMLElement>('[data-board-key]');
    if (!widget || target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const x = e.clientX;
    const y = e.clientY;
    let fired = false;
    const timer = setTimeout(() => {
      fired = true;
      this.enter();
      /* A MOUSE HELD STILL CARRIES ON INTO A DRAG; a finger lifts and drags in the mode, so the page can still scroll. */
      if (e.pointerType === 'mouse') void tick().then(() => this.startDrag(widget.dataset.boardKey!, e, widget));
    }, HOLD_MS);
    const off = () => {
      clearTimeout(timer);
      removeEventListener('pointermove', moved, true);
      removeEventListener('pointerup', off, true);
      removeEventListener('pointercancel', off, true);
      if (fired) addEventListener('click', swallow, { capture: true, once: true });
    };
    const moved = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > HOLD_SLOP) off();
    };
    const swallow = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    addEventListener('pointermove', moved, true);
    addEventListener('pointerup', off, true);
    addEventListener('pointercancel', off, true);
  }

  /* ── the keyboard (§5.8) ── */

  /** Keys on a widget while editing: pick up, move, resize, drop, put back, hide. */
  keyOn(key: string, e: KeyboardEvent): void {
    if (!this.editing) return;
    /* THE PLACES A PERSON CAN SEE: the widgets drawn, in the order being edited. */
    const drawnNow = new Set(this.keys);
    const full = this.orderNow();
    const order = full.filter((k) => drawnNow.has(k));
    const at = order.indexOf(key);
    const name = this.nameOf(key);
    const size = this.laidWidgets.find((w) => w.key === key)?.size ?? 'wide';
    /* THE PLACE SAID IS THE PLACE DRAWN: the packed order, read after the move, since packing can pull a smaller widget ahead. */
    const seen = (): [number, number] => [this.keys.indexOf(key) + 1, this.keys.length];
    /* E OPENS THE INSPECTOR on the widget, as a tap does. */
    if (this.inspects && this.held !== key && (e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      this.inspected = key;
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (this.held === key) {
        this.held = null;
        this.heldBy = null;
        this.said = boardWords.dropped(name, ...seen());
      } else {
        this.held = key;
        this.heldBy = 'keys';
        this.pickedFrom = full.indexOf(key);
        this.said = boardWords.picked(name, size, ...seen());
      }
      return;
    }
    /* ESC PUTS A HELD WIDGET BACK and goes on to the board, which leaves without writing (§5.8): one press, not two. */
    if (e.key === 'Escape' && this.held === key) {
      e.preventDefault();
      if (this.pickedFrom !== null) this.moveTo(key, this.pickedFrom);
      this.pickedFrom = null;
      this.held = null;
      this.heldBy = null;
      this.said = boardWords.putBackSaid(name);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const next = order[at + 1] ?? order[at - 1];
      this.hide(key);
      if (next) void tick().then(() => this.focus(next));
      return;
    }
    const arrows: Record<string, 1 | -1> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    const by = arrows[e.key];
    if (by === undefined) return;
    e.preventDefault();
    if (e.shiftKey) {
      this.stepSize(key, by);
      void tick().then(() => this.focus(key));
      return;
    }
    if (this.held === key) {
      const to = Math.max(0, Math.min(order.length - 1, at + by));
      const target = order[to];
      if (target && target !== key) {
        const rest = full.filter((k) => k !== key);
        this.moveTo(key, rest.indexOf(target) + (by > 0 ? 1 : 0));
      }
      this.said = boardWords.movedTo(name, ...seen());
      void tick().then(() => this.focus(key));
    } else {
      const next = this.keys[this.keys.indexOf(key) + by];
      if (next) this.focus(next);
    }
  }

  private pickedFrom: number | null = null;

  focus(key: string): void {
    this.el?.querySelector<HTMLElement>(`[data-board-key="${CSS.escape(key)}"] [data-board-cover]`)?.focus();
  }

  /** The sizes a widget may take, in order, for the list view and the phone's sheet. */
  sizesFor(key: string): WidgetSize[] {
    const w = this.laidWidgets.find((x) => x.key === key) ?? this.widgets.find((x) => x.key === key);
    const can = w ? sizesOf(w.kind) : [...WIDGET_SIZES];
    /* ON A PHONE A FULL IS A WIDE, so it is not offered twice. */
    return this.onPhone ? can.filter((s) => s !== 'full' || !can.includes('wide')) : can;
  }

  sizeNow(key: string): WidgetSize {
    return this.laidWidgets.find((x) => x.key === key)?.size ?? 'wide';
  }
}
