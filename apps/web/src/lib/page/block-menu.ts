/**
 * THE BLOCK MENU AS A LIST, pure: what a block's own menu offers, in order, and the one change each press
 * makes to the page's look. `BlockMenu.svelte` draws the rows and writes the change; every rule lives here, so
 * `block-menu.test.ts` holds it.
 *
 * ONE PRESS, ONE KEPT CHANGE. A move, a width or a column is the next owner look by key (`arrange-look.ts`
 * `lookOfArrangement`, over the page as laid after `laidAfter`); Hide is the live look plus one hidden key
 * (`hideBody`). Each is one `setDeclaration` of `look.<page>`, and its Undo is the look before (`arrange-look.ts` `lookUndo`).
 *
 * THE OWNER'S, AS EVERY LOOK IS. A member is offered nothing here, so the list is empty and no mark is drawn.
 *
 * CHANGE TO AND REMOVE ARE THE PAGE'S, NOT ITS LOOK (PGS-B08 c, d). Each sets the page he wrote whole, through
 * `page-write.ts` `changeBlock`, with the body before as its Undo. On an add-on's page the page would become his own copy
 * and stop taking the add-on's updates, so there the menu says where Change to is instead, until a change to one block
 * is an overlay of its own. The kinds offered are `kindsFor`'s (`braindog-render`), handed in, so this file
 * stays pure and its test needs no renderer.
 *
 * AND A KEY NUMBER'S OWN ROWS (the KPI plan of 21 October, 2.5): on a number drawn by a `kpis` block, "Show on Today",
 * "Hide from Today" and "Let Today choose" set its row's `today`, and "Lead the card with this" sets its `headline` and
 * clears it on the project's other numbers. These are the number's row, not the page's look, so each is a write through
 * the app's row writer at the version each row was read at (`kpiWritesOf`, `runKpiWrites`), and its Undo puts each row
 * back at the version the write left it at.
 */

import type { IconName } from '../ui/icons.ts';
import { copy } from '../copy.ts';
import { STEPS, spanLabel, spanOf, stepsFor, type Area } from '../record/arrange.ts';
import type { LiveLook } from '../record/page-live.ts';
import type { Laid } from '../record/arrange-look.ts';
import type { RowWriter } from '../record/rows-write.ts';
import type { Fields } from '../record/schema.ts';
import { areaOf, layoutOf } from './layout.ts';
import { bodyOf, lookPage } from './look.ts';

/** One block as it is laid on the page: its key, width, column, whether it is drawn, and its kind (`arrange-look.ts`). */
export type { Laid };

/** A key a look may name (the kernel's `BLOCK_KEY`), so a block the record sent none for is offered no menu. */
const BLOCK_KEY = /^[a-z][a-z0-9_-]{0,47}$/u;

export const lookKey = (key: unknown): key is string => typeof key === 'string' && BLOCK_KEY.test(key);

/** The block a menu is for, as its head knows it. `kindName` is its kind in a person's words, lower case. */
/**
 * THE GLYPH OF EACH ROW: the block's menu says what it does the way every menu does (`things/verbs.ts`). A width, a kind and a key
 * number's own rows by the id's first word.
 */
const ROW_ICONS: Readonly<Record<string, IconName>> = {
  up: 'arrowUp',
  down: 'arrowDown',
  main: 'arrow',
  rail: 'arrow',
  width: 'rows',
  kind: 'grid',
  today: 'today',
  this: 'ask',
  change: 'edit',
  show: 'eye',
  hide: 'eye-off',
  remove: 'trash',
  'kpi-pin': 'pin',
  'kpi-hide': 'eye-off',
  'kpi-auto': 'refresh',
  'kpi-lead': 'arrowUp',
};
export const rowIcon = (id: string): IconName => ROW_ICONS[id] ?? ROW_ICONS[id.split('-')[0]!] ?? 'more';

export type MenuBlock = { key: string; kind: string; columns: number; span: number; name: string; kindName?: string };

/** Where the block stands: who is reading, its column (`null` on a page with no side column), its ends, and the widths it may take. */
export type MenuAt = { owner: boolean; area: Area | null; first: boolean; last: boolean; hidden: boolean; steps?: readonly number[]; change?: ChangeAt | undefined; today?: boolean | undefined };

/**
 * Where a block stands, and whether Change to and Remove are offered: `mine` is a page the person wrote, `false` one an
 * add-on wrote, and absent a page not read yet, where neither is offered. `kinds` is what the block may become, in its
 * order (`kindsFor`), and `kindName` a kind's name as a person says it.
 */
