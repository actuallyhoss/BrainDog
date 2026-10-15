/**
 * What `inputs` decides, as functions both drawers call.
 *
 * Kept out of the markup for the reason `capture.ts` is: an answer here can be tested without a DOM, and two drawers
 * that each worked it out would be two answers.
 *
 * WHAT IT IS FOR. A few numbers somebody types to see what they mean: a price and three costs, and under them a
 * sentence that says whether the price holds. The sentence is not this block's. It is a `note` under `when:` or a
 * `stat` over the same row, and it answers the new figures because the host writes each change to the record's row
 * and reads the page again (`06 §8`); nothing here holds a figure the record does not.
 *
 * THE ROWS ARE WHAT A PAGE'S EVALUATOR WRITES from one row of a list, a row a field:
 *
 *   field | label | type | value
 *
 * `type` is the field's type as the record declares it, which picks the control; an `enum` may carry its choices as
 * `enum:idea,sample,made`. `value` is the row's value in the form a control takes it (`2026-10-01` for a day).
 *
 * THE CONTROLS ARE THERE ONLY WHERE THE HOST CAN WRITE. With no `oninput` the block is a `spec` of the values, drawn
 * with the spec's own classes, which is what the mirror, the export and the digest draw: the figures a verdict is
 * about stay readable where nothing can be typed. A disabled field would read as a record that is broken rather than
 * as a page that cannot write (`19 §6`), the rule `capture` and `queue` already follow.
 *
 * NO MONEY FIELD IS A NUMBER BOX. `type="number"` refuses `EGP 1,200.00` as typed, drops it to an empty string and
 * hands the host nothing, so money, a count and a share are text boxes that ask the phone for its decimal keypad.
 */

import type { Row } from './parse.ts';

/** The field types a person can type into, as the kernel's `inputsBlock` offers them. A ref, a list, a file or a document is not typed into a box. */
export const INPUT_TYPES = ['text', 'url', 'email', 'enum', 'int', 'number', 'decimal', 'money', 'pct', 'duration', 'day', 'instant', 'bool', 'boolean'] as const;

export type InputType = (typeof INPUT_TYPES)[number];

const isType = (s: string): s is InputType => (INPUT_TYPES as readonly string[]).includes(s);

/** A field id, as the kernel's declarations spell one. It is written into `name`, so it is checked rather than trusted. */
const FIELD = /^[a-z][a-z0-9_]*$/u;

/** Which control a field is drawn as. `choices` is empty on everything but a select. */
export type InputControl = {
  tag: 'input' | 'select';
  /** The `type` of an input; empty on a select. */
  type: '' | 'text' | 'url' | 'email' | 'date' | 'datetime-local' | 'checkbox';
  inputmode?: 'decimal' | 'numeric';
  choices: string[];
};

/**
 * One field as drawn. `readonly` is a field the record works out from others on the row (`derive:`), drawn as a figure
 * with its label and never a box: a write to it is refused, so a box over it would take what was typed and lose it.
 */
export type InputField<R> = { row: R; field: string; label: string; type: InputType; value: string; control: InputControl; readonly: boolean };

/**
 * The host's place to put a changed field: the row the field was drawn from, and the text as it stands.
 *
 * THE ROW AND NOT THE FIELD NAME, as `onact` and `ontick` hand back the row: the field is its first cell, and the host
 * that projected the rows may have set the row's `ref`, which is the only thing that knows which record row it was.
 * Every keystroke is handed on; waiting for a pause is the host's (`apps/web`'s `inputs-write.ts`), because only the
 * host knows what a write costs.
 */
export type OnInput = (row: Row, value: string) => void;

/** The words an `inputs` block draws that its author did not write. */
export const INPUTS_NONE = 'Nothing to fill in.';

const cell = (cells: readonly string[], i: number): string => (cells[i] ?? '').trim();

/** The type half of a type cell, and an enum's choices. */
function typeOf(value: string): { type: string; choices: string[] } {
  const at = value.indexOf(':');
  if (at < 0) return { type: value, choices: [] };
  return { type: value.slice(0, at).trim(), choices: value.slice(at + 1).split(',').map((c) => c.trim()).filter(Boolean) };
}

/** The control a type is drawn as. */
export function controlOf(type: InputType, choices: readonly string[]): InputControl {
  switch (type) {
    case 'enum':
      /* AN ENUM WITH NO CHOICES WRITTEN IS A TEXT BOX, never an empty select: a select with nothing in it cannot be
         answered, and a choice typed that the list does not hold is refused by the record in its own words. */
      return choices.length ? { tag: 'select', type: '', choices: [...choices] } : { tag: 'input', type: 'text', choices: [] };
    case 'url':
    case 'email':
      return { tag: 'input', type, choices: [] };
    case 'day':
      return { tag: 'input', type: 'date', choices: [] };
    case 'instant':
      return { tag: 'input', type: 'datetime-local', choices: [] };
    case 'bool':
    case 'boolean':
      return { tag: 'input', type: 'checkbox', choices: [] };
    case 'int':
      return { tag: 'input', type: 'text', inputmode: 'numeric', choices: [] };
    case 'number':
    case 'decimal':
    case 'money':
    case 'pct':
    case 'duration':
      return { tag: 'input', type: 'text', inputmode: 'decimal', choices: [] };
    default:
      return { tag: 'input', type: 'text', choices: [] };
  }
}

/** Whether a checkbox's value is ticked: the record's own spelling of yes, or the word a person would write. */
export const isTicked = (value: string): boolean => ['true', 'yes', '1'].includes(value.trim().toLowerCase());

/**
 * What is wrong with an `inputs` block's rows, in words, or null when nothing is.
 *
 * The parser degrades the block with this, because a field id that is not one would be written into `name` and handed
 * back to the host as the field to write, and a type with no control would draw a text box over a ref somebody then
 * types a row id into: the box the kernel refuses to offer, offered anyway.
 */
export function inputsFault(rows: readonly (readonly string[])[]): string | null {
  const seen = new Set<string>();
  for (const cells of rows) {
    const field = cell(cells, 0);
    if (!FIELD.test(field)) return `a field called "${field}", which is not a field id`;
    if (seen.has(field)) return `the field "${field}" twice`;
    seen.add(field);
    const { type } = typeOf(cell(cells, 2));
    if (!isType(type)) return `a field of a type nobody types into: "${type}"`;
  }
  return null;
}

/**
 * The fields, each with its control. Lenient where `inputsFault` is strict, for the reason `queuePlan` is: a row a host
 * built by hand whose field or type does not read is left out rather than drawn as a box that writes nowhere.
 *
 * A ROW MARKED `derived` IS READ-ONLY, as the kernel's inputs read marks a field that declares `derive:`. Only `true`
 * counts, so a host that marks nothing draws every field as it did.
 */
export function inputsPlan<R extends { cells: readonly string[]; derived?: boolean }>(rows: readonly R[]): { fields: InputField<R>[]; empty: string } {
  const fields: InputField<R>[] = [];
  for (const row of rows) {
    const field = cell(row.cells, 0);
    const { type, choices } = typeOf(cell(row.cells, 2));
    if (!FIELD.test(field) || !isType(type) || fields.some((f) => f.field === field)) continue;
    fields.push({ row, field, label: cell(row.cells, 1) || field, type, value: row.cells[3] ?? '', control: controlOf(type, choices), readonly: row.derived === true });
  }
  return { fields, empty: INPUTS_NONE };
}
