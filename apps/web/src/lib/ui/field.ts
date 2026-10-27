/**
 * ONE FIELD, said the same way on every form: a label, the control, and one line under it that is the field's help or,
 * when the record refused it, the record's own sentence ("field error replaces help in --red with danger
 * edge").
 *
 * PURE, and no rune, so `node --test` holds it: `Field.svelte` draws what these answer and decides nothing itself.
 *
 * A REFUSAL NAMES ITS FIELD IN `at`. The kernel's row write says `at: f.id` for a required field left out and the field
 * id (or `amount[2]`, `amount.amount`) for a value it will not coerce; a declaration's says `fields.<id>` or
 * `<list>.fields.<id>`. Every one of those spellings is the same field, and a refusal that names none of a form's fields
 * goes to the form's foot, said once.
 */

export type Tone = 'help' | 'danger';

/** The line under a field, and what the control is told about it. */
export type FieldLine = {
  text: string;
  tone: Tone;
  /** The line's own id, derived from the field's. */
  lineId: string;
  /** What the control's `aria-describedby` carries: the line, while there is one. */
  describedBy: string | undefined;
  /** Whether the control is `aria-invalid`: only while the line is the record's refusal. */
  invalid: boolean;
};

/** The shape every refusal this app reads shares: the sentence, and the field it is about when it is about one. */
export type Refused = { fix: string; at?: string | undefined };

const said = (text: string | null | undefined): string => (typeof text === 'string' ? text.trim() : '');

/**
 * The line under one field: AN ERROR REPLACES THE HELP, never sits beside it, because two lines under a box are read as
 * two problems. No help and no error is no line at all, and the control is described by nothing.
 */
export function fieldLine({ id, help, error }: { id: string; help?: string | null | undefined; error?: string | null | undefined }): FieldLine | null {
  const lineId = `${id}-line`;
  const wrong = said(error);
  if (wrong !== '') return { text: wrong, tone: 'danger', lineId, describedBy: lineId, invalid: true };
  const told = said(help);
  if (told !== '') return { text: told, tone: 'help', lineId, describedBy: lineId, invalid: false };
  return null;
}

/** The field a refusal's `at` names, in the spelling a form keys its fields by, or null when it names none. */
export function fieldNamed(at: string | null | undefined): string | null {
  const where = said(at);
  if (where === '') return null;
  /* `fields.amount` and `bills.fields.amount` are both `amount`; the last `fields.` wins, so a list called `fields`
     cannot hide the field after it. */
  const marker = where.lastIndexOf('fields.');
  const tail = marker === 0 || (marker > 0 && where[marker - 1] === '.') ? where.slice(marker + 'fields.'.length) : where;
  /* `amount[2]` and `amount.amount` are the field `amount`: a part of a value is still that field's. */
  const head = /^[^.[\]]+/u.exec(tail)?.[0] ?? '';
  return head === '' ? null : head;
}

/** The record's sentence for one field, when the refusal names it; otherwise nothing, and the field keeps its help. */
export function errorFor(refusal: Refused | null | undefined, fieldId: string): string | undefined {
  if (!refusal || fieldNamed(refusal.at) !== fieldId) return undefined;
  const fix = said(refusal.fix);
  return fix === '' ? undefined : fix;
}

/**
 * What the form's own foot says: the refusal's sentence when it names none of the fields the form draws, and nothing
 * when one of them already carries it. Said once, in one place.
 */
export function loose(refusal: Refused | null | undefined, fieldIds: readonly string[]): string | null {
  if (!refusal) return null;
  const fix = said(refusal.fix);
  if (fix === '') return null;
  const named = fieldNamed(refusal.at);
  return named !== null && fieldIds.includes(named) ? null : fix;
}