export type ChangeAt = { mine?: boolean | undefined; kinds?: readonly string[] | undefined; kindName?: ((kind: string) => string) | undefined };

export type ActionId = 'up' | 'down' | 'rail' | 'main' | `width-${number}` | 'hide' | 'show' | `kind-${string}` | 'change' | 'this' | 'remove' | 'today';

/**
 * One row of the menu. A width carries its `span`, and the width the block has now is `current`. A kind to change to
 * carries its `kind`; `change` is Change to where it cannot act, greyed, with where it can.
 */
export type Action = { id: ActionId; label: string; span?: number; kind?: string; current?: true; disabled?: true; why?: string };

/**
 * What a press changes: for the look, the keys in their new order, a width, a column, or hidden or shown; for the page,
 * the kind the block becomes, or the block taken off.
 */
export type Edit = { order: string[] } | { span: number } | { area: Area } | { hide: boolean } | { kind: string } | { remove: true };

type Body = Record<string, unknown>;

export const words = {
  menu: (name: string) => `More for ${name}`,
  up: 'Move up',
  down: 'Move down',
  rail: 'To the side column',
  main: 'To the main column',
  width: 'Width',
  hide: 'Hide',
  show: 'Show',
  change: 'Change to',
  changeThis: 'Change this',
  /* ANY BLOCK ON ANY PAGE GOES ON TODAY AS A WIDGET (the widgets plan of 29 October, §4.3). */
  toToday: 'Add to Today',
  onToday: (name: string) => `${name} is on Today.`,
  remove: 'Remove',
  changeElsewhere: 'Change to is on pages you made',
  tooNarrow: (kind: string) => `Too narrow for this ${kind}`,
  unnamed: 'This block',
  /* WHAT THE PRESS DID, one line over Undo: "Late is half the row." */
  movedUp: (name: string) => `${name} moved up.`,
  movedDown: (name: string) => `${name} moved down.`,
  toRail: (name: string) => `${name} is in the side column.`,
  toMain: (name: string) => `${name} is in the main column.`,
  hidden: (name: string) => `${name} is hidden.`,
  shown: (name: string) => `${name} is back on the page.`,
  sized: (name: string, span: number) => `${name} is ${SHARE[span] ?? `${span} twelfths of the row`}.`,
  changed: (name: string, kind: string) => `${name} is now ${article(kind)}.`,
  removed: (name: string) => `${name} is off the page.`,
  undone: 'Put back as it was.',
};

/** How much of the row each width is, as a person says it. */
const SHARE: Readonly<Record<number, string>> = {
  12: 'the whole row',
  8: 'two thirds of the row',
  6: 'half the row',
  4: 'a third of the row',
  3: 'a quarter of the row',
};

/** A kind's name in a sentence: lower case, with "a" or "an" before one that is not already many. */
function article(kind: string): string {
  const said = String(kind).trim().toLowerCase();
  if (said === '' || /s$/u.test(said)) return said;
  return `${/^[aeiou]/u.test(said) ? 'an' : 'a'} ${said}`;
}

/**
 * The menu's rows, in order: Move up, Move down, the other column, the five widths, Change to and its kinds, Hide,
 * Remove.
 *
 * A MOVE THAT CANNOT GO IS ABSENT, as a control that cannot act is (the renderer's rule): no Move up on the first block.
 * A WIDTH UNDER THE KIND'S FLOOR IS THERE AND GREYED, with the reason, because five widths are the board's and a person
 * who sees four learns the board has four (`arrange.ts` `stepsFor`, refused and never clamped).
 */
export function actionsFor(block: MenuBlock, at: MenuAt): Action[] {
  if (!at.owner) return [];
  const steps = at.steps ?? stepsFor(block.kind, block.columns);
  const out: Action[] = [];
  if (!at.first) out.push({ id: 'up', label: words.up });
  if (!at.last) out.push({ id: 'down', label: words.down });
  if (at.area === 'rail') out.push({ id: 'main', label: words.main });
  else if (at.area === 'main') out.push({ id: 'rail', label: words.rail });
  for (const span of STEPS) {
    const row: Action = { id: `width-${span}`, label: spanLabel(span), span };
    if (span === block.span) row.current = true;
    if (!steps.includes(span)) Object.assign(row, { disabled: true, why: words.tooNarrow(block.kindName ?? 'block') });
    out.push(row);
  }
  out.push(...changesFor(block, at.change));
  /* ADD TO TODAY, on every page but Today itself, where the block already is. */
  if (at.today === true) out.push({ id: 'today', label: words.toToday });
  /* ONE LINE ASKED ABOUT THIS BLOCK, on a page he wrote: it edits the page's own source (`change-this.ts`). */
  if (at.change?.mine === true) out.push({ id: 'this', label: words.changeThis });
  out.push(at.hidden ? { id: 'show', label: words.show } : { id: 'hide', label: words.hide });
  if (at.change?.mine === true) out.push({ id: 'remove', label: words.remove });
  return out;
}

