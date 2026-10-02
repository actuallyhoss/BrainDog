/**
 * Every declared field of a row, for the panel: what each box opens on, and the one patch a save sends. The boxes are
 * `RowForm`'s, drawn from the list's declaration, so a pack's list gets every field it declares and not only the five
 * `row-verbs.ts` knew by name. What a box holds and what goes back are `record/field-draft.ts`'s, the row page's own
 * rules, so a money keeps its currency and a duration its unit here as there.
 *
 * PURE, AND NODE LOADS IT, so `row-fields.test.ts` holds each rule.
 */

import { draftOf, patchOf, unchanged } from '../record/field-draft.ts';
import type { Entry, FieldDecl, Fields } from '../record/schema.ts';

/** The currency a field's amounts are in on its list, as `RowForm` reads it, or `null` where none is known. */
export type CurrencyOf = (f: FieldDecl) => string | null;

/**
 * The row's fields as a person would have typed them (an amount as its major units, a day as `YYYY-MM-DD`, a yes or no
 * as `true` or `false`), which is what `RowForm`'s `values` opens on. A field the row does not hold opens empty, so an
 * enum opens on nothing rather than on its first value.
 */
export function valuesOf(e: Entry, fields: readonly FieldDecl[], currency: CurrencyOf): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.id, f.type === 'bool' ? String(e.fields[f.id] === true) : draftOf(f, e.fields[f.id], currency(f))]));
}

/**
 * What `RowForm` handed out, back as the text in its box: it gives text as typed, a number as a number, and a money or
 * a file as the value the record stores.
 */
function typedOf(f: FieldDecl, v: unknown, currency: string | null): string | boolean {
  if (f.type === 'bool') return v === true;
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return draftOf(f, v, currency);
}

/**
 * EVERY FIELD THE PANEL CHANGED, AND NOTHING ELSE, as one patch: one write and one Undo. A box emptied is the field
 * cleared, but the title emptied is not a change, because a row needs its words.
 */
export function rowPatch(taken: Fields, e: Entry, fields: readonly FieldDecl[], title: string, currency: CurrencyOf): Fields {
  const out: Fields = {};
  for (const f of fields) {
    const cur = currency(f);
    const typed = typedOf(f, taken[f.id], cur);
    const held = e.fields[f.id];
    if (unchanged(f, typed, held, cur)) continue;
    if (f.id === title && String(typed).trim() === '') continue;
    /* AN EMPTY BOX GOES AS `null`, which is how the record is told the row no longer carries the field. */
    for (const [k, v] of Object.entries(patchOf(f, typed, held, cur))) out[k] = v === '' ? null : v;
  }
  return out;
}
