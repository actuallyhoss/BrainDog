/**
 * A card's line typed on in place: the page's writer as the `write` a `cards` block is handed.
 *
 * THE PAUSE IS THE DRAWER'S. `Cards.svelte` waits for the typing to stop (`braindog-render`'s `card-edit.ts`), trims,
 * and sends nothing when the line is as it opened, so `write` is called once per edit with what the line says then.
 * Here it is one update of that one field on that row, through the row writer every page write goes through
 * (`rows-write.ts` `update`), so the record refuses a card's line with the same sentence it would refuse the row page's.
 *
 * WITH THE ROW'S VERSION, the one the page drew it at or the one the last write here made, whichever is later, and two
 * edits on one card are sent one after the other, as `inputs-write.ts` sends two fields of one row. A conflict over
 * another field is sent once more at the version the row is at now; a conflict over this one is said, and never
 * written over.
 *
 * A REFUSAL IS SAID IN THE RECORD'S OWN WORDS, with the field named by its label: the record's sentence names a field
 * by its id (`about takes text`), and a person reads "About" on the card, so the id is put back as the label.
 *
 * NULL WHERE NOTHING MAY BE WRITTEN: an inert page, a reader who may only read the list, or a block over no list. The
 * drawer then draws every line as text, which is the renderer's rule (a control that cannot act is absent).
 *
 * PURE BUT FOR THE WRITE AND THE RE-READ, both handed in, so the test drives it with a stub.
 */

import { cardEdit, type EditColumn as DrawnColumn, type Row } from 'braindog-render';
import type { Wrote } from '../record/rows-write.ts';
import type { Fields } from '../record/schema.ts';

/** What the drawer is handed for a column it draws as a box (`braindog-render`'s `CardEdit`). */
export type CardEditAt = { field: string; max?: number };

/** A cards block's column, with the keys a line typed on reads. */
export type EditColumn = { field?: unknown; or?: unknown; metric?: unknown; as?: unknown; edit?: unknown };

/**
 * By column, the field a box writes, or null where the line is text: `Cards.svelte` reads `opts.edits` by the header's
 * columns, which are the block's own in order.
 *
 * THE DRAWER'S OWN RULE, called and not copied (`braindog-render`'s `cardEdit`): `edit: true`, one `field` and no
 * `or:` or `metric:`, a line drawn as words, and a field the list holds as text. A money or a day is never typed as
 * words. The field's own `max` goes with it, so the box holds it. This is only called where the page can write.
 */
export function cardEditsOf(columns: readonly EditColumn[], fieldOf: (id: string) => { type?: string; max?: number } | undefined): (CardEditAt | null)[] {
  return columns.map((c) => (typeof c.field === 'string' ? cardEdit(c as DrawnColumn, fieldOf(c.field), true) : null));
}

/** What a card's edit comes back as: saved, or the sentence said under the card. */
export type CardSaid = { ok: true } | { ok: false; said: string };

/** The `write` a `cards` block is handed: the card's row, the field its line draws, and what the line says. */
export type CardWrite = (row: Row, field: string, value: string) => Promise<CardSaid>;

export type CardWrites = {
  /** The row writer's `update`: `rowWriter(base).update`. */
  update: (register: string, seq: number, patch: Fields, version?: number) => Promise<Wrote>;
  /** What the row holds in `field` now, as the page read it, so a conflict over another field is sent again. */
  held: (seq: number, field: string) => unknown;
  /** The label a person reads for `field`, as the card draws it. */
  label: (field: string) => string;
  /** Reads the page again, so every figure and card over the row answers what was written. */
  reread: () => Promise<void>;
};

/** The words a card's line says that the record did not. */
export const CARD_SAID = {
  /** A card drawn from no row of the list: nothing it says can be saved. */
  nowhere: (label: string) => `${label} could not be saved from this card.`,
  /** The write threw before the record answered. */
  failed: (label: string) => `${label} was not saved. Try again in a moment.`,
  /** Somebody else changed the same line while it was typed. */
  changed: (label: string, now: string) => (now === '' ? `${label} was cleared while you typed, so yours was not saved.` : `${label} was changed to "${now}" while you typed, so yours was not saved.`),
} as const;

/** The `write` the drawer takes (`Cards.svelte`): the sentence on a refusal, nothing when the line was kept. */
export const drawnWrite =
  (write: CardWrite) =>
  async (row: Row, field: string, value: string): Promise<string | null> => {
    const out = await write(row, field, value);
    return out.ok ? null : out.said;
  };

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A stored value as one line of words, for a sentence. */
const spoken = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * The record's sentence with the field named by its label: every whole-word spelling of the id is the label, and a
 * sentence that still does not name it is said after it, as an `inputs` block says one under its field.
 * A spoken row id on the field (`things#2.about`) goes with it, since the card already says which project it is.
 */
export function namedBy(fix: string, field: string, label: string): string {
  /* THE FIELD BARE (`about`) OR SPOKEN WITH ITS ROW (`things#2.about`), as a whole word either way. */
  const words = field === '' ? fix : fix.replace(new RegExp(`(?<![\\w.#-])(?:[\\w-]+#\\d+\\.)?${escaped(field)}(?![\\w#])`, 'gu'), label);
  return words.includes(label) ? words : `${label}: ${words}`;
}

/**
 * The card's `write`, or null where the reader may not write the list.
 *
 * `writes` is null on an inert page; `may` is whether the reader may write `list`, as `may(shell, 'write', list)`
 * answers it.
 */
export function cardWrite(writes: CardWrites | null, list: string | undefined, may: boolean): CardWrite | null {
  if (writes === null || !list || !may) return null;
  const w = writes;
  /* THE VERSION EACH ROW WAS LAST WRITTEN AT HERE, and the write in flight on it, so a second edit waits for the first. */
  const versions = new Map<number, number>();
  const chains = new Map<number, Promise<unknown>>();

  async function send(row: Row, field: string, value: string): Promise<CardSaid> {
    const label = w.label(field);
    const ref = row.ref;
    if (!ref || ref.register !== list || field === '') return { ok: false, said: CARD_SAID.nowhere(label) };
    const patch: Fields = { [field]: value.trim() };
    const held = w.held(ref.seq, field);
    let wrote = await w.update(ref.register, ref.seq, patch, Math.max(ref.version, versions.get(ref.seq) ?? 0));
    /* A CONFLICT OVER ANOTHER FIELD IS NOT A CONFLICT OVER THIS ONE: sent once more, at the version the row is at now. */
    if (!wrote.ok && wrote.why === 'conflict' && wrote.entry && same(wrote.entry.fields[field], held))
      wrote = await w.update(ref.register, ref.seq, patch, wrote.entry.version);
    if (wrote.ok) versions.set(ref.seq, wrote.entry.version);
    /* READ AGAIN AFTER A CONFLICT TOO, so the card shows what the record holds now. */
    if (wrote.ok || wrote.why === 'conflict') await w.reread();
    if (wrote.ok) return { ok: true };
    if (wrote.why === 'conflict' && wrote.entry) return { ok: false, said: CARD_SAID.changed(label, spoken(wrote.entry.fields[field])) };
    return { ok: false, said: namedBy(wrote.fix, field, label) };
  }

  return (row, field, value) => {
    const at = row.ref?.seq ?? 0;
    const next = (chains.get(at) ?? Promise.resolve()).then(() => send(row, field, value));
    chains.set(at, next.catch(() => undefined));
    return next.catch((): CardSaid => ({ ok: false, said: CARD_SAID.failed(w.label(field)) }));
  };
}