/**
 * CHANGE TO, as the kinds the block may become by name, on a page the person wrote; one greyed row saying where it is,
 * on an add-on's page; and nothing on a page not read yet, or for a block that can become nothing else.
 */
function changesFor(block: MenuBlock, change: ChangeAt | undefined): Action[] {
  if (!change || change.mine === undefined) return [];
  const kinds = (change.kinds ?? []).filter((k) => k !== block.kind);
  if (kinds.length === 0) return [];
  if (!change.mine) return [{ id: 'change', label: words.change, disabled: true, why: words.changeElsewhere }];
  const named = change.kindName ?? ((k: string) => k);
  return kinds.map((kind) => ({ id: `kind-${kind}` as const, label: named(kind), kind }));
}

/**
 * What a press changes, or `null` where it changes nothing: a greyed width, the width the block has, a move with
 * nowhere to go, or a block the page does not lay.
 *
 * A MOVE STEPS OVER WHAT THE READER CANNOT SEE: a block in the other column, and a block that is not drawn, so Move up
 * puts it above the block drawn above it (`arrange.ts` `nearestInArea`).
 */
export function editOf(action: Action, block: MenuBlock, page: { laid: readonly Laid[] }): Edit | null {
  if (action.disabled) return null;
  const at = page.laid.findIndex((l) => l.key === block.key);
  if (at < 0) return null;
  if (action.id === 'up' || action.id === 'down') {
    const to = nearestDrawn(page.laid, at, action.id === 'up' ? -1 : 1);
    if (to === at) return null;
    const keys = page.laid.map((l) => l.key);
    const [held] = keys.splice(at, 1);
    keys.splice(to, 0, held!);
    return { order: keys };
  }
  if (action.id === 'rail' || action.id === 'main') return (page.laid[at]!.area ?? 'main') === action.id ? null : { area: action.id };
  if (action.id === 'hide' || action.id === 'show') return { hide: action.id === 'hide' };
  if (action.id === 'remove') return { remove: true };
  if (action.id === 'change' || action.id === 'this' || action.id === 'today') return null;
  if (action.kind !== undefined) return action.kind === block.kind ? null : { kind: action.kind };
  if (action.span === undefined || action.current || page.laid[at]!.span === action.span) return null;
  return { span: action.span };
}

/**
 * The nearest drawn block in the same column, one step up or down; `at` itself when there is none.
 *
 * A HEADING IS A WALL. A look orders blocks within the heading they sit under (the kernel's `applyLook`), so a move past
 * one would be a write the page then draws unchanged, and Move up a button that does nothing.
 */
function nearestDrawn(laid: readonly Laid[], at: number, step: -1 | 1): number {
  const area = laid[at]?.area ?? 'main';
  for (let n = at + step; n >= 0 && n < laid.length; n += step) {
    const l = laid[n]!;
    if ((l.area ?? 'main') !== area || !l.drawn) continue;
    return l.kind === 'section' ? at : n;
  }
  return at;
}

/** Where a block stands among the blocks laid: whether a move up or down has anywhere to go, and its column. */
export function placeOf(laid: readonly Laid[], key: string, rail: boolean): { first: boolean; last: boolean; area: Area | null } | null {
  const at = laid.findIndex((l) => l.key === key);
  if (at < 0) return null;
  return { first: nearestDrawn(laid, at, -1) === at, last: nearestDrawn(laid, at, 1) === at, area: rail ? (laid[at]!.area ?? 'main') : null };
}

/**
 * The page as the record answered it, laid: each block a look may name, in the order the record drew them, at the width
 * the board draws it (`arrange.ts` `spanOf`) and, on a page with a side column, in its column.
 */
