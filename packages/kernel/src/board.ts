/**
 * A BOARD: A PAGE OF WIDGETS (the widgets plan of 29 October, §3 and §7.1). Today is the first.
 *
 * A widget is a block on a board, the same declared block every page is made of, with a `size` from five
 * (`kinds/sizes.ts`) and a place in the board's order. A board is a page with `board: true`: it has no rail, and every
 * block on it is named by a `key`, so a move, a resize and the phone's own order all say which widget they mean. The
 * phone follows the laptop until somebody arranges it there, and from then keeps `phone: { order, sizes, hidden }`.
 * A widget BrainDog, Slash or an agent put on the board and nobody kept yet carries `draft: { by, why, cost? }`.
 *
 * NO GEOMETRY: an order and a size, never coordinates (`06 §7` holds); the app packs them (`lib/board/pack.ts`).
 *
 * A LEAF: imported by `declare.ts` at install, with nothing of the kernel's behind it.
 */

import type { Refusal } from '@braindog/ports';

import { BLOCK_KEY } from './block-keys.ts';
import { WIDGET_SIZES, isWidgetSize, sizesOf } from './kinds/sizes.ts';

/** The most widgets one board holds (Call 14): a board past it is a report, and Today was nine phone screens. */
export const BOARD_MOST = 16;

/** The keys of a draft's mark. */
const DRAFT_KEYS = new Set(['by', 'why', 'cost']);
/** The keys of the phone's arrangement. */
const PHONE_KEYS = new Set(['order', 'sizes', 'hidden']);

/** A kind that is the board's head and never a widget: its opening line and the line a task is typed into. */
export const headOfBoard = (b: { kind?: unknown; lead?: unknown }): boolean => b.kind === 'capture' || (b.kind === 'note' && b.lead === true);

const bad = (code: string, fix: string, at?: string, allowed?: readonly string[]): Refusal => ({
  code,
  fix,
  ...(at === undefined ? {} : { at }),
  ...(allowed === undefined ? {} : { allowed }),
});

const said = (s: string): string => `${s[0]!.toUpperCase()}${s.slice(1)}`;

/** What is wrong with one block's `size` and `draft`, on any page. `at` is the block's place, `blocks[3]`. */
export function widgetFault(id: string, at: string, block: Record<string, unknown>, board: boolean): Refusal | null {
  const kind = typeof block.kind === 'string' ? block.kind : '';
  if (block.size !== undefined) {
    if (!board) return bad('DECLARATION_INVALID', `${id}.${at} has size:, and a size is a widget's frame on a board. Say board: true on the page, or take size: off and give it a span:.`, `${at}.size`);
    if (!isWidgetSize(block.size))
      return bad('DECLARATION_INVALID', `${id}.${at}'s size is ${JSON.stringify(block.size)}; a widget is small, wide, tall, large or full.`, `${at}.size`, WIDGET_SIZES);
    const can = sizesOf(kind);
    if (!can.includes(block.size))
      return bad('OUT_OF_BOUNDS', `${id}.${at}: a ${kind} is not drawn ${block.size}. ${said(can.join(', '))} it can be.`, `${at}.size`, can);
  }
  if (block.draft !== undefined) {
    const d = block.draft;
    if (d === null || typeof d !== 'object' || Array.isArray(d))
      return bad('DECLARATION_INVALID', `${id}.${at}'s draft is { by, why }: who put it there and why, until it is kept.`, `${at}.draft`);
    const stray = Object.keys(d).find((k) => !DRAFT_KEYS.has(k));
    if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}.${at}'s draft has ${stray}:, and a draft is { by, why, cost }.`, `${at}.draft`, [...DRAFT_KEYS]);
    const { by, why, cost } = d as { by?: unknown; why?: unknown; cost?: unknown };
    if (typeof by !== 'string' || by.trim() === '' || by.length > 80) return bad('DECLARATION_INVALID', `${id}.${at}'s draft names who put it there in by:, at most 80 characters.`, `${at}.draft.by`);
    if (why !== undefined && (typeof why !== 'string' || why.length > 200)) return bad('DECLARATION_INVALID', `${id}.${at}'s draft says why in at most 200 characters.`, `${at}.draft.why`);
    if (cost !== undefined && (typeof cost !== 'string' || cost.length > 40)) return bad('DECLARATION_INVALID', `${id}.${at}'s draft cost is words, such as "1p", at most 40 characters.`, `${at}.draft.cost`);
  }
  return null;
}

