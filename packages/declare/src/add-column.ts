/**
 * A column one pack adds to another pack's block: `{ page, into: <block key>, column: { label, field? | metric?, as? } }`
 * in its manifest's `adds`, beside the whole blocks an addition already is.
 *
 * WHY A COLUMN AND NOT A BLOCK. Revenue bands works out a month, and the one place a person reads a project at a glance
 * is Portfolio's cards. A block it adds sits beside the cards and says the month again in a tile of its own; a column it
 * adds is the month on each card, and it goes when the pack goes, because it lives in the adding pack's manifest and the
 * kernel lays it in as the page is read (`packages/kernel/src/page-adds.ts`), the page's own declaration never written.
 *
 * `into` IS THE KEY THE BLOCK ANSWERS, the one a page's look leads with, hides and pins by (`blockKeyOf` in
 * `packages/kernel/src/block-keys.ts`): its declared `key`, or the hash of its kind, source and heading. A heading is
 * words a person may rename; the key is the block's name for the engine.
 *
 * ONLY THE SHAPE IS ASKED HERE, for `readAdds`' reason: whether the page and the block are there, and whether the block
 * can draw the column, only the record knows. The checks a whole block gets (a credential, a colour) are the same here,
 * since a column is drawn as it is written.
 *
 * TWO COLUMNS AT MOST INTO ONE BLOCK FROM ONE PACK (`ADD_COLUMNS_MOST`). A card four add-ons each add to is a table, and
 * the kernel holds the same two across every pack on one block.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import type { Json } from '@braindog/kernel';
import { credentialKey, credentialValue } from './credentials.ts';

/** One column a pack adds to another pack's block, as its manifest's `adds` says it. `into` is the block's key. */
export type PageColumnAddition = {
  page: string;
  into: string;
  column: { field?: string; metric?: string; label: string; as?: string };
  note?: string;
};

/** The most columns one pack adds into one block, and the most the kernel draws on one block from every pack. */
export const ADD_COLUMNS_MOST = 2;

/** The keys a column addition may carry. `note` is legal on everything a pack says (`04 §2`). */
const COLUMN_ADDITION_KEYS = ['page', 'into', 'column', 'note'];

/** The keys an added column may carry. */
const COLUMN_KEYS = ['field', 'metric', 'label', 'as'];

/* `readAdds`' own rules, copied: `index.ts` keeps them module-private, and this file is imported by it. */
const NAME = /^[a-z][a-z0-9_-]{0,63}$/;
const HEX = /^#[0-9a-fA-F]{3,8}$/u;
const CSS_COLOUR = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/iu;
const PAINTS = new Set(['colour', 'color']);

const isObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

const malformed = <T>(fix: string, at: string): Result<T> => no<T>('PACK_MALFORMED', fix, { at });

/** The first colour in a column, by key or by value, with the path to it; or `null`. A column is flat, so one level. */
function paintOf(column: Record<string, Json>): { at: string; value: string } | null {
  for (const [key, value] of Object.entries(column)) {
    if (PAINTS.has(key.toLowerCase())) return { at: key, value: typeof value === 'string' ? value : JSON.stringify(value) };
    if (typeof value === 'string' && (HEX.test(value.trim()) || CSS_COLOUR.test(value.trim()))) return { at: key, value: value.trim() };
  }
  return null;
}

/**
 * One entry of `adds` read as a column addition, or the refusal naming the part that is wrong. `at` is where the entry
 * sits in the manifest (`adds.3`), and `one` is the entry as written.
 */