export function laidOf(
  blocks: readonly { kind: string; key?: unknown; span?: number | undefined; area?: unknown; columns?: readonly unknown[] | undefined; drawn?: boolean }[],
  page: unknown,
): Laid[] {
  const layout = layoutOf(page);
  return blocks.flatMap((b) => {
    if (!lookKey(b.key)) return [];
    const laid: Laid = { key: b.key, span: spanOf(b.kind, b.span, b.columns?.length ?? 0), drawn: b.drawn !== false, kind: b.kind };
    if (layout) laid.area = areaOf(b, layout);
    return [laid];
  });
}

/** The page as laid once a move, a width or a column is made: what `lookOfArrangement` is handed. */
export function laidAfter(laid: readonly Laid[], key: string, edit: Edit): Laid[] {
  if ('order' in edit) {
    const by = new Map(laid.map((l) => [l.key, l]));
    return edit.order.map((k) => by.get(k)).filter((l): l is Laid => l !== undefined);
  }
  if ('span' in edit) return laid.map((l) => (l.key === key ? { ...l, span: edit.span } : l));
  if ('area' in edit) return laid.map((l) => (l.key === key ? { ...l, area: edit.area } : l));
  return [...laid];
}

/**
 * HIDE IS THE LIVE LOOK PLUS ONE HIDDEN KEY, and Show the live look less one. The person's own look keeps all it held;
 * the rules' or Slash's gives up its headline and next action, which are the engine's to write around (`mergeLook`), and
 * its order, so hiding a block does not freeze the engine's arrangement of that moment as the person's. A pinned block
 * that is hidden is no longer pinned, since the record refuses both.
 */
export function hideBody(slug: string, live: LiveLook | null, key: string, hide: boolean): Body {
  const own = live?.by === 'owner';
  const was = own ? live.hide : [];
  const hidden = hide ? [...new Set([...was, key])] : was.filter((k) => k !== key);
  /* THE PERSON'S WIDTHS, COLUMNS AND GROUPING RIDE ALONG where the record answered them, so a hide never undoes a width. */
  const held = (own ? live : {}) as Record<string, unknown>;
  const extra = Object.fromEntries(['span', 'area', 'group'].flatMap((k) => (isMap(held[k]) ? [[k, { ...(held[k] as object) }]] : [])));
  return { ...bodyOf(lookPage(slug, live), {
    page: live?.page ?? slug,
    basis: live?.basis ?? null,
    lead: own && live.lead !== key ? live.lead : null,
    order: own ? live.order : [],
    hide: hidden,
    headline: own ? live.headline : null,
    next: own ? live.next : null,
    pinned: own ? live.pinned.filter((k) => !(hide && k === key)) : [],
    by: 'owner',
  }), ...extra };
}

const isMap = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0;

/** The line a press says over its Undo. */
export function saidOf(edit: Edit, name: string, action?: ActionId, kindName?: string): string {
  const who = name.trim() || words.unnamed;
  if ('kind' in edit) return words.changed(who, kindName ?? edit.kind);
  if ('remove' in edit) return words.removed(who);
  if ('span' in edit) return words.sized(who, edit.span);
  if ('area' in edit) return edit.area === 'rail' ? words.toRail(who) : words.toMain(who);
  if ('hide' in edit) return edit.hide ? words.hidden(who) : words.shown(who);
  return action === 'down' ? words.movedDown(who) : words.movedUp(who);
}

/* ── a key number's own rows ─────────────────────────────────────────────────────────────────────────────────── */

/** A key number as its row is held: its number, the version it was read at, and its fields. */
export type KpiHeld = { seq: number; version: number; fields: Fields };

export type KpiActionId = 'kpi-pin' | 'kpi-hide' | 'kpi-auto' | 'kpi-lead';

/** One row of a key number's menu. */
export type KpiAction = { id: KpiActionId; label: string };

/** One write a press makes: the row, the version it is written at, what changes, and what puts it back. */
export type KpiWrite = { seq: number; version: number; patch: Fields; undo: Fields };

/** A write that landed: the row, the version it now holds, and what puts it back. */
export type KpiDone = { seq: number; version: number; undo: Fields };

const TODAY_OF: Readonly<Record<Exclude<KpiActionId, 'kpi-lead'>, 'pinned' | 'hidden' | 'auto'>> = { 'kpi-pin': 'pinned', 'kpi-hide': 'hidden', 'kpi-auto': 'auto' };

const todayOf = (fields: Fields): 'pinned' | 'hidden' | 'auto' => (fields.today === 'pinned' || fields.today === 'hidden' ? fields.today : 'auto');