/** What is wrong with a page's `board` and `phone`, read with its blocks. */
export function boardFault(id: string, body: Record<string, unknown>): Refusal | null {
  const board = body.board;
  if (board !== undefined && typeof board !== 'boolean')
    return bad('DECLARATION_INVALID', `${id}'s board is ${JSON.stringify(board)}; it is true, to lay the page out as widgets, or false.`, 'board');
  const blocks = Array.isArray(body.blocks) ? (body.blocks as unknown[]) : [];
  if (board !== true) {
    if (body.phone !== undefined) return bad('DECLARATION_INVALID', `${id} has phone:, which is a board's phone arrangement. Say board: true, or take phone: off.`, 'phone');
    return null;
  }
  if (body.layout !== undefined) return bad('DECLARATION_INVALID', `${id} is a board, and a board has no rail. Take layout: off; each widget's size says its room.`, 'layout');
  const keys: string[] = [];
  let widgets = 0;
  for (const [i, raw] of blocks.entries()) {
    if (raw === null || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    if (headOfBoard(b)) continue;
    /* A WIDGET IS A BLOCK WITH A SIZE: a block a widget stands in for (the late money under Late) is keyed and unsized. */
    if (b.size !== undefined) widgets += 1;
    if (typeof b.key !== 'string' || !BLOCK_KEY.test(b.key))
      return bad('DECLARATION_INVALID', `${id}.blocks[${i}] is a widget on a board, and every widget is named by a key:, such as key: w-7f3a.`, `blocks[${i}].key`);
    if (b.area !== undefined) return bad('DECLARATION_INVALID', `${id}.blocks[${i}] has area:, and a board has no rail.`, `blocks[${i}].area`);
    keys.push(b.key);
  }
  if (widgets > BOARD_MOST)
    return bad('OUT_OF_BOUNDS', `${id} holds ${widgets} widgets, and a board holds at most ${BOARD_MOST}. Take one off before adding another.`, 'blocks');
  const phone = body.phone;
  if (phone === undefined) return null;
  if (phone === null || typeof phone !== 'object' || Array.isArray(phone))
    return bad('DECLARATION_INVALID', `${id}'s phone is { order, sizes, hidden }: the widgets' order on a phone, their sizes there, and the ones a phone leaves out.`, 'phone');
  const p = phone as Record<string, unknown>;
  const stray = Object.keys(p).find((k) => !PHONE_KEYS.has(k));
  if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}'s phone has ${stray}:, and phone is { order, sizes, hidden }.`, 'phone', [...PHONE_KEYS]);
  const known = new Set(keys);
  for (const list of ['order', 'hidden'] as const) {
    const v = p[list];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((k) => typeof k !== 'string'))
      return bad('DECLARATION_INVALID', `${id}'s phone ${list} is a list of widget keys.`, `phone.${list}`);
    const lost = (v as string[]).find((k) => !known.has(k));
    if (lost !== undefined) return bad('DECLARATION_INVALID', `${id}'s phone ${list} names ${lost}, and no widget of the board has that key.`, `phone.${list}`, keys);
  }
  if (p.sizes !== undefined) {
    if (p.sizes === null || typeof p.sizes !== 'object' || Array.isArray(p.sizes))
      return bad('DECLARATION_INVALID', `${id}'s phone sizes is { key: size } for the widgets drawn another size on a phone.`, 'phone.sizes');
    for (const [k, s] of Object.entries(p.sizes as Record<string, unknown>)) {
      if (!known.has(k)) return bad('DECLARATION_INVALID', `${id}'s phone sizes names ${k}, and no widget of the board has that key.`, 'phone.sizes', keys);
      if (!isWidgetSize(s)) return bad('DECLARATION_INVALID', `${id}'s phone size for ${k} is ${JSON.stringify(s)}; a widget is small, wide, tall, large or full.`, 'phone.sizes', WIDGET_SIZES);
      const kind = (blocks.find((b) => (b as { key?: unknown } | null)?.key === k) as { kind?: unknown } | undefined)?.kind;
      const can = sizesOf(typeof kind === 'string' ? kind : '');
      if (!can.includes(s)) return bad('OUT_OF_BOUNDS', `${id}'s phone size for ${k}: a ${String(kind)} is not drawn ${s}. ${said(can.join(', '))} it can be.`, 'phone.sizes', can);
    }
  }
  return null;
}
