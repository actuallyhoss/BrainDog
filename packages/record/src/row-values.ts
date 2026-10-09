/**
 * THE VALUES AN ENTRY'S OWN DOCUMENTS READ (PGS-B03 b). A document field is drawn by the same interpreter a declared page
 * uses, and its `{{path}}`s are the record's to answer, as a page's are. On the entry's own screen nothing answered them,
 * so a project's note that said `{{blockers.count}} in the way` printed a hole where the project page printed a number.
 *
 * EACH DOCUMENT IS READ AS A NOTE ON THAT ENTRY: one `note` block whose body is the document, read with the entry as
 * `here`, so a one-word path is the entry's own field where its list declares one and `<field>.count` counts a list field
 * of it (`pathOf` in the kernel), and every other path reads as it does on any page. Only `values` and `unnamed` are kept:
 * the screen draws the document itself, and the block around it is nothing the reader sees.
 *
 * ASKED FOR, NEVER ANSWERED UNASKED. `get` answers this only with `values: true`, so an agent's read of a row costs what it
 * did, and the screen that draws the documents is the one caller that asks.
 */

import type { BlockResult, Entry, Json, PageBlock } from '@braindog/kernel';
import type { Result } from '@braindog/ports';

/**
 * What one document's paths answer: each path the record holds a value for, and each that names nothing. `held` says the
 * caller may not see what the rest read, so the screen prints nothing for them: no dash, and no word of the path.
 */
export type DocValues = { values?: Record<string, Json>; unnamed?: string[]; held?: true };

/** An entry with what its documents read, by field id. `docs` is absent where no document holds a path. */
export type EntryValues = Entry & { docs?: Record<string, DocValues> };

/** What `docValues` asks of the kernel: a list's fields, and one block read with an entry as its `here`. */
export type DocReads = {
  register(id: string): { fields: readonly { id: string; type: string; retired?: boolean }[] } | undefined;
  block(decl: PageBlock, opts?: { walk?: number | 'last'; inbox?: boolean; here?: Entry }): BlockResult;
};

/** Whether a document's text holds a `{{` at all. A document with none is not read, so its row costs nothing more. */
const asks = (text: string): boolean => text.includes('{{');

/**
 * Whether a path's value is the entry's own: one word its list declares holding what the entry holds, or `<field>.count`
 * over a list field holding its length (`pathOf`). The value is checked against the entry, so a figure that shares a
 * field's name, read by a kernel that was not handed the entry, is never taken for the field and kept past the hold.
 */
function ownValue(entry: Entry, fields: readonly { id: string; type: string }[], path: string, v: Json): boolean {
  const parts = path.split('.');
  const field = fields.find((f) => f.id === parts[0]);
  const held = field !== undefined && Object.hasOwn(entry.fields, field.id) ? entry.fields[field.id] : undefined;
  if (field === undefined || held === undefined) return false;
  if (parts.length === 2) return parts[1] === 'count' && field.type === 'list' && Array.isArray(held) && held.length === v;
  if (parts.length !== 1) return false;
  if (held === null || typeof held !== 'object' || Array.isArray(held)) return held === v;
  const amount = (j: Json): unknown => (j !== null && typeof j === 'object' && !Array.isArray(j) ? [j.amount, j.currency] : null);
  return JSON.stringify(amount(held)) === JSON.stringify(amount(v)) && typeof held.amount === 'number';
}

/**
 * The entry `out` answers, with what each of its documents' placeholders read (`docs`). A refusal, or no entry, is handed
 * back as it came. `hold` is the caller's reach over a read block, as a page's blocks are held for her (`heldBlock` in the
 * record): a block held from her answers no values, so a document cannot be written to read a list she may not open.
 *
 * WHAT THE ENTRY ITSELF ANSWERS IS NEVER HELD. The hold judges a block by the lists and figures its paths would name on
 * a page with no entry, so `{{blockers.count}}` named a list called blockers, and a member who reads the project was
 * held from its note's stage and count (measured, with a member reading Projects alone). A path that reads the entry
 * alone is read off the entry she was just handed, so it is kept from the unheld read; every other path is the hold's.
 */
export function docValues(kernel: DocReads, out: Result<Entry | null>, hold?: (b: BlockResult) => BlockResult): Result<EntryValues | null> {
  if (!out.ok || out.value === null) return out;
  const entry = out.value;
  const decl = kernel.register(entry.register);
  if (!decl) return out;
  const docs: Record<string, DocValues> = {};
  for (const f of decl.fields) {
    if (f.type !== 'document' || f.retired === true || !Object.hasOwn(entry.fields, f.id)) continue;
    const text = entry.fields[f.id];
    if (typeof text !== 'string' || !asks(text)) continue;
    const read = kernel.block({ kind: 'note', body: text } as PageBlock, { here: entry });
    const kept = hold ? hold(read) : read;
    /* HELD IS A REFUSAL THE HOLD ADDED. The record's shell blanks `values` and keeps `unnamed`, which tells a typo from
       a list she cannot open, so a held document answers neither: only the entry's own values and the word `held`. */
    const held = kept !== read && (kept.refusals ?? []).some((r) => !(read.refusals ?? []).includes(r));
    const own = Object.entries(read.values ?? {}).filter(([path, v]) => ownValue(entry, decl.fields, path, v));
    const values = held ? Object.fromEntries(own) : own.length ? { ...Object.fromEntries(own), ...kept.values } : kept.values;
    const unnamed = held ? undefined : kept.unnamed;
    const said: DocValues = {
      ...(values && Object.keys(values).length ? { values } : {}),
      ...(unnamed && unnamed.length ? { unnamed } : {}),
      ...(held ? { held: true as const } : {}),
    };
    if (said.values || said.unnamed || said.held) docs[f.id] = said;
  }
  return Object.keys(docs).length ? { ok: true, value: { ...entry, docs } } : out;
}