/** A number the menu may act on: kept (not a suggestion), live, and not deleted. */
const kept = (fields: Fields): boolean => fields.draft !== true && fields.state !== 'retired' && (fields.deleted_at ?? null) === null;

/** The project a number is on, as its row holds it: a row id, or a number once the row writer has named it. */
const thingOf = (fields: Fields): string | null => (typeof fields.thing === 'string' || typeof fields.thing === 'number' ? String(fields.thing) : null);

/**
 * THE MENU OF ONE KEY NUMBER, in order: the two ways it is not on Today now, then "Lead the card with this" unless it
 * already does. A person who may not write it is offered nothing, and so is a suggestion not kept yet: Keep or Not this
 * is its only question.
 */
export function kpiActionsFor(kpi: Pick<KpiHeld, 'fields'>, may: boolean): KpiAction[] {
  if (!may || !kept(kpi.fields)) return [];
  const today = todayOf(kpi.fields);
  const out: KpiAction[] = [];
  if (today !== 'pinned') out.push({ id: 'kpi-pin', label: copy.kpiMenuPin });
  if (today !== 'hidden') out.push({ id: 'kpi-hide', label: copy.kpiMenuHide });
  if (today !== 'auto') out.push({ id: 'kpi-auto', label: copy.kpiMenuAuto });
  if (kpi.fields.headline !== true) out.push({ id: 'kpi-lead', label: copy.kpiMenuLead });
  return out;
}

/**
 * THE WRITES ONE PRESS MAKES, in the order they go: empty where the press changes nothing.
 *
 * TODAY IS ONE ROW. LEAD IS THE PROJECT'S: every other kept number on the same project that leads its card gives it up
 * first, and then this one takes it, so a press that is turned down half way never leaves two numbers leading one card.
 */
export function kpiWritesOf(action: KpiActionId, kpi: KpiHeld, others: readonly KpiHeld[]): KpiWrite[] {
  if (action !== 'kpi-lead') {
    const to = TODAY_OF[action];
    const was = todayOf(kpi.fields);
    return to === was ? [] : [{ seq: kpi.seq, version: kpi.version, patch: { today: to }, undo: { today: was } }];
  }
  if (kpi.fields.headline === true) return [];
  const project = thingOf(kpi.fields);
  const led = others.filter((o) => o.seq !== kpi.seq && project !== null && thingOf(o.fields) === project && o.fields.headline === true && kept(o.fields));
  return [
    ...led.map((o) => ({ seq: o.seq, version: o.version, patch: { headline: false }, undo: { headline: true } })),
    { seq: kpi.seq, version: kpi.version, patch: { headline: true }, undo: { headline: false } },
  ];
}

/** What a press did, one line over its Undo, naming the number by its name. */
export function kpiSaidOf(action: KpiActionId, name: string): string {
  const who = name.trim() || copy.kpiUnnamed;
  if (action === 'kpi-pin') return copy.kpiPinnedSaid(who);
  if (action === 'kpi-hide') return copy.kpiHiddenSaid(who);
  if (action === 'kpi-auto') return copy.kpiAutoSaid(who);
  return copy.kpiLeadSaid(who);
}

/**
 * THE WRITES, ONE AT A TIME THROUGH THE APP'S ROW WRITER, each at the version its row was read at. The first the record
 * turns down stops the rest, and what had landed is answered beside its sentence, so the caller puts it back.
 */
export async function runKpiWrites(
  writer: Pick<RowWriter, 'update'>,
  list: string,
  writes: readonly KpiWrite[],
): Promise<{ ok: true; done: KpiDone[] } | { ok: false; fix: string; done: KpiDone[] }> {
  const done: KpiDone[] = [];
  for (const w of writes) {
    const out = await writer.update(list, w.seq, w.patch, w.version);
    if (!out.ok) return { ok: false, fix: out.fix, done };
    done.push({ seq: w.seq, version: out.entry.version, undo: w.undo });
  }
  return { ok: true, done };
}

/** Puts back what landed, last first, each at the version the write left it at. The record's sentence where it will not. */
export async function undoKpiWrites(writer: Pick<RowWriter, 'update'>, list: string, done: readonly KpiDone[]): Promise<{ ok: true } | { ok: false; fix: string }> {
  for (const d of [...done].reverse()) {
    const out = await writer.update(list, d.seq, d.undo, d.version);
    if (!out.ok) return { ok: false, fix: out.fix };
  }
  return { ok: true };
}
