/**
 * A `form` block, drawn from the record's answer (PGS-A15): a few labelled fields and one button that adds a row to a
 * list, drawn by `braindog-render`'s `Form.svelte` and pressed through the page's `act`, the write every declared
 * action takes, so the row lands with its receipt and its one Undo (`page-writes.ts`).
 *
 * THE RECORD HAS ALREADY CHECKED THE FORM AND CUT IT TO THE READER. Its answer carries `form`, `{ verb, register,
 * fields, submit, after }`, each field typed (the list's own type where the page gave none) and a choice's options
 * the list's own, and it sends no `form` at all to a reader who may not write (`packages/kernel/src/kinds/form.ts`).
 *
 * NOT A FENCE. A form is bound to a list, so the dialect has no rows for it (`form` is page-only in the renderer's
 * table, and a fence of one degrades). The segment is built here instead, with no rows, and the form rides on it as
 * `form_spec`: a parsed block's `form` is the word after its kind in a fence, which `Block.svelte` writes into an
 * attribute, so the answer's own key would be read as that word.
 *
 * NARROWED HERE TO THE KEYS A FORM DRAWS, and narrowed again by the drawer (`readForm`), because the answer may be a
 * record on another build. A form with no field this can read is drawn as every kind draws nothing, `opts.nothing()`.
 */

import type { Block } from 'braindog-render';

import type { KindDrawer } from './index.ts';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const words = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The form an answer carries, cut to what a form draws, or null where it has no field to draw. */
export function formOfAnswer(result: unknown): Record<string, unknown> | null {
  const form = isRecord(result) ? result.form : undefined;
  if (!isRecord(form) || !Array.isArray(form.fields)) return null;
  const register = words(form.register);
  const submit = words(form.submit);
  if (register === '' || submit === '') return null;
  const fields = form.fields.flatMap((f) => {
    if (!isRecord(f) || words(f.id) === '' || words(f.label) === '') return [];
    /* THE KEYS OF ONE FIELD A FORM DRAWS, and nothing else the record sent beside them. */
    const { id, label, type, required, options, show_when } = f;
    return [Object.fromEntries(Object.entries({ id, label, type, required, options, show_when }).filter(([, v]) => v !== undefined))];
  });
  if (fields.length === 0) return null;
  return { verb: words(form.verb) || 'row.create', register, fields, submit, after: words(form.after) || 'stay' };
}

export const form: KindDrawer = {
  draw(result, opts) {
    const spec = formOfAnswer(result);
    if (!spec) return { segments: [], refusal: opts.nothing() };
    /* THE RAW IS THE FORM'S WORDS, the labels and the button, which is what a degraded sibling or a held change would
       compare; nothing in it is ever parsed back. */
    const labels = (spec.fields as Record<string, unknown>[]).map((f) => words(f.label));
    const raw = ['```form', ...labels, words(spec.submit), '```'].join('\n');
    const segment: Block & { form_spec: Record<string, unknown> } = { type: 'block', kind: 'form', rows: [], raw, start: 0, end: raw.length, form_spec: spec };
    return { segments: [segment], refusal: null };
  },
};