export function readAddColumn(pack: string, at: string, one: unknown): Result<PageColumnAddition> {
  if (!isObject(one)) return malformed(`${at} is { page: <page id>, into: <block key>, column: { label: ... } }.`, at);
  const hasInto = one.into !== undefined;
  const hasBlock = one.block !== undefined;
  if (hasInto && hasBlock)
    return malformed(`${at} names a block and a column at once. An addition is a whole block, or one column into a block: take block or into off.`, at);
  if (!hasInto && !hasBlock) return malformed(`${at} adds nothing: name a block, or a column with the block it goes into.`, at);
  if (!hasInto) return malformed(`${at} is a block, and a column addition names the block it goes into, under into.`, `${at}.into`);
  const stray = Object.keys(one).find((k) => !COLUMN_ADDITION_KEYS.includes(k));
  if (stray !== undefined)
    return malformed(`A column addition names a page, the block it goes into and the column, so ${stray} is not one of its keys.`, `${at}.${stray}`);
  const page = one.page;
  if (typeof page !== 'string' || !page.startsWith('page.') || !NAME.test(page.slice('page.'.length)))
    return malformed(`${String(page)} is not a page id: page, a full stop and the page's name, like page.project.`, `${at}.page`);
  if (typeof one.into !== 'string' || one.into.trim() === '')
    return malformed(`${at}.into is the key of the block on ${page} the column goes into.`, `${at}.into`);
  if (one.note !== undefined && typeof one.note !== 'string') return malformed(`${at}.note is text.`, `${at}.note`);
  const column = one.column;
  if (!isObject(column)) return malformed(`${at}.column is one column, like { field: revenue, label: This month }.`, `${at}.column`);
  /* A CREDENTIAL OR A COLOUR IS SAID AS ONE before a key is called stray, so `colour:` reads as the theme's word. */
  const wrong = credentialKey(one) ?? credentialValue(one);
  if (wrong) return no('SECRET_IN_PACK', `${at} carries what looks like a credential at ${wrong}, and a pack is a file people share.`, { at: `${at}.${wrong}` });
  const painted = paintOf(column);
  if (painted)
    return no('COLOUR_OUTSIDE_THEME', `${at} sets ${painted.at} to ${painted.value}. A column names what it draws, and the theme names the colour.`, {
      at: `${at}.column.${painted.at}`,
    });
  const strayKey = Object.keys(column).find((k) => !COLUMN_KEYS.includes(k));
  if (strayKey !== undefined)
    return malformed(`An added column says its label, a field or a figure, and how it is drawn, so ${strayKey} is not one of its keys.`, `${at}.column.${strayKey}`);
  if (typeof column.label !== 'string' || column.label.trim() === '')
    return malformed(`${at}.column needs a label: the words a person reads it by, since it is not the page's own.`, `${at}.column.label`);
  if (column.field !== undefined && column.metric !== undefined)
    return malformed(`${at}.column names a field and a figure. A column draws one: take field or metric off.`, `${at}.column`);
  /* NEITHER IS A LABEL OVER NOTHING, which the kernel leaves out as it reads the page (`columnOf`), so it is said here. */
  if (column.field === undefined && column.metric === undefined)
    return malformed(`${at}.column says what it is called and not what it draws: name a field with field, or a figure with metric.`, `${at}.column`);
  if (column.field !== undefined && (typeof column.field !== 'string' || !NAME.test(column.field)))
    return malformed(`${at}.column.field is the id of a field of the block's list, like revenue.`, `${at}.column.field`);
  if (column.metric !== undefined && (typeof column.metric !== 'string' || column.metric.trim() === ''))
    return malformed(`${at}.column.metric is the id of a figure.`, `${at}.column.metric`);
  if (column.as !== undefined && (typeof column.as !== 'string' || column.as.trim() === ''))
    return malformed(`${at}.column.as is how the column is drawn, like fact or figure.`, `${at}.column.as`);
  return ok({
    page,
    into: one.into,
    column: {
      label: column.label,
      ...(typeof column.field === 'string' ? { field: column.field } : {}),
      ...(typeof column.metric === 'string' ? { metric: column.metric } : {}),
      ...(typeof column.as === 'string' ? { as: column.as } : {}),
    },
    ...(typeof one.note === 'string' ? { note: one.note } : {}),
  });
}

/**
 * Whether one pack's additions put more than `ADD_COLUMNS_MOST` columns into one block, as the refusal naming the first
 * past it, or `null`. Whole blocks are left alone; a column addition is one with `into`.
 */
export function columnsFault(adds: readonly unknown[]): Result<never> | null {
  const into = new Map<string, number>();
  for (const [n, a] of adds.entries()) {
    if (!isObject(a) || typeof a.into !== 'string' || typeof a.page !== 'string') continue;
    const key = `${a.page}\u0000${a.into}`;
    const count = (into.get(key) ?? 0) + 1;
    into.set(key, count);
    if (count > ADD_COLUMNS_MOST)
      return malformed(`A pack adds at most ${ADD_COLUMNS_MOST} columns into one block, and this is a third into ${a.into} on ${a.page}. A card with more is a table.`, `adds.${n}`);
  }
  return null;
}
